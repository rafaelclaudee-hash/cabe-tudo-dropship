-- ============================================================
-- 010_fix_test_product_price.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Contexto: teste-pagamento (produto interno pra validar Pix/cartão/
-- boleto em produção) estava em R$ 1,00 — abaixo do mínimo de
-- cobrança da Asaas (R$ 5,00). Rejeitado em produção com:
--   "O valor da cobrança (R$ 1,00) menos o valor do desconto
--    (R$ 0,00) não pode ser menor que R$ 5,00"
-- R$ 10,00 cobre o mínimo dos 3 métodos com folga.
-- ============================================================

UPDATE products SET sale_price_cents = 1000 WHERE slug = 'teste-pagamento';
