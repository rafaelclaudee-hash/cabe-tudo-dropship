/**
 * server.js — ponto de entrada da loja (API)
 * Rodar: npm run dev
 *
 * Rotas:
 *   GET  /api/products                        → catálogo (produto + custo/margem do fornecedor primário)
 *   POST /api/checkout                        → valida e cria o pedido com snapshots (carrinho, sem gateway ainda)
 *   POST /checkout                            → checkout real (1+ itens): pedido + cobrança Asaas (Pix/cartão/boleto)
 *   GET  /api/orders/:id/status                → status do pedido; se pending, checa a Asaas direto (fallback pro webhook)
 *   GET  /api/orders/tracking/:orderId         → rastreio público (página /rastrear) — sem dados sensíveis
 *   POST /webhooks/asaas                      → notificação de pagamento; cria repasse (supplier_orders) ao confirmar pagamento
 *   GET  /admin/supplier-orders/pending        → (auth: x-admin-token) lista de compras pendentes com o fornecedor
 *   POST /admin/supplier-orders/:id/mark-placed → (auth: x-admin-token) marca repasse como feito manualmente
 *   POST /api/auth/register                   → cria conta de cliente (nome, email, senha, aceite_privacidade)
 *   POST /api/auth/login                      → login (email, senha) → cookie de sessão (JWT httpOnly)
 *   GET  /api/auth/me                         → dados da conta logada (via cookie de sessão)
 *   POST /api/auth/logout                     → limpa o cookie de sessão
 *   POST /api/newsletter/subscribe            → captura e-mail pra newsletter (idempotente, sem disparo de campanha)
 *   GET  /health                              → healthcheck
 */
const { randomUUID, timingSafeEqual } = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { logger } = require('./src/shared/lib/logger');
const { validateCheckout } = require('./src/modules/orders/service/validate-checkout');
const { markOrderPaidByPaymentId } = require('./src/modules/orders/service/mark-order-paid');
const {
  createCustomer,
  createPixCharge,
  getPixQrCode,
  getPaymentStatus,
  createCreditCardCharge,
  createBoletoCharge,
  getBoletoIdentificationField,
} = require('./src/modules/payments/gateway/asaas-client');
const { notifyOrderStatusToUtmify } = require('./src/modules/tracking/service/notify-utmify');

const app = express();
app.use(express.json());
app.use(cookieParser());

// Render (como Heroku) fica atrás de um proxy reverso — sem isso, req.ip
// devolve o IP interno do proxy, não o do cliente. O Asaas exige o IP
// real do comprador (remoteIp) nas cobranças de cartão pra antifraude.
app.set('trust proxy', true);

const dbUrl = process.env.DATABASE_URL || '';
const maskedDbUrl = dbUrl.replace(/(postgresql:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
const dbUserMatch = dbUrl.match(/postgresql:\/\/([^:]+):/);
const dbHostMatch = dbUrl.match(/@([^:]+):/);
const dbPortMatch = dbUrl.match(/:([0-9]+)\//);
console.log('DB_RUNTIME:', {
  dbUrl: maskedDbUrl,
  dbUser: dbUserMatch ? dbUserMatch[1] : undefined,
  dbHost: dbHostMatch ? dbHostMatch[1] : undefined,
  dbPort: dbPortMatch ? dbPortMatch[1] : undefined,
  cwd: process.cwd()
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Request ID em toda requisição → toda linha de log é rastreável
app.use((req, res, next) => {
  req.id = randomUUID();
  req.log = logger.child({ requestId: req.id, path: req.path });
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Catálogo: produtos ativos com fornecedor primário disponível
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.slug, p.sale_price_cents, p.description, p.category,
              p.max_installments,
              COALESCE(p.attributes->'photos', '[]'::jsonb) AS photos,
              COALESCE((p.attributes->>'featured')::boolean, false) AS featured,
              sp.available,
              s.name AS supplier_name, s.avg_shipping_days
         FROM products p
         JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_primary = true
         JOIN suppliers s ON s.id = sp.supplier_id
        WHERE p.active = true AND p.hidden_from_catalog = false
        ORDER BY p.created_at DESC
        LIMIT 50`
    );
    res.json({ products: rows });
  } catch (err) {
    req.log.error({ err }, 'Erro ao listar produtos');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

app.get('/api/products/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.slug, p.sale_price_cents, p.description, p.category,
              p.max_installments,
              COALESCE(p.attributes->'photos', '[]'::jsonb) AS photos,
              COALESCE((p.attributes->>'featured')::boolean, false) AS featured,
              sp.available,
              s.name AS supplier_name, s.avg_shipping_days
         FROM products p
         JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_primary = true
         JOIN suppliers s ON s.id = sp.supplier_id
        WHERE p.active = true AND p.slug = $1
        LIMIT 1`,
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, 'Erro ao buscar produto por slug');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

app.get('/api/orders', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'missing_email' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT o.id AS order_id,
              o.status,
              o.total_cents,
              o.created_at,
              oi.product_name,
              oi.quantity,
              oi.unit_price_cents
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE c.email = $1
        ORDER BY o.created_at DESC, o.id, oi.id`,
      [email]
    );

    const ordersById = new Map();
    for (const row of rows) {
      if (!ordersById.has(row.order_id)) {
        ordersById.set(row.order_id, {
          id: row.order_id,
          status: row.status,
          total_cents: row.total_cents,
          created_at: row.created_at,
          items: []
        });
      }
      if (row.product_name) {
        ordersById.get(row.order_id).items.push({
          product_name: row.product_name,
          quantity: row.quantity,
          unit_price_cents: row.unit_price_cents
        });
      }
    }

    res.json({ orders: Array.from(ordersById.values()) });
  } catch (err) {
    req.log.error({ err }, 'Erro ao buscar pedidos por email');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

/**
 * Status do pedido — com fallback ativo pro webhook.
 *
 * Se orders.status já é 'paid', devolve direto (não gasta chamada na Asaas).
 * Se ainda é 'pending' e o pedido tem asaas_payment_id, consulta a Asaas
 * na hora: se ela confirmar RECEIVED/CONFIRMED mas nosso banco ainda não
 * sabe disso (entrega do webhook atrasada, falhou, ou nunca chegou —
 * confirmado na prática: instância que hiberna pode perder a janela de
 * entrega), corrige o pedido aqui mesmo, reaproveitando a MESMA função
 * que o webhook usa (markOrderPaidByPaymentId) — idempotente por
 * construção, então não importa se o webhook chegar antes, depois, ou
 * ao mesmo tempo que esta checagem.
 */
app.get('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, status, asaas_payment_id FROM orders WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND' } });
    }

    const order = rows[0];

    if (order.status === 'paid' || !order.asaas_payment_id) {
      return res.json({ orderId: order.id, status: order.status });
    }

    const PAID_ASAAS_STATUSES = ['RECEIVED', 'CONFIRMED'];
    let asaasPayment;
    try {
      asaasPayment = await getPaymentStatus(order.asaas_payment_id, { log: req.log });
    } catch (err) {
      // Asaas fora do ar/instável não pode quebrar a checagem de status —
      // só devolve o que já sabemos localmente.
      req.log.warn({ err, orderId: order.id }, 'Falha ao consultar status na Asaas — devolvendo status local');
      return res.json({ orderId: order.id, status: order.status });
    }

    if (!PAID_ASAAS_STATUSES.includes(asaasPayment.status)) {
      return res.json({ orderId: order.id, status: order.status });
    }

    // Asaas confirma pago, nosso banco ainda não sabia — corrige agora.
    const result = await markOrderPaidByPaymentId(pool, order.asaas_payment_id, req.log, {
      source: 'status-check',
    });

    if (result.outcome === 'PAID') {
      req.log.info(
        { event: 'ORDER_STATUS_CHECK_DETECTED_PAYMENT', orderId: order.id },
        'Checagem ativa detectou pagamento que o webhook ainda não tinha confirmado'
      );
    }

    const finalStatus = result.outcome === 'NOT_FOUND' ? order.status : 'paid';
    res.json({ orderId: order.id, status: finalStatus });
  } catch (err) {
    req.log.error({ err, orderId: id }, 'Erro ao consultar status do pedido');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

const ORDER_TRACKING_UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// URL de rastreio por transportadora — dict simples, sem integração com
// API de transportadora nenhuma (fora de escopo por ora). Carrier
// desconhecido ou ausente = carrier_url null (front mostra "copie e
// cole no site da transportadora").
const CARRIER_TRACKING_URL_BUILDERS = {
  correios: (code) => `https://rastreamento.correios.com.br/app/index.php?objetos=${code}`,
  jadlog: (code) => `https://www.jadlog.com.br/tracking?cte=${code}`,
  loggi: (code) => `https://www.loggi.com/rastreador/${code}`,
};

function buildCarrierTrackingUrl(carrier, trackingCode) {
  if (!carrier || !trackingCode) return null;
  const builder = CARRIER_TRACKING_URL_BUILDERS[carrier.toLowerCase()];
  return builder ? builder(encodeURIComponent(trackingCode)) : null;
}

/**
 * Rastreio público do pedido — usado pela página /rastrear. Sem
 * autenticação: o UUID do pedido é longo e não sequencial, obscuro o
 * bastante pra servir de "chave" (mesma lógica de /api/orders/:id/status).
 *
 * NUNCA retorna endereço, CPF, email ou valor — só o mínimo pro
 * cliente saber onde o pedido está. Quem decide QUAL tela mostrar
 * (reembolsado / enviado / pago-preparando / aguardando pagamento) é o
 * front, a partir destes campos crus — esta rota não computa "estado".
 */
app.get('/api/orders/tracking/:orderId', async (req, res) => {
  const { orderId } = req.params;

  if (!ORDER_TRACKING_UUID_FORMAT.test(orderId)) {
    return res.status(400).json({ error: { code: 'INVALID_ORDER_ID' } });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, status, tracking_code, carrier, shipped_at FROM orders WHERE id = $1`,
      [orderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'ORDER_NOT_FOUND' } });
    }

    const order = rows[0];

    res.json({
      id: order.id,
      status: order.status,
      tracking_code: order.tracking_code,
      carrier: order.carrier,
      shipped_at: order.shipped_at,
      carrier_url: buildCarrierTrackingUrl(order.carrier, order.tracking_code),
    });
  } catch (err) {
    req.log.error({ err, orderId }, 'Erro ao buscar rastreio do pedido');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

/**
 * Checkout
 * Body esperado:
 * {
 *   "customerEmail": "cliente@email.com",
 *   "items": [{ "productId": "...", "quantity": 1, "expectedUnitPriceCents": 9990 }]
 * }
 */
app.post('/api/checkout', async (req, res) => {
  const { customerEmail, items } = req.body || {};
  if (!customerEmail || !Array.isArray(items)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'customerEmail e items são obrigatórios' } });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Validação: disponibilidade, preço exibido vs atual, margem atual
    const result = await validateCheckout(client, items, { requestId: req.id });
    if (!result.ok) {
      await client.query('ROLLBACK');
      // 409: o front usa result.problems para re-renderizar o carrinho
      return res.status(409).json({ error: result });
    }

    // 2) Cliente (upsert por email — simplificação de MVP, sem auth ainda)
    const { rows: [customer] } = await client.query(
      `INSERT INTO customers (email) VALUES ($1)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [customerEmail]
    );

    // 3) Pedido + itens (SNAPSHOT de nome e preço)
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (customer_id, status, total_cents)
       VALUES ($1, 'pending', $2) RETURNING id`,
      [customer.id, result.order.totalCents]
    );

    for (const item of result.order.items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.productName, item.unitPriceCents, item.quantity]
      );
    }

    // 4) Repasse ao fornecedor: um supplier_order por fornecedor,
    //    com SNAPSHOT do custo no momento da venda
    const bySupplier = new Map();
    for (const item of result.order.items) {
      const acc = bySupplier.get(item.supplierId) || 0;
      bySupplier.set(item.supplierId, acc + item.unitCostCents * item.quantity);
    }
    for (const [supplierId, costCents] of bySupplier) {
      await client.query(
        `INSERT INTO supplier_orders (order_id, supplier_id, status, cost_cents)
         VALUES ($1, $2, 'pending', $3)`,
        [order.id, supplierId, costCents]
      );
    }

    await client.query('COMMIT');

    // 5) PRÓXIMO PASSO (fora desta transação): criar a cobrança no
    //    gateway (Pix/cartão) com chave de idempotência = order.id.
    //    O webhook de pagamento é quem move o status para 'paid'.
    req.log.info({ event: 'ORDER_CREATED', orderId: order.id, totalCents: result.order.totalCents }, 'Pedido criado');
    res.status(201).json({ ok: true, orderId: order.id, totalCents: result.order.totalCents });
  } catch (err) {
    await client.query('ROLLBACK');
    req.log.error({ err }, 'Erro inesperado no checkout');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  } finally {
    client.release();
  }
});

/**
 * Sandbox e Produção são bases de cliente COMPLETAMENTE separadas na
 * Asaas — um asaas_customer_id criado num ambiente não existe no outro.
 * Deriva o ambiente atual de ASAAS_BASE_URL, sem hardcode: "sandbox" na
 * URL = sandbox, qualquer outra coisa = produção.
 */
function getCurrentAsaasEnvironment() {
  const baseUrl = process.env.ASAAS_BASE_URL || '';
  return baseUrl.includes('sandbox') ? 'sandbox' : 'production';
}

const VALID_PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'BOLETO'];

/**
 * Checkout (fluxo real com Asaas) — um pedido com 1 ou mais itens.
 * Body esperado (comum aos 3 métodos):
 * {
 *   "customerEmail": "cliente@email.com",
 *   "customerName": "Cliente Teste",
 *   "customerCpfCnpj": "12345678900",
 *   "items": [
 *     { "productSlug": "escorredor-suspenso", "quantity": 1 },
 *     { "productSlug": "kit-5-potes-hermeticos", "quantity": 2 }
 *   ],
 *   "shippingStreet": "Rua das Flores",
 *   "shippingNumber": "123",
 *   "shippingComplement": "Apto 45",       // opcional
 *   "shippingNeighborhood": "Centro",
 *   "shippingCity": "Curitiba",
 *   "shippingState": "PR",                 // UF, 2 letras
 *   "shippingZipCode": "80000-000",
 *   "paymentMethod": "PIX"                 // "PIX" (default) | "CREDIT_CARD" | "BOLETO"
 * }
 *
 * Campos extras quando paymentMethod = "CREDIT_CARD":
 * {
 *   "installments": 1,                     // 1 até products.max_installments
 *   "cardNumber": "5162306219378829",
 *   "cardExpiryMonth": "05",
 *   "cardExpiryYear": "2030",
 *   "cardCvv": "318",
 *   "cardHolderName": "Cliente Teste",
 *   "cardHolderPhone": "53999999999"
 * }
 *
 * Diferente de /api/checkout (carrinho com múltiplos itens, ainda sem
 * gateway plugado): esta rota cria o pedido no banco E a cobrança no
 * Asaas, devolvendo o que o front precisa pra cada método (QR Pix,
 * confirmação de cartão, ou boleto).
 */
app.post('/checkout', async (req, res) => {
  const {
    customerEmail,
    customerName,
    customerCpfCnpj,
    items,
    shippingStreet,
    shippingNumber,
    shippingComplement,
    shippingNeighborhood,
    shippingCity,
    shippingState,
    shippingZipCode,
    paymentMethod: rawPaymentMethod,
    installments,
    cardNumber,
    cardExpiryMonth,
    cardExpiryYear,
    cardCvv,
    cardHolderName,
    cardHolderPhone,
    utmSource,
    utmCampaign,
    utmMedium,
    utmContent,
    utmTerm,
    src,
    sck,
  } = req.body || {};

  // Sem paymentMethod no body = PIX, pro comportamento de antes desta
  // rota ganhar cartão/boleto continuar funcionando sem mudança nenhuma.
  const paymentMethod = rawPaymentMethod || 'PIX';
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: `paymentMethod precisa ser um de: ${VALID_PAYMENT_METHODS.join(', ')}` },
    });
  }

  const missing = [];
  if (!customerEmail) missing.push('customerEmail');
  if (!customerName) missing.push('customerName');
  if (!customerCpfCnpj) missing.push('customerCpfCnpj');
  if (!shippingStreet) missing.push('shippingStreet');
  if (!shippingNumber) missing.push('shippingNumber');
  if (!shippingNeighborhood) missing.push('shippingNeighborhood');
  if (!shippingCity) missing.push('shippingCity');
  if (!shippingState) missing.push('shippingState');
  if (!shippingZipCode) missing.push('shippingZipCode');
  // shippingComplement é o único campo de endereço opcional (nem toda
  // casa/prédio tem complemento).

  if (paymentMethod === 'CREDIT_CARD') {
    if (installments === undefined || installments === null) missing.push('installments');
    if (!cardNumber) missing.push('cardNumber');
    if (!cardExpiryMonth) missing.push('cardExpiryMonth');
    if (!cardExpiryYear) missing.push('cardExpiryYear');
    if (!cardCvv) missing.push('cardCvv');
    if (!cardHolderName) missing.push('cardHolderName');
    if (!cardHolderPhone) missing.push('cardHolderPhone');
  }

  if (missing.length > 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: `Campos obrigatórios faltando: ${missing.join(', ')}` },
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'items precisa ser uma lista com pelo menos 1 produto' },
    });
  }

  const invalidItem = items.find(
    (item) => !item || typeof item.productSlug !== 'string' || !item.productSlug || !Number.isInteger(item.quantity) || item.quantity <= 0
  );
  if (invalidItem) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'cada item precisa de productSlug (string) e quantity (inteiro maior que zero)' },
    });
  }

  if (shippingState.length !== 2) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'shippingState precisa ter exatamente 2 letras (UF)' },
    });
  }

  if (paymentMethod === 'CREDIT_CARD' && (!Number.isInteger(installments) || installments < 1)) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'installments precisa ser um número inteiro maior ou igual a 1' },
    });
  }

  // 1) Produtos: preço, disponibilidade e limite de parcelas SEMPRE do
  // banco, nunca de um valor vindo do cliente. Junta com
  // supplier_products pra também travar available = true aqui — a
  // rota antiga só checava active, e um item "Em breve" nunca deveria
  // completar checkout mesmo se alguém montar a chamada na mão.
  let cartProducts;
  try {
    const slugs = items.map((item) => item.productSlug);
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.slug, p.sale_price_cents, p.max_installments, sp.available
         FROM products p
         JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_primary = true
        WHERE p.slug = ANY($1::text[]) AND p.active = true`,
      [slugs]
    );

    const bySlug = new Map(rows.map((row) => [row.slug, row]));

    const notFound = slugs.filter((slug) => !bySlug.has(slug));
    if (notFound.length > 0) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: `Produto(s) não encontrado(s): ${notFound.join(', ')}` },
      });
    }

    const unavailable = slugs.filter((slug) => !bySlug.get(slug).available);
    if (unavailable.length > 0) {
      return res.status(409).json({
        error: { code: 'PRODUCT_UNAVAILABLE', message: `Produto(s) indisponível(is): ${unavailable.join(', ')}` },
      });
    }

    cartProducts = items.map((item) => ({ ...bySlug.get(item.productSlug), quantity: item.quantity }));
  } catch (err) {
    req.log.error({ err }, 'Erro ao buscar produtos no checkout');
    return res.status(500).json({ error: { code: 'INTERNAL' } });
  }

  // Carrinho com produtos de max_installments diferentes: o limite que
  // vale é o mais restritivo (nunca parcela mais do que QUALQUER item
  // do carrinho permite).
  const effectiveMaxInstallments = Math.min(...cartProducts.map((p) => p.max_installments));

  if (paymentMethod === 'CREDIT_CARD' && installments > effectiveMaxInstallments) {
    return res.status(400).json({
      error: {
        code: 'TOO_MANY_INSTALLMENTS',
        message: `O parcelamento máximo pra este carrinho é ${effectiveMaxInstallments}x (limitado pelo produto com menor limite)`,
      },
    });
  }

  const totalCents = cartProducts.reduce((sum, p) => sum + p.sale_price_cents * p.quantity, 0);

  // A Asaas rejeita qualquer cobrança abaixo de R$ 5,00 (confirmado em
  // produção: "o valor da cobrança menos o desconto não pode ser menor
  // que R$ 5,00"), nos 3 métodos. Checa ANTES de criar o pedido — senão
  // fica um pedido 'pending' no banco sem cobrança nenhuma (órfão) toda
  // vez que a Asaas rejeitar por valor baixo.
  const ASAAS_MIN_CHARGE_CENTS = 500;
  if (totalCents < ASAAS_MIN_CHARGE_CENTS) {
    return res.status(400).json({
      error: { code: 'BELOW_MINIMUM_CHARGE', message: 'Valor mínimo de cobrança: R$ 5,00' },
    });
  }

  // 2) Cliente + 3) Pedido: só banco, então fica numa transação. As
  // chamadas ao Asaas ficam DE FORA (a partir daqui) — são HTTP externo,
  // não devem segurar uma conexão do pool nem uma transação aberta.
  const client = await pool.connect();
  let customer;
  let order;
  try {
    await client.query('BEGIN');

    const {
      rows: [customerRow],
    } = await client.query(
      `INSERT INTO customers (email, name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, asaas_customer_id, asaas_environment`,
      [customerEmail, customerName]
    );
    customer = customerRow;

    // Telefone só existe pro checkout de cartão (formulário não pede
    // telefone pra Pix/Boleto) — fica nulo nesses dois métodos.
    const customerPhone = paymentMethod === 'CREDIT_CARD' ? cardHolderPhone : null;

    const {
      rows: [orderRow],
    } = await client.query(
      `INSERT INTO orders (
         customer_id, status, total_cents, payment_method,
         shipping_street, shipping_number, shipping_complement,
         shipping_neighborhood, shipping_city, shipping_state, shipping_zip_code,
         utm_source, utm_campaign, utm_medium, utm_content, utm_term, src, sck,
         customer_ip, customer_cpf_cnpj, customer_phone
       ) VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id`,
      [
        customer.id,
        totalCents,
        paymentMethod,
        shippingStreet,
        shippingNumber,
        shippingComplement || null,
        shippingNeighborhood,
        shippingCity,
        shippingState.toUpperCase(),
        shippingZipCode,
        utmSource || null,
        utmCampaign || null,
        utmMedium || null,
        utmContent || null,
        utmTerm || null,
        src || null,
        sck || null,
        req.ip,
        customerCpfCnpj,
        customerPhone,
      ]
    );
    order = orderRow;

    for (const p of cartProducts) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, p.id, p.name, p.sale_price_cents, p.quantity]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    req.log.error({ err }, 'Erro ao criar pedido no checkout');
    return res.status(500).json({ error: { code: 'INTERNAL' } });
  } finally {
    client.release();
  }

  req.log.info({ event: 'ORDER_CREATED', orderId: order.id, totalCents, paymentMethod }, 'Pedido criado');

  // Notifica a Utmify em paralelo, sem bloquear a resposta do checkout —
  // notifyOrderStatusToUtmify nunca lança, mas o .catch aqui é só uma
  // segunda rede de segurança (nunca deixar uma promise solta derrubar
  // o processo por unhandledRejection).
  notifyOrderStatusToUtmify(pool, order.id, { status: 'waiting_payment' }, req.log).catch(() => {});

  // 4) Asaas: cliente + cobrança. O pedido JÁ existe no banco aqui — se
  // algo falhar a partir deste ponto, ele fica 'pending' (não 'failed':
  // o Asaas pode ter processado parcialmente, e o cliente pode tentar
  // de novo), mas logamos com o order.id pra dar pra investigar ou
  // retomar manualmente.
  let asaasCustomerId;
  try {
    const currentAsaasEnvironment = getCurrentAsaasEnvironment();
    asaasCustomerId = customer.asaas_customer_id;

    // Um asaas_customer_id salvo de outro ambiente (ex: Sandbox, antes de
    // uma virada pra produção) não existe na base de clientes do ambiente
    // atual — reaproveitar ele falha na Asaas com "invalid_customer".
    // Trata como se não existisse: cria um cliente novo no ambiente certo.
    if (asaasCustomerId && customer.asaas_environment !== currentAsaasEnvironment) {
      req.log.warn(
        {
          event: 'ASAAS_CUSTOMER_ENVIRONMENT_MISMATCH',
          customerId: customer.id,
          staleEnvironment: customer.asaas_environment,
          currentEnvironment: currentAsaasEnvironment,
        },
        'asaas_customer_id salvo pertence a outro ambiente — criando cliente novo'
      );
      asaasCustomerId = null;
    }

    if (!asaasCustomerId) {
      asaasCustomerId = await createCustomer(
        { name: customerName, cpfCnpj: customerCpfCnpj, email: customerEmail },
        { log: req.log }
      );
      await pool.query(
        `UPDATE customers SET asaas_customer_id = $1, asaas_environment = $2 WHERE id = $3`,
        [asaasCustomerId, currentAsaasEnvironment, customer.id]
      );
    }
  } catch (err) {
    req.log.error(
      { err, orderId: order.id, event: 'ORDER_ASAAS_CUSTOMER_FAILED' },
      'Falha ao criar/recuperar cliente na Asaas — pedido permanece pending para nova tentativa'
    );
    return res.status(502).json({ error: { code: 'PAYMENT_GATEWAY_ERROR', orderId: order.id } });
  }

  if (paymentMethod === 'PIX') {
    try {
      const charge = await createPixCharge(
        { customerId: asaasCustomerId, value: totalCents / 100, description: `Pedido #${order.id}` },
        { log: req.log }
      );

      await pool.query(`UPDATE orders SET asaas_payment_id = $1 WHERE id = $2`, [charge.id, order.id]);

      const qr = await getPixQrCode(charge.id, { log: req.log });

      req.log.info(
        { event: 'ORDER_PIX_CHARGE_CREATED', orderId: order.id, paymentId: charge.id },
        'Cobrança Pix criada para o pedido'
      );

      // NÃO usar qr.expirationDate aqui: é a validade TÉCNICA do QR Code
      // (documentado pela Asaas como vencimento + 12 meses — o QR
      // continua escaneável bem além do prazo de pagamento), não o prazo
      // real pro cliente pagar. O prazo real é charge.dueDate (o que a
      // gente mandou na criação da cobrança, ecoado de volta pela Asaas).
      // "Fim do dia" em horário de Brasília, já que dueDate vem só como
      // data (sem hora) e o pagamento é válido até o fim daquele dia.
      const dueDateEndOfDay = `${charge.dueDate}T23:59:59-03:00`;

      return res.status(201).json({
        orderId: order.id,
        paymentMethod: 'PIX',
        payload: qr.payload,
        qrCodeImage: qr.encodedImage,
        expirationDate: dueDateEndOfDay,
      });
    } catch (err) {
      req.log.error(
        { err, orderId: order.id, event: 'ORDER_PIX_CHARGE_FAILED' },
        'Falha ao gerar cobrança Pix no Asaas — pedido permanece pending para nova tentativa'
      );
      return res.status(502).json({ error: { code: 'PAYMENT_GATEWAY_ERROR', orderId: order.id } });
    }
  }

  if (paymentMethod === 'CREDIT_CARD') {
    let payment;
    try {
      payment = await createCreditCardCharge(
        {
          customerId: asaasCustomerId,
          value: totalCents / 100,
          description: `Pedido #${order.id}`,
          installmentCount: installments,
          card: {
            number: cardNumber,
            expiryMonth: cardExpiryMonth,
            expiryYear: cardExpiryYear,
            ccv: cardCvv,
            holderName: cardHolderName,
          },
          holder: {
            name: cardHolderName,
            email: customerEmail,
            cpfCnpj: customerCpfCnpj,
            // Sem formulário de endereço de cobrança separado no MVP —
            // reaproveita o endereço de entrega já coletado.
            postalCode: shippingZipCode,
            addressNumber: shippingNumber,
            addressComplement: shippingComplement || null,
            phone: cardHolderPhone,
          },
          remoteIp: req.ip,
        },
        { log: req.log }
      );
    } catch (err) {
      req.log.error(
        { err, orderId: order.id, event: 'ORDER_CARD_CHARGE_DECLINED' },
        'Cobrança de cartão recusada ou falhou na Asaas'
      );
      const asaasMessage = err.body?.errors?.[0]?.description;
      return res.status(402).json({
        error: {
          code: 'CARD_DECLINED',
          message: asaasMessage || 'Cartão recusado. Confira os dados ou tente outro cartão.',
          orderId: order.id,
        },
      });
    }

    await pool.query(`UPDATE orders SET asaas_payment_id = $1 WHERE id = $2`, [payment.id, order.id]);

    // Cartão autoriza SÍNCRONO na criação — se já veio confirmado, marca
    // o pedido como pago agora (mesma função idempotente do webhook),
    // sem esperar o round-trip do webhook pra o cliente ver "pago".
    const CONFIRMED_STATUSES = ['CONFIRMED', 'RECEIVED'];
    let finalStatus = 'pending';
    if (CONFIRMED_STATUSES.includes(payment.status)) {
      const markResult = await markOrderPaidByPaymentId(pool, payment.id, req.log, { source: 'credit-card-sync' });
      finalStatus = markResult.outcome === 'NOT_FOUND' ? 'pending' : 'paid';
    }

    req.log.info(
      { event: 'ORDER_CARD_CHARGE_CREATED', orderId: order.id, paymentId: payment.id, asaasStatus: payment.status },
      'Cobrança de cartão criada'
    );

    return res.status(201).json({
      orderId: order.id,
      paymentMethod: 'CREDIT_CARD',
      status: finalStatus,
      installments,
      totalCents,
    });
  }

  // paymentMethod === 'BOLETO'
  try {
    const payment = await createBoletoCharge(
      { customerId: asaasCustomerId, value: totalCents / 100, description: `Pedido #${order.id}` },
      { log: req.log }
    );

    await pool.query(`UPDATE orders SET asaas_payment_id = $1 WHERE id = $2`, [payment.id, order.id]);

    const { identificationField, barCode } = await getBoletoIdentificationField(payment.id, { log: req.log });

    req.log.info(
      { event: 'ORDER_BOLETO_CHARGE_CREATED', orderId: order.id, paymentId: payment.id },
      'Cobrança de boleto criada'
    );

    return res.status(201).json({
      orderId: order.id,
      paymentMethod: 'BOLETO',
      bankSlipUrl: payment.bankSlipUrl,
      identificationField,
      barCode,
      dueDate: payment.dueDate,
    });
  } catch (err) {
    req.log.error(
      { err, orderId: order.id, event: 'ORDER_BOLETO_CHARGE_FAILED' },
      'Falha ao gerar cobrança de boleto no Asaas — pedido permanece pending para nova tentativa'
    );
    return res.status(502).json({ error: { code: 'PAYMENT_GATEWAY_ERROR', orderId: order.id } });
  }
});

/**
 * Compara o token recebido no webhook com ASAAS_WEBHOOK_TOKEN em tempo
 * constante (evita timing attack). O check de tamanho ANTES do
 * timingSafeEqual é necessário — a função exige buffers do mesmo
 * tamanho e lança RangeError se não forem, e comparar tamanho de token
 * não vaza nada sensível o suficiente pra importar.
 */
function isValidAsaasWebhookToken(receivedToken) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken || !receivedToken) return false;

  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

/**
 * Webhook do Asaas
 * Body esperado (formato de notificação do Asaas):
 * { "event": "PAYMENT_RECEIVED", "payment": { "id": "pay_...", "status": "RECEIVED", ... } }
 *
 * Ainda NÃO cria pedido nenhum — isso depende do endpoint de checkout
 * real (que preenche orders.asaas_payment_id ao criar a cobrança Pix),
 * que é o próximo passo. Aqui só reage a um pedido que já existe.
 */
app.post('/webhooks/asaas', async (req, res) => {
  // Nome do header confirmado com a doc do Asaas: "asaas-access-token"
  // (é o token que você configura ao cadastrar o webhook no painel deles).
  // Sem essa checagem, qualquer um poderia chamar este endpoint fingindo
  // ser o Asaas e forjar confirmações de pagamento.
  const receivedToken = req.header('asaas-access-token');
  if (!isValidAsaasWebhookToken(receivedToken)) {
    req.log.warn(
      {
        event: 'ASAAS_WEBHOOK_INVALID_TOKEN',
        hasToken: Boolean(receivedToken),
        tokenConfigured: Boolean(process.env.ASAAS_WEBHOOK_TOKEN),
      },
      'Webhook do Asaas rejeitado: token ausente ou inválido'
    );
    return res.status(401).json({ error: { code: 'INVALID_TOKEN' } });
  }

  const { event: asaasEvent, payment } = req.body || {};

  req.log.info(
    { event: 'ASAAS_WEBHOOK_RECEIVED', asaasEvent, paymentId: payment?.id },
    'Webhook do Asaas recebido'
  );

  const PAID_EVENTS = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
  const OVERDUE_EVENTS = ['PAYMENT_OVERDUE'];
  const REFUNDED_EVENTS = ['PAYMENT_REFUNDED'];

  // Boleto vencido sem pagamento — só transiciona pending → overdue
  // (idempotente: se o pedido já foi pago por outro caminho, não mexe).
  // Não notifica a Utmify: não é uma venda perdida, é uma venda que não
  // aconteceu — a Utmify considera abandonado depois de um tempo sozinha.
  if (OVERDUE_EVENTS.includes(asaasEvent) && payment?.id) {
    try {
      const { rows } = await pool.query(
        `UPDATE orders SET status = 'overdue'
          WHERE asaas_payment_id = $1 AND status = 'pending'
          RETURNING id`,
        [payment.id]
      );

      if (rows.length > 0) {
        req.log.info(
          { event: 'ASAAS_WEBHOOK_ORDER_OVERDUE', orderId: rows[0].id, paymentId: payment.id },
          'Boleto vencido sem pagamento — pedido marcado como overdue'
        );
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      req.log.error({ err, paymentId: payment.id }, 'Erro ao marcar pedido como overdue');
      return res.status(500).json({ error: { code: 'INTERNAL' } });
    }
  }

  // Reembolso — só transiciona paid → refunded (idempotente: se não
  // estava pago, não mexe).
  if (REFUNDED_EVENTS.includes(asaasEvent) && payment?.id) {
    try {
      const { rows } = await pool.query(
        `UPDATE orders SET status = 'refunded'
          WHERE asaas_payment_id = $1 AND status = 'paid'
          RETURNING id`,
        [payment.id]
      );

      if (rows.length > 0) {
        req.log.info(
          { event: 'ASAAS_WEBHOOK_ORDER_REFUNDED', orderId: rows[0].id, paymentId: payment.id },
          'Pedido reembolsado'
        );
        notifyOrderStatusToUtmify(pool, rows[0].id, { status: 'refunded', refundedAt: new Date() }, req.log).catch(
          () => {}
        );
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      req.log.error({ err, paymentId: payment.id }, 'Erro ao marcar pedido como refunded');
      return res.status(500).json({ error: { code: 'INTERNAL' } });
    }
  }

  if (!PAID_EVENTS.includes(asaasEvent) || !payment?.id) {
    // Evento que não nos interessa (ex: PAYMENT_DELETED) — só confirma.
    return res.status(200).json({ ok: true });
  }

  try {
    const result = await markOrderPaidByPaymentId(pool, payment.id, req.log, { source: 'webhook' });

    if (result.outcome === 'PAID') {
      req.log.info(
        { event: 'ASAAS_WEBHOOK_ORDER_PAID', orderId: result.orderId, paymentId: payment.id, asaasEvent },
        'Webhook do Asaas confirmou pagamento — pedido marcado como pago'
      );
    } else if (result.outcome === 'NOT_FOUND') {
      // Não podemos fazer o Asaas re-tentar infinitamente por um pedido
      // que não existe do nosso lado — mas o warn é essencial pra investigar.
      req.log.warn(
        { event: 'ASAAS_WEBHOOK_ORDER_NOT_FOUND', paymentId: payment.id, asaasEvent },
        'Webhook do Asaas recebido para um payment_id sem pedido correspondente'
      );
    } else {
      // ALREADY_PAID: webhook duplicado, ou pedido já foi marcado como
      // pago por outro caminho (ex: GET /api/orders/:id/status detectou
      // primeiro) — ignora silenciosamente, sem tratar como erro.
      req.log.info(
        {
          event: 'ASAAS_WEBHOOK_IGNORED',
          orderId: result.orderId,
          currentStatus: result.status,
          paymentId: payment.id,
        },
        'Webhook do Asaas ignorado: pedido não está mais pending'
      );
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err, paymentId: payment.id }, 'Erro ao processar webhook do Asaas');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

/**
 * ==================================================================
 * ROTAS /api/auth/* — conta de cliente (comprador), login com senha.
 * ==================================================================
 * Sessão via JWT em cookie httpOnly (não acessível por JS no browser,
 * mitiga roubo de token por XSS). `secure` só em produção porque em
 * dev local (http://localhost) o browser descarta cookie secure.
 *
 * Tabela: customer_accounts (migration 014) — DIFERENTE de `customers`
 * (usada no checkout, sem senha). Ver comentário na migration.
 */
const SESSION_COOKIE_NAME = 'cabetudo_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function signCustomerSession(customerAccountId) {
  return jwt.sign({ sub: customerAccountId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

function toPublicCustomerAccount(row) {
  return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/auth/register', async (req, res) => {
  const { nome, email, senha, aceite_privacidade } = req.body || {};

  const missing = [];
  if (!nome) missing.push('nome');
  if (!email) missing.push('email');
  if (!senha) missing.push('senha');
  if (missing.length > 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: `Campos obrigatórios faltando: ${missing.join(', ')}` },
    });
  }

  if (!EMAIL_FORMAT.test(email)) {
    return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Email inválido' } });
  }

  if (senha.length < 6) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'A senha precisa ter pelo menos 6 caracteres' },
    });
  }

  // Aceite obrigatório: precisa vir explicitamente `true`, não só "truthy"
  // (uma string "false" também é truthy em JS, então o check é estrito).
  if (aceite_privacidade !== true) {
    return res.status(400).json({
      error: { code: 'PRIVACY_NOT_ACCEPTED', message: 'É necessário aceitar a Política de Privacidade' },
    });
  }

  try {
    const passwordHash = await bcrypt.hash(senha, 10);

    const { rows } = await pool.query(
      `INSERT INTO customer_accounts (name, email, password_hash, privacy_accepted_at)
       VALUES ($1, $2, $3, now())
       RETURNING id, name, email, created_at`,
      [nome, email, passwordHash]
    );

    const account = rows[0];
    const token = signCustomerSession(account.id);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());

    req.log.info({ event: 'CUSTOMER_ACCOUNT_CREATED', customerAccountId: account.id }, 'Conta de cliente criada');
    res.status(201).json({ customer: toPublicCustomerAccount(account) });
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation em customer_accounts.email
      return res.status(409).json({ error: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Já existe uma conta com este email' } });
    }
    req.log.error({ err }, 'Erro ao criar conta de cliente');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body || {};

  if (!email || !senha) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email e senha são obrigatórios' } });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash, created_at FROM customer_accounts WHERE email = $1`,
      [email]
    );

    // Mensagem genérica em ambos os casos (email não existe / senha errada)
    // — não dá pra um atacante descobrir se um email tem conta ou não.
    if (rows.length === 0) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos' } });
    }

    const account = rows[0];
    const passwordMatches = await bcrypt.compare(senha, account.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos' } });
    }

    const token = signCustomerSession(account.id);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());

    req.log.info({ event: 'CUSTOMER_LOGIN', customerAccountId: account.id }, 'Login de cliente');
    res.json({ customer: toPublicCustomerAccount(account) });
  } catch (err) {
    req.log.error({ err }, 'Erro ao autenticar cliente');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, created_at FROM customer_accounts WHERE id = $1`,
      [payload.sub]
    );

    if (rows.length === 0) {
      // Conta pode ter sido apagada depois do token emitido — trata como deslogado.
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED' } });
    }

    res.json({ customer: toPublicCustomerAccount(rows[0]) });
  } catch (err) {
    req.log.error({ err }, 'Erro ao buscar conta logada');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // clearCookie NÃO deve receber maxAge: se receber, o cookie module usa
  // esse maxAge pra computar Expires (sobrescrevendo o "expira no passado"
  // que clearCookie tentaria aplicar) — o cookie ficaria com valor vazio
  // mas Expires ainda 30 dias no futuro.
  const { maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
  res.json({ ok: true });
});

/**
 * Newsletter — só captura e armazena, sem disparo de campanha (envio é
 * manual via Zoho Mail). Idempotente por email: inscrever de novo o
 * mesmo email nunca é erro, só confirma (evita vazar se um email já
 * está cadastrado, e evita duplicata sem o cliente precisar saber
 * disso).
 */
app.post('/api/newsletter/subscribe', async (req, res) => {
  const { email, aceite_lgpd, origem } = req.body || {};

  if (!email || !EMAIL_FORMAT.test(email)) {
    return res.status(400).json({ error: { code: 'INVALID_EMAIL', message: 'Email inválido' } });
  }

  if (aceite_lgpd !== true) {
    return res.status(400).json({
      error: { code: 'PRIVACY_NOT_ACCEPTED', message: 'É necessário aceitar receber e-mails e a Política de Privacidade' },
    });
  }

  try {
    await pool.query(
      `INSERT INTO newsletter_subscribers (email, aceite_lgpd, origem)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [email, aceite_lgpd, origem || null]
    );

    req.log.info({ event: 'NEWSLETTER_SUBSCRIBED', origem }, 'Inscrição na newsletter');
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, 'Erro ao inscrever na newsletter');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

/**
 * ==================================================================
 * ROTAS /admin/* — protegidas por token estático (ADMIN_TOKEN).
 * ==================================================================
 * Mesmo padrão do webhook do Asaas: header simples + comparação em
 * tempo constante. NÃO é um sistema de login — é um segredo único
 * compartilhado, suficiente pra MVP de uso pessoal. Antes de qualquer
 * exposição mais ampla (múltiplos admins, deploy que outras pessoas
 * acessam), isso precisa evoluir pra autenticação de verdade (usuário
 * + senha, ou OAuth) — um token estático não distingue QUEM está
 * acessando, só SE quem acessa conhece o segredo.
 */
function isValidAdminToken(receivedToken) {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken || !receivedToken) return false;

  const expected = Buffer.from(expectedToken);
  const received = Buffer.from(receivedToken);
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

function requireAdminToken(req, res, next) {
  const receivedToken = req.header('x-admin-token');
  if (!isValidAdminToken(receivedToken)) {
    req.log.warn(
      {
        event: 'ADMIN_AUTH_FAILED',
        hasToken: Boolean(receivedToken),
        tokenConfigured: Boolean(process.env.ADMIN_TOKEN),
        path: req.path,
      },
      'Acesso negado a rota /admin — token ausente ou inválido'
    );
    return res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
  }
  next();
}

// Aplicado no prefixo inteiro — cobre as rotas de hoje E qualquer
// /admin/* que for adicionada depois, sem precisar lembrar de repetir
// o middleware rota por rota.
app.use('/admin', requireAdminToken);

/**
 * "Lista de compras": supplier_orders pendentes de repasse, com tudo
 * que você precisa pra comprar da Alpha Star e saber pra onde mandar —
 * produto, quantidade, endereço de entrega, dados do cliente.
 */
app.get('/admin/supplier-orders/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT so.id AS supplier_order_id,
              so.order_id,
              so.cost_cents,
              so.created_at,
              s.name AS supplier_name,
              c.name AS customer_name,
              c.email AS customer_email,
              o.shipping_street, o.shipping_number, o.shipping_complement,
              o.shipping_neighborhood, o.shipping_city, o.shipping_state, o.shipping_zip_code,
              oi.product_name, oi.quantity
         FROM supplier_orders so
         JOIN orders o     ON o.id = so.order_id
         JOIN customers c  ON c.id = o.customer_id
         JOIN suppliers s  ON s.id = so.supplier_id
         JOIN order_items oi ON oi.order_id = so.order_id
         JOIN supplier_products sp
           ON sp.product_id = oi.product_id
          AND sp.is_primary = true
          AND sp.supplier_id = so.supplier_id
        WHERE so.status = 'pending'
        ORDER BY so.created_at ASC, so.id, oi.id`
    );

    // Uma linha por item — agrupa por supplier_order (pode ter vários
    // produtos do mesmo fornecedor no mesmo pedido).
    const bySupplierOrder = new Map();
    for (const row of rows) {
      if (!bySupplierOrder.has(row.supplier_order_id)) {
        bySupplierOrder.set(row.supplier_order_id, {
          supplier_order_id: row.supplier_order_id,
          order_id: row.order_id,
          supplier_name: row.supplier_name,
          cost_cents: row.cost_cents,
          created_at: row.created_at,
          customer_name: row.customer_name,
          customer_email: row.customer_email,
          shipping_address: {
            street: row.shipping_street,
            number: row.shipping_number,
            complement: row.shipping_complement,
            neighborhood: row.shipping_neighborhood,
            city: row.shipping_city,
            state: row.shipping_state,
            zip_code: row.shipping_zip_code,
          },
          items: [],
        });
      }
      bySupplierOrder.get(row.supplier_order_id).items.push({
        product_name: row.product_name,
        quantity: row.quantity,
      });
    }

    res.json({ supplierOrders: Array.from(bySupplierOrder.values()) });
  } catch (err) {
    req.log.error({ err }, 'Erro ao listar supplier_orders pendentes');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

/**
 * Marca manualmente que o repasse foi feito de verdade com o fornecedor
 * (telefone, WhatsApp, site deles — o que for). Idempotente: só afeta
 * linha que ainda esteja 'pending'.
 */
app.post('/admin/supplier-orders/:id/mark-placed', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE supplier_orders SET status = 'placed', placed_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, status, placed_at`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'SUPPLIER_ORDER_NOT_PENDING_OR_NOT_FOUND' } });
    }

    req.log.info(
      { event: 'SUPPLIER_ORDER_PLACED', supplierOrderId: id },
      'Repasse ao fornecedor marcado como placed'
    );
    res.json({ ok: true, supplierOrder: rows[0] });
  } catch (err) {
    req.log.error({ err, supplierOrderId: id }, 'Erro ao marcar supplier_order como placed');
    res.status(500).json({ error: { code: 'INTERNAL' } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info({ port: PORT }, 'Loja no ar'));
