/**
 * server.js — ponto de entrada da loja (API)
 * Rodar: npm run dev
 *
 * Rotas:
 *   GET  /api/products                        → catálogo (produto + custo/margem do fornecedor primário)
 *   POST /api/checkout                        → valida e cria o pedido com snapshots (carrinho, sem gateway ainda)
 *   POST /checkout                            → checkout Pix real: pedido + cobrança Asaas + QR code
 *   GET  /api/orders/:id/status                → status do pedido; se pending, checa a Asaas direto (fallback pro webhook)
 *   POST /webhooks/asaas                      → notificação de pagamento; cria repasse (supplier_orders) ao confirmar pagamento
 *   GET  /admin/supplier-orders/pending        → (auth: x-admin-token) lista de compras pendentes com o fornecedor
 *   POST /admin/supplier-orders/:id/mark-placed → (auth: x-admin-token) marca repasse como feito manualmente
 *   GET  /health                              → healthcheck
 */
const { randomUUID, timingSafeEqual } = require('crypto');
const express = require('express');
const { Pool } = require('pg');
const { logger } = require('./src/shared/lib/logger');
const { validateCheckout } = require('./src/modules/orders/service/validate-checkout');
const { markOrderPaidByPaymentId } = require('./src/modules/orders/service/mark-order-paid');
const {
  createCustomer,
  createPixCharge,
  getPixQrCode,
  getPaymentStatus,
} = require('./src/modules/payments/gateway/asaas-client');

const app = express();
app.use(express.json());

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
      `SELECT p.id, p.name, p.slug, p.sale_price_cents, p.description,
              COALESCE(p.attributes->'photos', '[]'::jsonb) AS photos,
              COALESCE((p.attributes->>'featured')::boolean, false) AS featured,
              s.name AS supplier_name, s.avg_shipping_days
         FROM products p
         JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_primary = true
         JOIN suppliers s ON s.id = sp.supplier_id
        WHERE p.active = true AND sp.available = true
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
      `SELECT p.id, p.name, p.slug, p.sale_price_cents, p.description,
              COALESCE(p.attributes->'photos', '[]'::jsonb) AS photos,
              COALESCE((p.attributes->>'featured')::boolean, false) AS featured,
              s.name AS supplier_name, s.avg_shipping_days
         FROM products p
         JOIN supplier_products sp ON sp.product_id = p.id AND sp.is_primary = true
         JOIN suppliers s ON s.id = sp.supplier_id
        WHERE p.active = true AND sp.available = true AND p.slug = $1
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

/**
 * Checkout Pix (fluxo real com Asaas) — um produto por pedido.
 * Body esperado:
 * {
 *   "customerEmail": "cliente@email.com",
 *   "customerName": "Cliente Teste",
 *   "customerCpfCnpj": "12345678900",
 *   "productSlug": "escorredor-suspenso",
 *   "quantity": 1,
 *   "shippingStreet": "Rua das Flores",
 *   "shippingNumber": "123",
 *   "shippingComplement": "Apto 45",       // opcional
 *   "shippingNeighborhood": "Centro",
 *   "shippingCity": "Curitiba",
 *   "shippingState": "PR",                 // UF, 2 letras
 *   "shippingZipCode": "80000-000"
 * }
 *
 * Diferente de /api/checkout (carrinho com múltiplos itens, ainda sem
 * gateway plugado): esta rota cria o pedido no banco E a cobrança Pix
 * no Asaas, devolvendo o QR code pro cliente pagar.
 */
app.post('/checkout', async (req, res) => {
  const {
    customerEmail,
    customerName,
    customerCpfCnpj,
    productSlug,
    quantity,
    shippingStreet,
    shippingNumber,
    shippingComplement,
    shippingNeighborhood,
    shippingCity,
    shippingState,
    shippingZipCode,
  } = req.body || {};

  const missing = [];
  if (!customerEmail) missing.push('customerEmail');
  if (!customerName) missing.push('customerName');
  if (!customerCpfCnpj) missing.push('customerCpfCnpj');
  if (!productSlug) missing.push('productSlug');
  if (quantity === undefined || quantity === null) missing.push('quantity');
  if (!shippingStreet) missing.push('shippingStreet');
  if (!shippingNumber) missing.push('shippingNumber');
  if (!shippingNeighborhood) missing.push('shippingNeighborhood');
  if (!shippingCity) missing.push('shippingCity');
  if (!shippingState) missing.push('shippingState');
  if (!shippingZipCode) missing.push('shippingZipCode');
  // shippingComplement é o único campo de endereço opcional (nem toda
  // casa/prédio tem complemento).

  if (missing.length > 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: `Campos obrigatórios faltando: ${missing.join(', ')}` },
    });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'quantity precisa ser um número inteiro maior que zero' },
    });
  }

  if (shippingState.length !== 2) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'shippingState precisa ter exatamente 2 letras (UF)' },
    });
  }

  // 1) Produto: preço SEMPRE do banco, nunca de um valor vindo do cliente.
  let product;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sale_price_cents FROM products WHERE slug = $1 AND active = true LIMIT 1`,
      [productSlug]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'PRODUCT_NOT_FOUND' } });
    }
    product = rows[0];
  } catch (err) {
    req.log.error({ err }, 'Erro ao buscar produto no checkout Pix');
    return res.status(500).json({ error: { code: 'INTERNAL' } });
  }

  const totalCents = product.sale_price_cents * quantity;

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

    const {
      rows: [orderRow],
    } = await client.query(
      `INSERT INTO orders (
         customer_id, status, total_cents,
         shipping_street, shipping_number, shipping_complement,
         shipping_neighborhood, shipping_city, shipping_state, shipping_zip_code
       ) VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        customer.id,
        totalCents,
        shippingStreet,
        shippingNumber,
        shippingComplement || null,
        shippingNeighborhood,
        shippingCity,
        shippingState.toUpperCase(),
        shippingZipCode,
      ]
    );
    order = orderRow;

    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [order.id, product.id, product.name, product.sale_price_cents, quantity]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    req.log.error({ err }, 'Erro ao criar pedido no checkout Pix');
    return res.status(500).json({ error: { code: 'INTERNAL' } });
  } finally {
    client.release();
  }

  req.log.info({ event: 'ORDER_CREATED', orderId: order.id, totalCents }, 'Pedido criado (checkout Pix)');

  // 4) Asaas: cliente + cobrança + QR code. O pedido JÁ existe no banco
  // aqui — se algo falhar a partir deste ponto, ele fica 'pending' (não
  // 'failed': o Asaas pode ter processado parcialmente, e o cliente pode
  // tentar de novo), mas logamos com o order.id pra dar pra investigar
  // ou retomar manualmente.
  try {
    const currentAsaasEnvironment = getCurrentAsaasEnvironment();
    let asaasCustomerId = customer.asaas_customer_id;

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

    res.status(201).json({
      orderId: order.id,
      payload: qr.payload,
      qrCodeImage: qr.encodedImage,
      expirationDate: qr.expirationDate,
    });
  } catch (err) {
    req.log.error(
      { err, orderId: order.id, event: 'ORDER_PIX_CHARGE_FAILED' },
      'Falha ao gerar cobrança Pix no Asaas — pedido permanece pending para nova tentativa'
    );
    res.status(502).json({ error: { code: 'PAYMENT_GATEWAY_ERROR', orderId: order.id } });
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
  if (!PAID_EVENTS.includes(asaasEvent) || !payment?.id) {
    // Evento que não nos interessa ainda (ex: PAYMENT_OVERDUE) — só confirma.
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
