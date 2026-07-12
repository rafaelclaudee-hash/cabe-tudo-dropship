-- ============================================================
-- 005_add_shipping_address.sql — endereço de entrega em orders
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
-- ============================================================

-- NOT NULL em tudo exceto complement — um pedido pago sem endereço não
-- faz sentido no negócio. Mas a tabela pode já ter linhas (pedidos de
-- teste anteriores), e ADD COLUMN ... NOT NULL sem default falha numa
-- tabela não-vazia. Por isso: adiciona com DEFAULT '' (backfill das
-- linhas existentes), depois derruba o default — daqui pra frente,
-- todo INSERT precisa informar o valor explicitamente.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_street        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_number         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_complement     TEXT,
  ADD COLUMN IF NOT EXISTS shipping_neighborhood   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_city           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_state          TEXT NOT NULL DEFAULT '', -- UF, 2 letras
  ADD COLUMN IF NOT EXISTS shipping_zip_code       TEXT NOT NULL DEFAULT '';

ALTER TABLE orders
  ALTER COLUMN shipping_street        DROP DEFAULT,
  ALTER COLUMN shipping_number        DROP DEFAULT,
  ALTER COLUMN shipping_neighborhood  DROP DEFAULT,
  ALTER COLUMN shipping_city          DROP DEFAULT,
  ALTER COLUMN shipping_state         DROP DEFAULT,
  ALTER COLUMN shipping_zip_code      DROP DEFAULT;
