-- ============================================================
-- 007_seed_all_products.sql — catálogo completo (14 produtos com fotos)
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
--
-- Contexto: os 4 produtos Alpha Star já existiam (migration 002) — aqui
-- só ganham descrição + fotos (UPDATE, mesmo slug, nada duplicado).
-- Os 11 produtos C7Drop são novos.
--
-- Escova Elétrica (Alpha Star) fica INTOCADA — ainda sem foto/descrição
-- nova, aguardando a Alpha Star mandar material (ver TODO no projeto).
--
-- 8 dos 11 produtos C7Drop entram com available = false e
-- cost_cents = 0: ainda não temos o custo real de fornecedor pra eles,
-- e nunca inventamos preço/custo — ficam invisíveis na loja (a query
-- de catálogo exige active = true E available = true) até alguém
-- confirmar o custo e ativar manualmente.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) Alpha Star: descrição + fotos nos 3 produtos que já tinham foto
--    pronta (Escova Elétrica fica de fora de propósito).
-- ------------------------------------------------------------------

UPDATE products
   SET description = 'Chega de usar a mesma tábua para tudo. Este kit traz 4 tábuas coloridas com identificação para cada tipo de alimento — carnes, peixes, alimentos cozidos e legumes — evitando a mistura de odores e a contaminação cruzada no preparo. Acompanha um suporte organizador que mantém tudo em pé, ocupando pouco espaço na bancada. Material plástico resistente, fácil de lavar e ideal para cozinhas de qualquer tamanho.

Conteúdo: 4 tábuas de corte + 1 suporte organizador.
Dimensões aproximadas: suporte com 23 cm de altura, 33 cm de comprimento.',
       attributes = attributes || '{"photos": ["/products/kit-tabuas-coloridas/1.webp", "/products/kit-tabuas-coloridas/2.webp", "/products/kit-tabuas-coloridas/3.webp", "/products/kit-tabuas-coloridas/4.webp", "/products/kit-tabuas-coloridas/5.webp", "/products/kit-tabuas-coloridas/6.webp"]}'::jsonb
 WHERE slug = 'kit-tabuas-coloridas';

UPDATE products
   SET description = 'Escova elétrica giratória que faz a limpeza pesada por você. O motor gira as cerdas em 360°, removendo sujeira, mofo, manchas e calcário de azulejos, rejuntes, pia, fogão, box, vidros e chão — sem esforço manual. Vem com acessórios que se encaixam para diferentes superfícies e cantos. Cabo ergonômico para uso confortável.

Dimensões aproximadas: 23 cm (comprimento) x 12 cm (largura) x 10 cm (altura).',
       attributes = attributes || '{"photos": ["/products/escovao-eletrico/1.webp", "/products/escovao-eletrico/2.webp", "/products/escovao-eletrico/3.webp", "/products/escovao-eletrico/4.webp", "/products/escovao-eletrico/5.webp"]}'::jsonb
 WHERE slug = 'escovao-eletrico';

UPDATE products
   SET description = 'Escorredor de louças suspenso e modular que libera o espaço da sua pia. Em vez de ocupar a bancada, ele se apoia de forma autossustentável e deixa a água escorrer direto na pia. Estrutura em aço inox com pintura preta, reforçada e resistente à umidade. Vem completo com compartimentos separados para pratos, talheres, detergente e tábua de corte — cada coisa no seu lugar.

Conteúdo: estrutura + 6 ganchos + porta-detergente + porta-talheres + porta-pratos + porta-tábua + quadro autossustentável + 4 pés + 12 parafusos. Acompanha manual e ferramenta para montagem.
Dimensões aproximadas: 64 cm (comprimento) x 37 cm (largura) x 9 cm (altura).',
       attributes = attributes || '{"photos": ["/products/escorredor-suspenso/1.webp", "/products/escorredor-suspenso/2.webp", "/products/escorredor-suspenso/3.webp", "/products/escorredor-suspenso/4.webp", "/products/escorredor-suspenso/5.webp", "/products/escorredor-suspenso/6.webp", "/products/escorredor-suspenso/7.webp"]}'::jsonb
 WHERE slug = 'escorredor-suspenso';

-- ------------------------------------------------------------------
-- 2) Fornecedor C7Drop (novo)
--    avg_shipping_days = 10 é um valor provisório (mesmo padrão da
--    Alpha Star) — ainda não temos o prazo real do C7Drop.
-- ------------------------------------------------------------------

INSERT INTO suppliers (name, avg_shipping_days, integration_type)
SELECT 'C7Drop', 10, 'manual'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'C7Drop');

-- ------------------------------------------------------------------
-- 3) Produtos C7Drop (11 novos)
-- ------------------------------------------------------------------

INSERT INTO products (name, slug, sale_price_cents, active, description, attributes) VALUES
  (
    'Cestos Empilháveis de Arame',
    'cestos-empilhaveis',
    13490,
    true,
    'Cesto de arame em ferro com frente aberta e alça dobrável, feito para empilhar e aproveitar cada centímetro do armário, da despensa ou da bancada. A abertura frontal facilita pegar o que está guardado mesmo com os cestos empilhados, e o design vazado deixa o ar circular. Estrutura resistente com acabamento anticorrosão, que aguenta itens mais pesados. Serve para batatas, cebolas, frutas, lanches — e também para brinquedos, toalhas, produtos de banho e mais.

Dimensões: 36 cm (comprimento) x 15 cm (largura) x 18 cm (altura). Cor: preto.',
    '{"photos": ["/products/cestos-empilhaveis/1.jpg", "/products/cestos-empilhaveis/2.jpg", "/products/cestos-empilhaveis/3.jpg", "/products/cestos-empilhaveis/4.jpg", "/products/cestos-empilhaveis/5.jpg", "/products/cestos-empilhaveis/6.jpg", "/products/cestos-empilhaveis/7.jpg", "/products/cestos-empilhaveis/8.jpg"], "featured": true}'::jsonb
  ),
  (
    'Fruteira de Mesa 2 Andares',
    'fruteira-2-andares',
    10490,
    true,
    'Fruteira de bancada com 2 andares que organiza frutas e legumes ocupando pouco espaço. Estrutura em metal com acabamento preto fosco e alça de madeira natural, unindo estilo moderno e funcionalidade. Os dois níveis aumentam a capacidade sem espalhar tudo pela bancada, e a estrutura triangular garante estabilidade. Montagem simples e rápida.

Dimensões: 27 cm (largura) x 17 cm (profundidade) x 29 cm (altura).',
    '{"photos": ["/products/fruteira-2-andares/1.webp", "/products/fruteira-2-andares/2.jpg", "/products/fruteira-2-andares/3.jpg", "/products/fruteira-2-andares/4.jpg", "/products/fruteira-2-andares/5.webp", "/products/fruteira-2-andares/6.webp", "/products/fruteira-2-andares/7.jpg", "/products/fruteira-2-andares/8.jpg", "/products/fruteira-2-andares/9.jpg"], "featured": true}'::jsonb
  ),
  (
    'Suporte para Shampoo e Sabonete',
    'suporte-shampoo-sabonete',
    7990,
    true,
    'Prateleira de parede para organizar o box do banheiro sem furar a parede. Fixa com adesivo de alta resistência e mantém shampoo, condicionador, sabonete e outros itens de higiene num lugar só, ao alcance da mão. Estrutura em metal com pintura preta, resistente à umidade e ao uso diário, com design minimalista que combina com qualquer decoração.

Dimensões: 30 cm (largura) x 12,5 cm (profundidade) x 5,5 cm (altura).',
    '{"photos": ["/products/suporte-shampoo-sabonete/1.jpg", "/products/suporte-shampoo-sabonete/2.jpg", "/products/suporte-shampoo-sabonete/3.jpg", "/products/suporte-shampoo-sabonete/4.jpg", "/products/suporte-shampoo-sabonete/5.jpg", "/products/suporte-shampoo-sabonete/6.jpg"], "featured": true}'::jsonb
  ),
  (
    'Escorredor de Louças Cromado',
    'escorredor-loucas-cromado',
    6990,
    true,
    'Escorredor de louças de bancada em ferro cromado, com capacidade para até 18 pratos. Acabamento prateado que dá um toque sofisticado à cozinha, estrutura aramada resistente e durável. Compacto, de andar único, ideal para otimizar o espaço e secar a louça com praticidade em cozinhas de qualquer tamanho.

Dimensões: 45 cm (comprimento) x 32 cm (largura) x 7 cm (altura).',
    '{"photos": ["/products/escorredor-loucas-cromado/1.jpg", "/products/escorredor-loucas-cromado/2.jpg", "/products/escorredor-loucas-cromado/3.jpg"]}'::jsonb
  ),
  (
    'Suporte Porta Papel Higiênico',
    'suporte-papel-higienico',
    4990,
    true,
    'Porta papel higiênico suspenso com 3 compartimentos, para manter rolos extras sempre à mão e o banheiro organizado. Design vertical que ocupa pouco espaço, com suporte no topo para pendurar com praticidade. Superfície em PVC durável e fácil de limpar — basta um pano úmido.

Dimensões aproximadas: 68 cm (altura) x 17 cm (largura). Capacidade: 3 rolos.',
    '{"photos": ["/products/suporte-papel-higienico/1.jpg", "/products/suporte-papel-higienico/2.jpg"]}'::jsonb
  ),
  (
    'Kit 3 Organizadores com Divisórias',
    'kit-3-organizadores',
    10490,
    true,
    'Kit com 3 organizadores de plástico rígido (polipropileno) com divisórias internas, ideais para separar itens pequenos em gavetas e armários — roupas íntimas, meias, acessórios, cosméticos ou material de escritório. As divisórias criam nichos que mantêm cada coisa no lugar, e o formato permite empilhar para aproveitar melhor o espaço.

Dimensões aproximadas por peça: 32 cm x 25 cm x 9 cm.',
    '{"photos": ["/products/kit-3-organizadores/1.jpg", "/products/kit-3-organizadores/2.jpg", "/products/kit-3-organizadores/3.jpg", "/products/kit-3-organizadores/4.jpg", "/products/kit-3-organizadores/5.jpg", "/products/kit-3-organizadores/6.jpg"]}'::jsonb
  ),
  (
    'Kit 5 Potes Herméticos Organizadores',
    'kit-5-potes-hermeticos',
    10490,
    true,
    'Kit com 5 potes herméticos para organizar a geladeira, o armário ou a despensa e conservar os alimentos frescos por muito mais tempo. A vedação com anel de silicone e fivela cria um fechamento 100% hermético, protegendo contra umidade, ar e cheiros. Os 3 potes maiores acompanham um cesto drenador removível — dá para lavar, escorrer e guardar frutas, verduras e legumes no mesmo recipiente, sem o alimento ficar na água. Plástico livre de BPA, transparente para ver o conteúdo, apto para micro-ondas e lava-louças.

Tamanhos: 2 potes de 390 ml + 2 potes de 860 ml + 1 pote de 3,3 L.',
    '{"photos": ["/products/kit-5-potes-hermeticos/1.jpg", "/products/kit-5-potes-hermeticos/2.webp", "/products/kit-5-potes-hermeticos/3.webp", "/products/kit-5-potes-hermeticos/4.webp", "/products/kit-5-potes-hermeticos/5.webp", "/products/kit-5-potes-hermeticos/6.jpg", "/products/kit-5-potes-hermeticos/7.jpg", "/products/kit-5-potes-hermeticos/8.jpg", "/products/kit-5-potes-hermeticos/9.jpg"]}'::jsonb
  ),
  (
    'Suporte Organizador de Utensílios',
    'suporte-utensilios-cozinha',
    8490,
    true,
    'Barra organizadora de parede em aço inox preto, com 8 ganchos para pendurar utensílios de cozinha e liberar espaço nas gavetas e bancadas. Comprimento de 50 cm que acomoda desde colheres, conchas e espátulas até itens maiores como panelas e frigideiras — tudo à vista e ao alcance da mão. Estrutura resistente à corrosão e de aparência elegante. Acompanha kit de fixação completo (buchas, parafusos e travas).

Dimensões: 50 cm (comprimento) x 7 cm (altura) x 6 cm (profundidade).',
    '{"photos": ["/products/suporte-utensilios-cozinha/1.jpg", "/products/suporte-utensilios-cozinha/2.jpg", "/products/suporte-utensilios-cozinha/3.jpg", "/products/suporte-utensilios-cozinha/4.jpg", "/products/suporte-utensilios-cozinha/5.jpg", "/products/suporte-utensilios-cozinha/6.jpg", "/products/suporte-utensilios-cozinha/7.jpg", "/products/suporte-utensilios-cozinha/8.jpg", "/products/suporte-utensilios-cozinha/9.jpg"]}'::jsonb
  ),
  (
    'Porta Tempero Magnético',
    'porta-tempero-magnetico',
    9490,
    true,
    'Porta temperos moderno com 4 potes magnéticos em aço inox e base inclinada, que organiza os condimentos ocupando pouco espaço e dá um toque gourmet à cozinha. Cada pote tem visor transparente para identificar o tempero e tampa com duas saídas — uma larga e uma com furinhos para polvilhar. O ímã na base permite fixar os potes em superfícies metálicas, como a geladeira.

Capacidade: 50 ml por pote (4 potes). Base: 28 cm x 7 cm. (Temperos não acompanham o produto.)',
    '{"photos": ["/products/porta-tempero-magnetico/1.jpg", "/products/porta-tempero-magnetico/2.jpg", "/products/porta-tempero-magnetico/3.jpg", "/products/porta-tempero-magnetico/4.jpg", "/products/porta-tempero-magnetico/5.jpg", "/products/porta-tempero-magnetico/6.jpg", "/products/porta-tempero-magnetico/7.jpg", "/products/porta-tempero-magnetico/8.jpg", "/products/porta-tempero-magnetico/9.webp"]}'::jsonb
  ),
  (
    'Lixeira Retrátil Dobrável',
    'lixeira-retratil',
    9490,
    true,
    'Lixeira dobrável e retrátil que se encaixa na porta do armário, na gaveta ou na despensa, mantendo a cozinha limpa e livre de odores. Basta puxar para abrir e pressionar para recolher — quando fechada, ocupa quase nenhum espaço. Feita em polipropileno resistente, pode ser usada com sacola reutilizável. Capacidade de 6 litros.

Dimensões aproximadas: 30 cm x 25 cm x 10 cm.',
    '{"photos": ["/products/lixeira-retratil/1.jpg", "/products/lixeira-retratil/2.jpg", "/products/lixeira-retratil/3.jpg", "/products/lixeira-retratil/4.jpg", "/products/lixeira-retratil/5.jpg", "/products/lixeira-retratil/6.jpg", "/products/lixeira-retratil/7.webp", "/products/lixeira-retratil/8.webp", "/products/lixeira-retratil/9.webp"]}'::jsonb
  ),
  (
    'Dispenser de Parede para Sabonete Líquido',
    'dispenser-sabonete-liquido',
    7490,
    true,
    'Dispenser de parede com reservatório de 350 ml para sabonete líquido, álcool gel ou detergente. O botão dosador libera a quantidade certa e evita desperdício, e o visor transparente mostra quando está na hora de reabastecer. Reservatório recarregável e fácil de limpar. Acompanha suporte de fixação com buchas e parafusos. Design discreto que combina com banheiros, cozinhas e ambientes comerciais.

Dimensões aproximadas: 18 cm (altura) x 6,5 cm (largura) x 6 cm (profundidade).',
    '{"photos": ["/products/dispenser-sabonete-liquido/1.jpg", "/products/dispenser-sabonete-liquido/2.jpg", "/products/dispenser-sabonete-liquido/3.jpg", "/products/dispenser-sabonete-liquido/4.jpg", "/products/dispenser-sabonete-liquido/5.jpg", "/products/dispenser-sabonete-liquido/6.jpg", "/products/dispenser-sabonete-liquido/7.jpg", "/products/dispenser-sabonete-liquido/8.jpg", "/products/dispenser-sabonete-liquido/9.jpg"]}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------------
-- 4) Vínculo produto ↔ C7Drop (custo/margem)
--    3 com custo real confirmado (available = true), 8 com
--    cost_cents = 0 e available = false — não aparecem na loja até
--    alguém confirmar o custo real e ativar (ver TODO no projeto).
-- ------------------------------------------------------------------

INSERT INTO supplier_products (product_id, supplier_id, supplier_sku, cost_cents, available, is_primary)
SELECT p.id, s.id, v.supplier_sku, v.cost_cents, v.available, true
FROM (VALUES
  -- custo real confirmado
  ('cestos-empilhaveis',         'C7DROP-CESTOS-EMPILHAVEIS',         7300, true),
  ('fruteira-2-andares',         'C7DROP-FRUTEIRA-2-ANDARES',         5000, true),
  ('suporte-shampoo-sabonete',   'C7DROP-SUPORTE-SHAMPOO-SABONETE',   3700, true),
  -- custo pendente — inativos até confirmar
  ('escorredor-loucas-cromado',  'C7DROP-ESCORREDOR-LOUCAS-CROMADO',     0, false),
  ('suporte-papel-higienico',    'C7DROP-SUPORTE-PAPEL-HIGIENICO',       0, false),
  ('kit-3-organizadores',        'C7DROP-KIT-3-ORGANIZADORES',           0, false),
  ('kit-5-potes-hermeticos',     'C7DROP-KIT-5-POTES-HERMETICOS',        0, false),
  ('suporte-utensilios-cozinha', 'C7DROP-SUPORTE-UTENSILIOS-COZINHA',    0, false),
  ('porta-tempero-magnetico',    'C7DROP-PORTA-TEMPERO-MAGNETICO',       0, false),
  ('lixeira-retratil',           'C7DROP-LIXEIRA-RETRATIL',              0, false),
  ('dispenser-sabonete-liquido', 'C7DROP-DISPENSER-SABONETE-LIQUIDO',    0, false)
) AS v(slug, supplier_sku, cost_cents, available)
JOIN products p ON p.slug = v.slug
JOIN suppliers s ON s.name = 'C7Drop'
ON CONFLICT (supplier_id, supplier_sku) DO NOTHING;
