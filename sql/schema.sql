-- ─────────────────────────────────────────────────────────────
-- TABLES FOR THE AGENT + SAMPLE DATA
-- (lc_documents_gemini for the RAG is created by `npm run ingest`)
-- Run once: Supabase → SQL Editor, or pgAdmin on the local "rag" database.
-- ─────────────────────────────────────────────────────────────

-- pgvector (on Supabase it lives in the "extensions" schema)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS customers (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id          SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  code_hash   TEXT NOT NULL,                 -- never the real code
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  txn_date    DATE NOT NULL,
  description TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL          -- never FLOAT for money
);

-- Supabase exposes public tables over its REST API. RLS with no policies blocks that.
-- The app connects as "postgres", which bypasses RLS, so it is unaffected.
ALTER TABLE customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Sample data
INSERT INTO customers (id, name, phone) VALUES
  ('CUST-1001', 'Muz', '03001234567'),
  ('CUST-1002', 'Ali', '03111234567')
ON CONFLICT (id) DO NOTHING;

INSERT INTO transactions (customer_id, txn_date, description, amount) VALUES
  ('CUST-1001', '2026-09-03', 'Daraz order',      -4500.00),
  ('CUST-1001', '2026-09-10', 'Salary',          250000.00),
  ('CUST-1001', '2026-09-21', 'K-Electric bill', -12800.00),
  ('CUST-1001', '2026-10-05', 'Foodpanda',        -2300.00),
  ('CUST-1002', '2026-09-12', 'Salary',          180000.00),
  ('CUST-1002', '2026-09-15', 'Car loan EMI',    -45000.00);
