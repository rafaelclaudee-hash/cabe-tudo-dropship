/**
 * test-supplier-orders-flow.js
 * ------------------------------------------------------------------
 * Testa o ciclo completo de repasse ao fornecedor, de ponta a ponta:
 *
 *   POST /checkout (Pix)
 *     → simula o webhook do Asaas confirmando o pagamento
 *       → confirma orders.status = 'paid' e supplier_orders criado
 *         → GET /admin/supplier-orders/pending (deve aparecer)
 *           → POST /admin/supplier-orders/:id/mark-placed
 *             → GET /admin/supplier-orders/pending de novo (deve sumir)
 *
 * Pré-requisito: o servidor precisa estar rodando (`npm run dev`).
 *
 * Rodar: npm run test:supplier-orders-flow
 * Apagar depois de usar — não é código de produção.
 */
const { Pool } = require('pg');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function printSection(title) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n${title}\n${line}`);
}

function generateValidCpf() {
  const calcDigit = (digits) => {
    let sum = 0;
    let weight = digits.length + 1;
    for (const d of digits) {
      sum += d * weight;
      weight--;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 9));
  const d1 = calcDigit(base);
  const d2 = calcDigit([...base, d1]);
  return [...base, d1, d2].join('');
}

const TEST_EMAIL = 'supplier-orders-teste@example.com';

async function main() {
  printSection('0/6 — Achando um produto ativo pra testar');
  const { rows: products } = await pool.query(
    `SELECT slug, name, sale_price_cents FROM products WHERE active = true LIMIT 1`
  );
  if (products.length === 0) throw new Error('Nenhum produto ativo encontrado.');
  const product = products[0];
  console.log('Produto:', product);

  printSection('1/6 — POST /checkout (cria pedido + cobrança Pix)');
  const checkoutPayload = {
    customerEmail: TEST_EMAIL,
    customerName: 'Cliente Teste Supplier Orders',
    customerCpfCnpj: generateValidCpf(),
    productSlug: product.slug,
    quantity: 1,
    shippingStreet: 'Rua Teste',
    shippingNumber: '100',
    shippingComplement: 'Fundos',
    shippingNeighborhood: 'Bairro Teste',
    shippingCity: 'Curitiba',
    shippingState: 'PR',
    shippingZipCode: '80000-000',
  };

  const checkoutRes = await fetch(`${BASE_URL}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload),
  });
  const checkoutData = await checkoutRes.json();
  if (!checkoutRes.ok) {
    throw new Error(`Checkout falhou (${checkoutRes.status}): ${JSON.stringify(checkoutData)}`);
  }
  console.log('orderId:', checkoutData.orderId);

  const { rows: orderRows } = await pool.query(
    `SELECT asaas_payment_id, status FROM orders WHERE id = $1`,
    [checkoutData.orderId]
  );
  const asaasPaymentId = orderRows[0].asaas_payment_id;
  console.log('asaas_payment_id:', asaasPaymentId, '| status atual:', orderRows[0].status);
  if (!asaasPaymentId) throw new Error('Pedido criado sem asaas_payment_id — não dá pra simular o webhook.');

  printSection('2/6 — Simulando webhook PAYMENT_RECEIVED');
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!webhookToken) throw new Error('ASAAS_WEBHOOK_TOKEN não configurado no .env — não dá pra simular o webhook.');

  const webhookRes = await fetch(`${BASE_URL}/webhooks/asaas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': webhookToken },
    body: JSON.stringify({
      event: 'PAYMENT_RECEIVED',
      payment: { id: asaasPaymentId, status: 'RECEIVED' },
    }),
  });
  console.log('Webhook status HTTP:', webhookRes.status);
  if (!webhookRes.ok) throw new Error(`Webhook falhou com status ${webhookRes.status}`);

  printSection('3/6 — Confirmando orders.status = paid e supplier_orders criado');
  const { rows: paidOrderRows } = await pool.query(`SELECT status FROM orders WHERE id = $1`, [checkoutData.orderId]);
  console.log('orders.status agora:', paidOrderRows[0].status);
  if (paidOrderRows[0].status !== 'paid') throw new Error('Pedido não virou paid depois do webhook.');

  const { rows: supplierOrderRows } = await pool.query(
    `SELECT id, status, cost_cents, supplier_id FROM supplier_orders WHERE order_id = $1`,
    [checkoutData.orderId]
  );
  console.log('supplier_orders criado(s):', supplierOrderRows);
  if (supplierOrderRows.length === 0) throw new Error('Nenhum supplier_orders foi criado.');
  const supplierOrderId = supplierOrderRows[0].id;

  printSection('4/6 — GET /admin/supplier-orders/pending (deve aparecer)');
  const pendingRes1 = await fetch(`${BASE_URL}/admin/supplier-orders/pending`);
  const pendingData1 = await pendingRes1.json();
  const found1 = pendingData1.supplierOrders.find((so) => so.supplier_order_id === supplierOrderId);
  console.log('Encontrado na lista de pendentes?', found1 ? 'SIM' : 'NÃO');
  if (found1) {
    console.log('Detalhe:', JSON.stringify(found1, null, 2));
  } else {
    throw new Error('supplier_order não apareceu em /admin/supplier-orders/pending');
  }

  printSection('5/6 — POST /admin/supplier-orders/:id/mark-placed');
  const placeRes = await fetch(`${BASE_URL}/admin/supplier-orders/${supplierOrderId}/mark-placed`, {
    method: 'POST',
  });
  const placeData = await placeRes.json();
  console.log('Status HTTP:', placeRes.status, '| Resposta:', placeData);
  if (!placeRes.ok) throw new Error('mark-placed falhou.');

  printSection('6/6 — GET /admin/supplier-orders/pending de novo (deve sumir)');
  const pendingRes2 = await fetch(`${BASE_URL}/admin/supplier-orders/pending`);
  const pendingData2 = await pendingRes2.json();
  const found2 = pendingData2.supplierOrders.find((so) => so.supplier_order_id === supplierOrderId);
  console.log('Ainda aparece na lista de pendentes?', found2 ? 'SIM (FALHOU)' : 'NÃO (esperado)');
  if (found2) throw new Error('supplier_order ainda aparece como pending depois do mark-placed.');

  printSection('RESULTADO: fluxo completo OK');
  console.log('orderId:', checkoutData.orderId);
  console.log('supplierOrderId:', supplierOrderId);
}

main()
  .catch((err) => {
    console.error('\nFALHOU:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
