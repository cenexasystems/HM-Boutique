-- ============================================================================
-- HM BOUTIQUE — ALL UPDATES IN ONE MIGRATION
-- Run once in the Supabase SQL Editor. Safe to re-run (every step is
-- idempotent: IF NOT EXISTS / CREATE OR REPLACE / guarded backfills).
--
-- Only the database changes made for this round of work (earlier migrations -
-- expenses, lifecycle, catalogue, performance indexes, measurements tables,
-- the original mark_credit_order_paid - are NOT repeated here):
--   1. orders / advance_orders columns used by the billing, credit, advance,
--      GST-inclusive, discount/coupon, split-payment and due-date features
--   2. Backfill of old rows so older bills show the same split-up as new ones
--      (GST %, manual vs coupon discount, due-date columns in sync)
--   3. settle_credit_order(): credit settlement with payment method + split
--   4. Indexes for analytics, outstanding credits and due-date reminders
--
-- NOTE ON WHERE EXTRA DETAILS LIVE
--   The app stores GST %, manual/coupon discount amounts, advance/settlement
--   payment split and the settlement method inside orders.split_details (jsonb):
--     { cash, gpay,                         -- split payment at billing
--       gst_percentage,
--       manual_discount, coupon_discount,   -- rupees
--       advance_paid, advance_mode, advance_cash, advance_gpay,
--       settle: { mode, cash, gpay, amount, at } }
--   so no further schema change is needed for those.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. ORDERS TABLE: make sure every column the app reads/writes exists
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'public.orders does not exist - create the base schema first';
  END IF;
END $$;

ALTER TABLE public.orders
  -- identity / customer
  ADD COLUMN IF NOT EXISTS invoice_no              TEXT,
  ADD COLUMN IF NOT EXISTS customer_name           TEXT,
  ADD COLUMN IF NOT EXISTS phone                   TEXT,
  ADD COLUMN IF NOT EXISTS address                 TEXT,
  ADD COLUMN IF NOT EXISTS order_mode              TEXT,
  ADD COLUMN IF NOT EXISTS order_type              TEXT,
  ADD COLUMN IF NOT EXISTS reference_number        TEXT,
  ADD COLUMN IF NOT EXISTS notes                   TEXT,
  ADD COLUMN IF NOT EXISTS items                   JSONB DEFAULT '[]'::jsonb,
  -- amounts
  ADD COLUMN IF NOT EXISTS subtotal                NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total                   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount         NUMERIC(12,2) DEFAULT 0,   -- manual + coupon
  ADD COLUMN IF NOT EXISTS manual_discount_amount  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_type    TEXT,                      -- 'percent' | 'flat'
  ADD COLUMN IF NOT EXISTS manual_discount_value   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code             TEXT,
  ADD COLUMN IF NOT EXISTS gst_enabled             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_gst               NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_amount              NUMERIC(12,2) DEFAULT 0,   -- GST is always inclusive
  ADD COLUMN IF NOT EXISTS delivery_charge         NUMERIC(12,2) DEFAULT 0,
  -- payment
  ADD COLUMN IF NOT EXISTS payment_mode            TEXT,
  ADD COLUMN IF NOT EXISTS payment_method          TEXT,
  ADD COLUMN IF NOT EXISTS cash_received           NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid             NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due             NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS split_details          JSONB DEFAULT '{}'::jsonb,
  -- credit sales
  ADD COLUMN IF NOT EXISTS is_credit               BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_status           TEXT,
  ADD COLUMN IF NOT EXISTS due_date                DATE,
  ADD COLUMN IF NOT EXISTS credit_due_date         DATE,
  ADD COLUMN IF NOT EXISTS credit_paid_at          TIMESTAMPTZ,
  -- advance orders mirrored into orders (DEP-... rows)
  ADD COLUMN IF NOT EXISTS is_advance              BOOLEAN DEFAULT false,
  -- bookkeeping
  ADD COLUMN IF NOT EXISTS created_at              TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ DEFAULT NOW();

-- split_details must be an object so the reader code never sees NULL / scalars
UPDATE public.orders SET split_details = '{}'::jsonb WHERE split_details IS NULL;


-- ----------------------------------------------------------------------------
-- 1b. ADVANCE_ORDERS TABLE (only if the table exists in this database)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.advance_orders') IS NOT NULL THEN
    ALTER TABLE public.advance_orders
      ADD COLUMN IF NOT EXISTS deposit_id          TEXT,
      ADD COLUMN IF NOT EXISTS products            JSONB,
      ADD COLUMN IF NOT EXISTS remarks             TEXT,
      ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_order_id  TEXT,
      ADD COLUMN IF NOT EXISTS invoice_number      TEXT,
      ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_advance_orders_deposit_id ON public.advance_orders(deposit_id);
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. BACKFILL OLD ROWS
-- ----------------------------------------------------------------------------

-- 2a. Credit flags (anything billed on credit is tracked as a credit sale)
UPDATE public.orders
SET is_credit = true,
    credit_status = COALESCE(NULLIF(credit_status, ''), 'outstanding')
WHERE (UPPER(COALESCE(payment_mode, '')) = 'CREDIT' OR UPPER(COALESCE(payment_method, '')) = 'CREDIT')
  AND (is_credit IS DISTINCT FROM true OR credit_status IS NULL OR credit_status = '');

-- 2b. Due dates: the app reads due_date first, so both columns must agree.
--     (Whichever one was saved most recently wins; credit_due_date is what the
--      "change due date" screens write last.)
DO $$
BEGIN
  UPDATE public.orders
  SET due_date = credit_due_date
  WHERE credit_due_date IS NOT NULL AND due_date::text IS DISTINCT FROM credit_due_date::text;

  UPDATE public.orders
  SET credit_due_date = due_date
  WHERE credit_due_date IS NULL AND due_date IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  -- column types differ in this database; skip rather than abort the migration
  RAISE NOTICE 'Due-date sync skipped: %', SQLERRM;
END $$;

-- 2c. GST %: old rows never stored it. Derive it from the inclusive split
--     (taxable = total - delivery - gst) and round to a whole percent.
UPDATE public.orders o
SET split_details = COALESCE(o.split_details, '{}'::jsonb)
      || jsonb_build_object(
           'gst_percentage',
           ROUND(
             (COALESCE(o.gst_amount, o.total_gst, 0)
               / NULLIF(COALESCE(o.total, 0) - COALESCE(o.delivery_charge, 0) - COALESCE(o.gst_amount, o.total_gst, 0), 0)
             ) * 100
           )
         )
WHERE COALESCE(o.gst_amount, o.total_gst, 0) > 0
  AND NOT (COALESCE(o.split_details, '{}'::jsonb) ? 'gst_percentage')
  AND COALESCE(o.total, 0) - COALESCE(o.delivery_charge, 0) - COALESCE(o.gst_amount, o.total_gst, 0) > 0;

-- 2d. Discount split: rows without a coupon had their whole discount_amount as a
--     manual discount; record it explicitly so every bill shows the same lines.
UPDATE public.orders o
SET split_details = COALESCE(o.split_details, '{}'::jsonb)
      || jsonb_build_object('manual_discount', COALESCE(o.discount_amount, 0), 'coupon_discount', 0)
WHERE COALESCE(o.discount_amount, 0) > 0
  AND (o.coupon_code IS NULL OR o.coupon_code = '')
  AND NOT (COALESCE(o.split_details, '{}'::jsonb) ? 'manual_discount');

-- 2e. Credit bills billed with nothing received must show amount_paid = 0 and
--     the full balance (older code sometimes defaulted received to the total).
UPDATE public.orders
SET amount_paid = 0,
    balance_due = COALESCE(total, 0)
WHERE is_credit = true
  AND UPPER(COALESCE(status, '')) <> 'COMPLETED'
  AND COALESCE(credit_status, 'outstanding') <> 'paid'
  AND COALESCE(is_advance, false) = false
  AND COALESCE(amount_paid, 0) >= COALESCE(total, 0)
  AND COALESCE(total, 0) > 0;


-- ----------------------------------------------------------------------------
-- 3. CREDIT SETTLEMENT FUNCTION
-- ----------------------------------------------------------------------------

-- Full settlement: records HOW the balance was paid (Cash / GPay / Split),
--     validates a split against the balance, and closes the bill in one step.
CREATE OR REPLACE FUNCTION public.settle_credit_order(
  p_order_id TEXT,
  p_mode     TEXT DEFAULT 'CASH',     -- CASH | GPAY | SPLIT
  p_cash     NUMERIC DEFAULT 0,       -- used when p_mode = 'SPLIT'
  p_gpay     NUMERIC DEFAULT 0        -- used when p_mode = 'SPLIT'
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.orders;
  v_json    JSONB;
  v_total   NUMERIC;
  v_paid    NUMERIC;
  v_balance NUMERIC;
  v_mode    TEXT := UPPER(COALESCE(NULLIF(p_mode, ''), 'CASH'));
  v_cash    NUMERIC;
  v_gpay    NUMERIC;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id::text = p_order_id OR invoice_no = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_mode NOT IN ('CASH', 'GPAY', 'SPLIT') THEN
    RAISE EXCEPTION 'Invalid payment mode %', p_mode;
  END IF;

  v_json    := to_jsonb(v_order);
  v_total   := COALESCE((v_json->>'total')::numeric, (v_json->>'grand_total')::numeric, 0);
  v_paid    := COALESCE((v_json->>'amount_paid')::numeric, 0);
  v_balance := GREATEST(0, ROUND(v_total - v_paid, 2));

  IF v_mode = 'SPLIT' THEN
    v_cash := COALESCE(p_cash, 0);
    v_gpay := COALESCE(p_gpay, 0);
    IF ABS(v_cash + v_gpay - v_balance) > 0.009 THEN
      RAISE EXCEPTION 'Split amounts (% + %) must add up to the balance due (%)', v_cash, v_gpay, v_balance;
    END IF;
  ELSIF v_mode = 'GPAY' THEN
    v_cash := 0;
    v_gpay := v_balance;
  ELSE
    v_cash := v_balance;
    v_gpay := 0;
  END IF;

  UPDATE public.orders
  SET status          = 'COMPLETED',
      credit_status   = 'paid',
      balance_due     = 0,
      amount_paid     = v_total,
      cash_received   = v_total,
      credit_paid_at  = NOW(),
      split_details   = COALESCE(split_details, '{}'::jsonb)
                        || jsonb_build_object(
                             'settle',
                             jsonb_build_object(
                               'mode',   v_mode,
                               'cash',   v_cash,
                               'gpay',   v_gpay,
                               'amount', v_balance,
                               'at',     to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                             )
                           ),
      updated_at      = NOW()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_credit_order(TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated, anon, public;


-- ----------------------------------------------------------------------------
-- 4. INDEXES
-- ----------------------------------------------------------------------------
-- Analytics (completed sales by date / mode) and product excel export
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_no        ON public.orders(invoice_no);
CREATE INDEX IF NOT EXISTS idx_orders_order_type        ON public.orders(order_type);

-- Outstanding credits + due-date reminders
CREATE INDEX IF NOT EXISTS idx_orders_credit_status     ON public.orders(credit_status);
CREATE INDEX IF NOT EXISTS idx_orders_credit_due_date   ON public.orders(credit_due_date);
CREATE INDEX IF NOT EXISTS idx_orders_due_date          ON public.orders(due_date);
CREATE INDEX IF NOT EXISTS idx_orders_open_credit
  ON public.orders(credit_due_date)
  WHERE is_credit = true AND status <> 'COMPLETED';

-- Done.
