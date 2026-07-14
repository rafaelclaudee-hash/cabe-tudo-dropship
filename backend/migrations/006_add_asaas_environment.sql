-- ============================================================
-- 006_add_asaas_environment.sql — marca em qual ambiente Asaas
-- (sandbox ou produção) o asaas_customer_id de cada cliente foi criado
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
-- ============================================================

-- Bug que motivou isso: Sandbox e Produção são bases de cliente
-- completamente separadas na Asaas. Um asaas_customer_id criado em
-- Sandbox não existe em Produção — reaproveitar ele contra a API de
-- produção falha com "invalid_customer". Nullable: só é preenchido
-- junto com asaas_customer_id, nunca sozinho.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS asaas_environment TEXT; -- 'production' | 'sandbox'
