-- ============================================================
-- 001_initial.sql — Schema completo do dropshipping
-- Rode com: npm run migrate  (ou cole no SQL Editor do Supabase)
-- ============================================================

-- Fornecedores
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',        -- active | paused | blacklisted
  avg_shipping_days INTEGER,
  reliability_score NUMERIC(3,2) DEFAULT 5.00,  -- 0.00 a 5.00

  integration_type TEXT NOT NULL DEFAULT 'manual', -- manual | api | csv | scraper
  api_base_url TEXT,
  api_credentials_ref TEXT,     -- nome da env var, NUNCA a credencial em si
  sync_frequency_minutes INTEGER DEFAULT 60,

  total_orders INTEGER DEFAULT 0,
  late_shipments INTEGER DEFAULT 0,
  cancelled_by_supplier INTEGER DEFAULT 0,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Categorias (com suporte a subcategorias)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES categories(id)
);

-- Produtos (como VOCÊ vende: título, preço, marca)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  sale_price_cents INTEGER NOT NULL,   -- inteiro: R$ 49,90 = 4990
  active BOOLEAN DEFAULT true,
  attributes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id UUID REFERENCES products(id),
  category_id UUID REFERENCES categories(id),
  PRIMARY KEY (product_id, category_id)
);

-- Oferta do fornecedor (custo, sync, disponibilidade)
CREATE TABLE IF NOT EXISTS supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),

  supplier_sku TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  supplier_shipping_cents INTEGER DEFAULT 0,
  available BOOLEAN DEFAULT true,

  sync_url TEXT,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,                -- ok | error | price_changed | out_of_stock
  sync_failures INTEGER NOT NULL DEFAULT 0,  -- falhas consecutivas de sync
  is_primary BOOLEAN DEFAULT true,

  raw_supplier_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (supplier_id, supplier_sku)
);

CREATE INDEX IF NOT EXISTS idx_sp_product  ON supplier_products(product_id);
CREATE INDEX IF NOT EXISTS idx_sp_supplier ON supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sp_stale    ON supplier_products(last_synced_at) WHERE available = true;

-- Clientes
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pedidos do cliente
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending → paid → shipped → delivered
  total_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);

-- Itens do pedido (SNAPSHOT de nome e preço no momento da compra)
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,        -- snapshot
  unit_price_cents INTEGER NOT NULL, -- snapshot
  quantity INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items(order_id);

-- Repasse ao fornecedor (SNAPSHOT do custo no momento da venda)
CREATE TABLE IF NOT EXISTS supplier_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),

  status TEXT NOT NULL DEFAULT 'pending',
  -- pending → placed → shipped → delivered | cancelled_by_supplier
  supplier_order_ref TEXT,
  cost_cents INTEGER NOT NULL,       -- snapshot do custo
  tracking_code TEXT,
  placed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_order    ON supplier_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_so_supplier ON supplier_orders(supplier_id);

-- ============================================================
-- SEED de teste: 1 fornecedor + 1 produto apontando para uma
-- API pública fake, só para validar o sync job de ponta a ponta.
-- Delete depois que testar.
-- ============================================================
INSERT INTO suppliers (name, avg_shipping_days, integration_type)
VALUES ('Fornecedor Teste', 12, 'api')
ON CONFLICT DO NOTHING;

INSERT INTO products (name, slug, sale_price_cents)
VALUES ('Produto Teste', 'produto-teste', 9990)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO supplier_products (product_id, supplier_id, supplier_sku, cost_cents, sync_url)
SELECT p.id, s.id, 'SKU-TESTE-001', 4500,
       'https://dummyjson.com/products/1'  -- API pública que retorna JSON com "price" e "stock"
FROM products p, suppliers s
WHERE p.slug = 'produto-teste' AND s.name = 'Fornecedor Teste'
ON CONFLICT (supplier_id, supplier_sku) DO NOTHING;
