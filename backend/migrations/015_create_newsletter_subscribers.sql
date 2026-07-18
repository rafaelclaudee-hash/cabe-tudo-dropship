-- ============================================================
-- 015_create_newsletter_subscribers.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Última fase do plano original (18/07/2026): captura de e-mail pra
-- newsletter. Só armazenamento por enquanto — sem disparo de campanha
-- automático, o envio é manual via Zoho Mail.
--
-- `origem` guarda de onde veio a inscrição (ex: 'rodape',
-- 'cadastro_conta') pra entender depois de onde vêm os leads. Sem FK
-- pra customer_accounts nem customers: um e-mail pode se inscrever sem
-- ter conta nenhuma.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  aceite_lgpd BOOLEAN NOT NULL,
  origem TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

COMMIT;

-- ------------------------------------------------------------------
-- Verificação manual (rodar depois, não faz parte da migration):
-- ------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'newsletter_subscribers'
--  ORDER BY ordinal_position;
