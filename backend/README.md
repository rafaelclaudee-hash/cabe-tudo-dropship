# Dropship Engine — MVP

Monolito modular para e-commerce dropshipping. Node.js + Express + PostgreSQL.

```
server.js                     ← API (catálogo + checkout)
scripts/migrate.js            ← aplicador de migrations
migrations/001_initial.sql    ← schema completo + seed de teste
src/
  shared/lib/
    logger.js                 ← pino estruturado
    fetch-with-retry.js       ← fetch com timeout + backoff exponencial
  modules/
    suppliers/sync/
      sync-products.js        ← cron de sincronização custo/estoque
    orders/service/
      validate-checkout.js    ← validação server-side (preço, margem)
```

## Setup (15 minutos)

### 1. Node.js
Instale a versão LTS em https://nodejs.org (confira com `node --version`).

### 2. Banco de dados (Supabase, grátis)
1. Crie conta em https://supabase.com → New Project (guarde a senha do banco).
2. Em **Settings → Database → Connection string**, copie a URI no modo
   **Session pooler** (funciona em qualquer rede, IPv4).

### 3. Configuração
```bash
npm install
cp .env.example .env
# edite .env e cole sua DATABASE_URL
```

### 4. Migrations (cria as tabelas + 1 produto de teste)
```bash
npm run migrate
```

### 5. Testar o sync job
O seed aponta o produto de teste para uma API pública (dummyjson.com),
então o sync já funciona de ponta a ponta:
```bash
npm run sync:pretty
```
Você deve ver `SYNC_SUMMARY` com `ok: 1`. Confira no banco:
`supplier_products.cost_cents` e `last_synced_at` terão mudado.

Teste também o caminho de falha: troque a `sync_url` do produto por uma
URL inválida e rode o sync 3 vezes → o produto deve ser pausado
(`available = false`) com o evento `PRODUCT_PAUSED` no log.

### 6. Subir a API
```bash
npm run dev
```
- Catálogo: `GET http://localhost:3000/api/products`
- Checkout (use o id retornado pelo catálogo):
```bash
curl -X POST http://localhost:3000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "customerEmail": "teste@email.com",
    "items": [{ "productId": "<ID_DO_PRODUTO>", "quantity": 1, "expectedUnitPriceCents": 9990 }]
  }'
```
Envie um `expectedUnitPriceCents` errado de propósito para ver o `409 PRICE_CHANGED`.

### 7. Agendar o sync em produção
Qualquer agendador que rode `npm run sync` a cada 30 min:
cron do Railway/Render, GitHub Actions (schedule) ou crontab em VPS.

## Variáveis de ambiente
Ver `.env.example` — todas documentadas lá.

## Próximos módulos (roadmap)
1. Gateway de pagamento (Pix) com webhook + idempotência → move pedido para `paid`
2. Repasse automático ao fornecedor (supplier_orders `pending → placed`)
3. Frontend da loja (Next.js) consumindo `/api/products`
4. Score de confiabilidade calculado a partir de `shipped_at - placed_at`
