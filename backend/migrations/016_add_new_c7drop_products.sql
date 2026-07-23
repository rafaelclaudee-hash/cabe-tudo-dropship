-- ============================================================
-- 016_add_new_c7drop_products.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- 2 produtos novos C7Drop, custo já confirmado — entram direto com
-- active = true e available = true (mesmo padrão dos 3 produtos com
-- custo confirmado na 007_seed_all_products.sql).
-- ============================================================

BEGIN;

INSERT INTO products (name, slug, sale_price_cents, active, description, attributes) VALUES
  (
    'Chapa de Churrasco Coreana Antiaderente 30cm',
    'chapa-churrasco-coreana',
    12990,
    true,
    'Chapa para churrasco coreano em alumínio fundido, com revestimento antiaderente que facilita grelhar carnes, legumes e frutos do mar sem que grude ou queime — e a limpeza é rápida, só passar um pano. As duas alças largas facilitam o manuseio e deixam transportar do fogão pra mesa com segurança. Formato redondo e compacto, ideal pra churrasco em casa, fogareiro portátil ou mesa posta.

Diâmetro: 30 cm. Dimensões aproximadas: 38 cm (comprimento) x 30 cm (largura) x 5 cm (altura). Peso aproximado: 700 g. Material: alumínio fundido com revestimento antiaderente. Cor: cinza-escuro.',
    '{"photos": ["/products/chapa-churrasco-coreana/1.jpg", "/products/chapa-churrasco-coreana/2.jpg", "/products/chapa-churrasco-coreana/3.jpg", "/products/chapa-churrasco-coreana/4.jpg", "/products/chapa-churrasco-coreana/5.jpg", "/products/chapa-churrasco-coreana/6.jpg", "/products/chapa-churrasco-coreana/7.jpg", "/products/chapa-churrasco-coreana/8.jpg"]}'::jsonb
  ),
  (
    'Kit Utensílios de Silicone 12 Peças com Suporte',
    'kit-utensilios-silicone-12-pecas',
    10990,
    true,
    'Kit com 12 utensílios de cozinha em silicone com cabo de madeira, organizados num suporte próprio que já acompanha o conjunto. Silicone resistente a até 230°C, não risca panelas antiaderentes e não gruda alimentos — colher, espátula, concha, pegador, batedor de arame e outros, tudo pra cozinhar sem trocar de utensílio toda hora. Livre de BPA e prático de lavar (vai na lava-louças).

Conteúdo: 12 peças + 1 suporte. Material: silicone e madeira. Resistência térmica: até 230°C. Cor: preto.',
    '{"photos": ["/products/kit-utensilios-silicone-12-pecas/1.jpg", "/products/kit-utensilios-silicone-12-pecas/2.jpg", "/products/kit-utensilios-silicone-12-pecas/3.jpg"]}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO supplier_products (product_id, supplier_id, supplier_sku, cost_cents, available, is_primary)
SELECT p.id, s.id, v.supplier_sku, v.cost_cents, v.available, true
FROM (VALUES
  ('chapa-churrasco-coreana',          'C7DROP-PANELA-CHURRASCO-COREANO',    6500, true),
  ('kit-utensilios-silicone-12-pecas', 'C7DROP-KIT-12-UTENSILIOS-SILICONE',  5000, true)
) AS v(slug, supplier_sku, cost_cents, available)
JOIN products p ON p.slug = v.slug
JOIN suppliers s ON s.name = 'C7Drop'
ON CONFLICT (supplier_id, supplier_sku) DO NOTHING;

COMMIT;

-- ------------------------------------------------------------------
-- Verificação manual (rodar depois, não faz parte da migration):
-- ------------------------------------------------------------------
-- SELECT p.slug, p.name, p.sale_price_cents, p.active, sp.supplier_sku, sp.cost_cents, sp.available
--   FROM products p
--   JOIN supplier_products sp ON sp.product_id = p.id
--  WHERE p.slug IN ('chapa-churrasco-coreana', 'kit-utensilios-silicone-12-pecas')
--  ORDER BY p.slug;
