-- ============================================================
-- 008_categorize_and_toggle_availability.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Contexto:
--   1) Adiciona coluna category aos 14 produtos com foto (migration 007),
--      pra alimentar os filtros Cozinha/Banheiro/Organização da home.
--   2) Escova Elétrica (Alpha Star) passa a active = false — some da
--      loja de vez (placeholder cinza feio) até a Alpha Star mandar
--      fotos reais (ver TODO no projeto). Continua no banco, não deleta.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE products SET category = 'cozinha' WHERE slug IN (
  'kit-tabuas-coloridas',
  'escovao-eletrico',
  'escorredor-suspenso',
  'escorredor-loucas-cromado',
  'fruteira-2-andares',
  'kit-5-potes-hermeticos',
  'suporte-utensilios-cozinha',
  'porta-tempero-magnetico'
);

UPDATE products SET category = 'banheiro' WHERE slug IN (
  'suporte-shampoo-sabonete',
  'suporte-papel-higienico',
  'dispenser-sabonete-liquido'
);

UPDATE products SET category = 'organizacao' WHERE slug IN (
  'cestos-empilhaveis',
  'kit-3-organizadores',
  'lixeira-retratil'
);

-- Escova Elétrica: sem foto/descrição nova, some da loja até a Alpha
-- Star mandar material. Continua ativa=false só aqui, não é deletada.
UPDATE products SET active = false WHERE slug = 'escova-eletrica';
