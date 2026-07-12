-- ============================================================
-- 003_add_asaas_payment_id.sql — vincula orders à cobrança Asaas
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
-- ============================================================

-- Preenchido no momento em que a cobrança Pix é criada (createPixCharge).
-- É a chave que o webhook usa pra achar o pedido quando o Asaas avisa
-- "pagamento recebido" — sem ela não tem como correlacionar as duas pontas.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;

-- Único, mas permite múltiplas linhas com NULL (pedidos que ainda não
-- geraram cobrança) — index parcial evita indexar essas linhas à toa
-- e garante que o mesmo payment_id nunca se vincule a dois pedidos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_asaas_payment_id
  ON orders(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
