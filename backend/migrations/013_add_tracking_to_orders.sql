-- ============================================================
-- 013_add_tracking_to_orders.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Página /rastrear (17/07/2026): cliente final acompanha o pedido só
-- com o link/código do pedido, sem login. Adiciona tracking_code,
-- carrier e shipped_at direto em orders. Sem job automático de
-- fornecedor ainda — esses campos são preenchidos manualmente (direto
-- no banco, ou algum fluxo futuro) quando o fornecedor avisa que
-- despachou.
--
-- TODO: supplier_orders.tracking_code (já existe desde a 001_initial.sql)
-- é o espelho INTERNO do repasse ao fornecedor (Alpha Star/C7Drop) —
-- tabela e propósito diferentes, nunca exposto ao cliente. Se um dia
-- existir sync automático com o fornecedor, avaliar se orders.tracking_code
-- passa a ser preenchido a partir de supplier_orders (ou os dois
-- atualizados juntos pelo mesmo job) em vez de digitado à mão como é hoje.
-- ============================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carrier TEXT;

-- Parcial: a grande maioria dos pedidos vai ficar com tracking_code
-- NULL a maior parte da vida (pending/paid, ainda não despachados) —
-- não vale indexar essas linhas.
CREATE INDEX IF NOT EXISTS idx_orders_tracking_code
  ON orders(tracking_code)
  WHERE tracking_code IS NOT NULL;

COMMIT;

-- ------------------------------------------------------------------
-- Verificação manual (rodar depois, não faz parte da migration):
-- ------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'orders'
--    AND column_name IN ('tracking_code', 'shipped_at', 'carrier')
--  ORDER BY column_name;
