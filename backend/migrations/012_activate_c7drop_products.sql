-- ============================================================
-- 012_activate_c7drop_products.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Ativa os 8 produtos C7Drop que a 007_seed_all_products.sql inseriu
-- com cost_cents = 0 e available = false (aguardando validação de
-- custo/margem). Custos reais validados na C7Drop em 17/07/2026 —
-- margens entre 48,5% e 69,9% sobre o preço de venda já cadastrado,
-- saudáveis. A partir daqui esses 8 produtos voltam a aparecer no
-- catálogo (a query de /api/products exige active = true E
-- available = true).
--
-- supplier_products NÃO tem coluna slug — casa por supplier_sku
-- (único por fornecedor), os mesmos valores inseridos pela 007.
-- ============================================================

BEGIN;

UPDATE supplier_products AS sp
   SET cost_cents = v.cost_cents,
       available = true
  FROM (VALUES
    ('C7DROP-ESCORREDOR-LOUCAS-CROMADO',  2850),
    ('C7DROP-SUPORTE-PAPEL-HIGIENICO',    1500),
    ('C7DROP-KIT-3-ORGANIZADORES',        5400),
    ('C7DROP-KIT-5-POTES-HERMETICOS',     5150),
    ('C7DROP-SUPORTE-UTENSILIOS-COZINHA', 3850),
    ('C7DROP-PORTA-TEMPERO-MAGNETICO',    4350),
    ('C7DROP-LIXEIRA-RETRATIL',           4600),
    ('C7DROP-DISPENSER-SABONETE-LIQUIDO', 3200)
  ) AS v(supplier_sku, cost_cents)
 WHERE sp.supplier_sku = v.supplier_sku;

COMMIT;

-- ------------------------------------------------------------------
-- Verificação manual (rodar depois, não faz parte da migration):
-- ------------------------------------------------------------------
-- SELECT p.slug, sp.supplier_sku, sp.cost_cents, sp.available
--   FROM supplier_products sp
--   JOIN products p ON p.id = sp.product_id
--  WHERE sp.supplier_sku IN (
--    'C7DROP-ESCORREDOR-LOUCAS-CROMADO',
--    'C7DROP-SUPORTE-PAPEL-HIGIENICO',
--    'C7DROP-KIT-3-ORGANIZADORES',
--    'C7DROP-KIT-5-POTES-HERMETICOS',
--    'C7DROP-SUPORTE-UTENSILIOS-COZINHA',
--    'C7DROP-PORTA-TEMPERO-MAGNETICO',
--    'C7DROP-LIXEIRA-RETRATIL',
--    'C7DROP-DISPENSER-SABONETE-LIQUIDO'
--  )
--  ORDER BY p.slug;
