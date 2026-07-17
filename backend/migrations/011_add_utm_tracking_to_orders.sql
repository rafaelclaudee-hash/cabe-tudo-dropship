-- ============================================================
-- 011_add_utm_tracking_to_orders.sql — rastreamento pra Utmify
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Contexto: Utmify não integra nativamente com a Asaas — o fluxo é
-- Asaas -> webhook Render -> nosso backend chama a API da Utmify.
-- As notificações (waiting_payment / paid / refunded) acontecem em
-- momentos diferentes (criação do pedido, webhook de pagamento,
-- webhook de reembolso), e o webhook não tem acesso ao cookie de UTM
-- do navegador — por isso os dados precisam estar salvos no pedido,
-- não só de passagem na criação.
--
-- customer_cpf_cnpj e customer_phone: já eram coletados no checkout
-- (CPF sempre, telefone só no cartão) mas nunca eram persistidos —
-- vira o campo customer.document/customer.phone da Utmify. Nenhuma
-- coluna nova pra telefone fora do cartão: continua nulo em Pix/Boleto,
-- não foi pedido um campo de telefone novo no formulário.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_content       TEXT,
  ADD COLUMN IF NOT EXISTS utm_term          TEXT,
  ADD COLUMN IF NOT EXISTS src               TEXT,
  ADD COLUMN IF NOT EXISTS sck               TEXT,
  ADD COLUMN IF NOT EXISTS customer_ip       TEXT,
  ADD COLUMN IF NOT EXISTS customer_cpf_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone    TEXT;
