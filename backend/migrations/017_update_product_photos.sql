-- ============================================================
-- 017_update_product_photos.sql
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Reorganização de fotos de 2 produtos adicionados pela 016:
--
-- chapa-churrasco-coreana: a foto que era 2.jpg (chapa sozinha,
-- fundo branco, rotacionada em diagonal, sem comida) virou a capa —
-- só uma troca física de arquivo entre 1.jpg e 2.jpg, os nomes finais
-- continuam sendo 1.jpg..8.jpg, então o array abaixo é idêntico ao da
-- 016 em texto (incluído mesmo assim, pra manter o histórico de que
-- a reorganização foi intencional).
--
-- kit-utensilios-silicone-12-pecas: ganhou uma 4ª foto como capa —
-- é a foto com marca de outro vendedor ("Kitchen Utensils" /
-- "KITCHENWARE" + logo de chef) que tinha sido descartada antes;
-- decisão consciente de usar mesmo assim. As 3 fotos aprovadas
-- anteriormente viram 2.jpg, 3.jpg e 4.jpg, na mesma ordem relativa.
-- ============================================================

BEGIN;

UPDATE products
   SET attributes = attributes || '{"photos": ["/products/chapa-churrasco-coreana/1.jpg", "/products/chapa-churrasco-coreana/2.jpg", "/products/chapa-churrasco-coreana/3.jpg", "/products/chapa-churrasco-coreana/4.jpg", "/products/chapa-churrasco-coreana/5.jpg", "/products/chapa-churrasco-coreana/6.jpg", "/products/chapa-churrasco-coreana/7.jpg", "/products/chapa-churrasco-coreana/8.jpg"]}'::jsonb
 WHERE slug = 'chapa-churrasco-coreana';

UPDATE products
   SET attributes = attributes || '{"photos": ["/products/kit-utensilios-silicone-12-pecas/1.jpg", "/products/kit-utensilios-silicone-12-pecas/2.jpg", "/products/kit-utensilios-silicone-12-pecas/3.jpg", "/products/kit-utensilios-silicone-12-pecas/4.jpg"]}'::jsonb
 WHERE slug = 'kit-utensilios-silicone-12-pecas';

COMMIT;

-- ------------------------------------------------------------------
-- Verificação manual (rodar depois, não faz parte da migration):
-- ------------------------------------------------------------------
-- SELECT slug, attributes->'photos' AS photos
--   FROM products
--  WHERE slug IN ('chapa-churrasco-coreana', 'kit-utensilios-silicone-12-pecas');
