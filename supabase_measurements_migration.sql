-- ============================================================
-- HM BOUTIQUE — MEASUREMENTS MODULE MIGRATION
-- Run once in the Supabase SQL Editor. Purely additive: it creates a new
-- table and does not touch orders / advance_orders / billing tables.
-- (Row Level Security is left at the Supabase default, matching the other
--  tables the POS reads/writes with the anon key.)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.measurements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_no   TEXT UNIQUE,
  customer_name    TEXT NOT NULL DEFAULT 'Walk-in Customer',
  phone            TEXT DEFAULT '',
  address          TEXT DEFAULT '',
  item_name        TEXT DEFAULT '',
  price            NUMERIC(12,2) DEFAULT 0,
  due_date         DATE,
  front_neck_type  TEXT DEFAULT '',
  back_neck_type   TEXT DEFAULT '',
  sleeve_type      TEXT DEFAULT '',
  sleeve_length    TEXT DEFAULT '',
  measurements     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "chest": "36", ... } in cm
  remarks          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["remark 1", "remark 2", ...]
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_measurements_created_at ON public.measurements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_phone ON public.measurements(phone);

-- ------------------------------------------------------------
-- Custom dropdown options managed from the Measurements tab
-- (extra neck types, sleeve types, sleeve lengths). Safe to re-run.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.measurement_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL CHECK (kind IN ('neck', 'sleeve_type', 'sleeve_length')),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, name)
);
