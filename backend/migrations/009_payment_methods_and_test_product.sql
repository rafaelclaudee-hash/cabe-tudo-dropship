-- ============================================================
-- 009_payment_methods_and_test_product.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Contexto: adiciona cartão de crédito e boleto ao checkout (hoje só
-- Pix). Este arquivo só mexe em schema — nenhuma chamada à Asaas aqui.
-- ============================================================

-- 1) Parcelamento configurável por produto (cartão de crédito).
--    Default 5 cobre os 14 produtos existentes sem precisar de UPDATE
--    (ADD COLUMN ... DEFAULT preenche as linhas já existentes).
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_installments INTEGER NOT NULL DEFAULT 5;

-- 2) Produto pode existir no catálogo mas ficar fora do grid da home —
--    usado pelo produto de teste de pagamento abaixo (acessível só via
--    URL direta). Default false não muda nada nos 14 produtos existentes.
ALTER TABLE products ADD COLUMN IF NOT EXISTS hidden_from_catalog BOOLEAN NOT NULL DEFAULT false;

-- 3) Qual método de pagamento foi usado em cada pedido — histórico
--    para suporte/depuração. Default 'PIX' é o backfill correto: todo
--    pedido existente até aqui foi feito por Pix (único método até agora).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'PIX';

-- ------------------------------------------------------------------
-- 4) Produto de teste (R$ 1,00) — Rafael usa pra validar Pix, cartão
--    e boleto ponta a ponta em produção com risco mínimo. Fica ativo
--    (senão nem aparece na busca por slug) mas hidden_from_catalog =
--    true (não aparece no grid da home nem nos filtros de categoria).
-- ------------------------------------------------------------------

-- Fornecedor interno só pra satisfazer o schema — supplier_products é
-- obrigatório pra um produto aparecer via GET /api/products/:slug (join
-- interno com is_primary = true). teste-pagamento não é um produto real
-- e nunca gera repasse de fornecedor de verdade.
INSERT INTO suppliers (name, avg_shipping_days, integration_type)
SELECT 'Interno', 0, 'manual'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Interno');

INSERT INTO products (name, slug, sale_price_cents, active, hidden_from_catalog, description)
VALUES (
  'Teste - NÃO COMPRAR',
  'teste-pagamento',
  100,
  true,
  true,
  'Produto interno para testar Pix, cartão de crédito e boleto em produção com valor simbólico de R$ 1,00. NÃO é um produto real — não compre.'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO supplier_products (product_id, supplier_id, supplier_sku, cost_cents, available, is_primary)
SELECT p.id, s.id, 'INTERNO-TESTE-PAGAMENTO', 50, true, true
FROM products p, suppliers s
WHERE p.slug = 'teste-pagamento' AND s.name = 'Interno'
ON CONFLICT (supplier_id, supplier_sku) DO NOTHING;
