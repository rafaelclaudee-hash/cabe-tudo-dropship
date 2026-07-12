-- ============================================================
-- 002_seed_alphastar_products.sql — Catálogo real do fornecedor Alpha Star
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
-- ============================================================

-- Fornecedor Alpha Star (evita duplicar se a migration rodar mais de uma vez)
INSERT INTO suppliers (name, avg_shipping_days, integration_type)
SELECT 'Alpha Star', 10, 'manual'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'Alpha Star');

-- Produtos reais do catálogo
INSERT INTO products (name, slug, sale_price_cents, active) VALUES
  ('Escorredor Suspenso',   'escorredor-suspenso',   24790, true),
  ('Kit Tábuas Coloridas',  'kit-tabuas-coloridas',  11490, true),
  ('Escovão Elétrico',      'escovao-eletrico',      10790, true),
  ('Escova Elétrica',       'escova-eletrica',        6290, true)
ON CONFLICT (slug) DO NOTHING;

-- Vínculo produto ↔ fornecedor primário (custo/margem)
INSERT INTO supplier_products (product_id, supplier_id, supplier_sku, cost_cents, available, is_primary)
SELECT p.id, s.id, v.supplier_sku, v.cost_cents, true, true
FROM (VALUES
  ('escorredor-suspenso',  'ALPHASTAR-ESCORREDOR-SUSPENSO', 9900),
  ('kit-tabuas-coloridas', 'ALPHASTAR-KIT-TABUAS-COLORIDAS', 4600),
  ('escovao-eletrico',     'ALPHASTAR-ESCOVAO-ELETRICO',     4300),
  ('escova-eletrica',      'ALPHASTAR-ESCOVA-ELETRICA',      2500)
) AS v(slug, supplier_sku, cost_cents)
JOIN products p ON p.slug = v.slug
JOIN suppliers s ON s.name = 'Alpha Star'
ON CONFLICT (supplier_id, supplier_sku) DO NOTHING;

-- Desativa o produto de seed de teste (mantém o histórico, não deleta)
UPDATE products SET active = false WHERE slug = 'produto-teste';
