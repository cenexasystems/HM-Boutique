-- ============================================================
-- HM BOUTIQUE — MEASUREMENTS MODULE MIGRATION
-- Run once in the Supabase SQL Editor. Purely additive: it creates new
-- tables and does not touch orders / advance_orders / billing tables.
-- Safe to re-run. (Row Level Security is left at the Supabase default,
-- matching the other tables the POS reads/writes with the anon key.)
--
-- One row per saved bill (invoice or advance order); `items` holds the
-- measurements of every billed line. Measurements are for the tailor only
-- and are never printed on receipts / PDFs.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.measurement_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no    TEXT NOT NULL,                      -- INV-... or DEP-... of the bill
  order_kind    TEXT NOT NULL DEFAULT 'INVOICE' CHECK (order_kind IN ('INVOICE', 'ADVANCE')),
  customer_name TEXT NOT NULL DEFAULT 'Guest',
  phone         TEXT DEFAULT '',
  address       TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  items         JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ item_name, price, qty, due_date, front_neck_type, ..., measurements{}, remarks[] }]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurement_orders_created_at ON public.measurement_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_orders_status ON public.measurement_orders(status);
CREATE INDEX IF NOT EXISTS idx_measurement_orders_invoice_no ON public.measurement_orders(invoice_no);

-- ------------------------------------------------------------
-- Custom dropdown options managed from the Measurements tab
-- (extra neck types, sleeve types, sleeve lengths).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.measurement_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('neck', 'sleeve_type', 'sleeve_length')),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, name)
);

-- The earlier one-row-per-item prototype table is no longer used. If you
-- ran the first version of this migration you can drop it:
--   DROP TABLE IF EXISTS public.measurements;
