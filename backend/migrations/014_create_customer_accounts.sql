-- ============================================================
-- 014_create_customer_accounts.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Fase 2 (18/07/2026): conta de cliente com login (email + senha).
--
-- NÃO é a mesma coisa que a tabela `customers` (001_initial.sql):
-- `customers` é um snapshot anônimo criado/atualizado a cada checkout
-- (upsert por email, sem senha, só liga pedidos ao cliente da Asaas) —
-- continua existindo e sendo usada exatamente como hoje. Esta tabela
-- nova, `customer_accounts`, é a conta de verdade (com senha) que o
-- comprador cria pra acompanhar pedidos. As duas tabelas não se
-- referenciam uma à outra por enquanto — a ligação entre uma conta
-- logada e seus pedidos antigos é feita por EMAIL (GET /api/orders
-- já existente), não por FK. Unificar as duas tabelas fica pra depois,
-- se algum dia fizer sentido migrar pedidos antigos pra uma conta.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  privacy_accepted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMIT;

-- ------------------------------------------------------------------
-- Verificação manual (rodar depois, não faz parte da migration):
-- ------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'customer_accounts'
--  ORDER BY ordinal_position;
