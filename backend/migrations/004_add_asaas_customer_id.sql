-- ============================================================
-- 004_add_asaas_customer_id.sql — vincula customers ao cliente Asaas
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
-- ============================================================

-- Preenchido na primeira cobrança do cliente (createCustomer no Asaas).
-- Pedidos seguintes do mesmo email reusam esse id em vez de criar um
-- cliente novo no Asaas a cada compra.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_asaas_customer_id
  ON customers(asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;
