/**
 * test-supplier-orders-multi.js
 * ------------------------------------------------------------------
 * Caso de borda nunca testado: um pedido com itens de DOIS fornecedores
 * diferentes ao mesmo tempo. Confirma que a query de agrupamento em
 * server.js (GROUP BY sp.supplier_id, no handler do webhook) gera uma
 * linha de supplier_orders POR FORNECEDOR, cada uma com o cost_cents
 * somado só dos itens daquele fornecedor — e que a listagem
 * /admin/supplier-orders/pending não mistura itens de fornecedores
 * diferentes na mesma entrada.
 *
 * POST /checkout só aceita 1 produto por chamada — não dá pra montar
 * um carrinho multi-fornecedor por ali. Por isso o pedido/itens são
 * criados DIRETO no banco aqui. A partir daí, o teste dispara o
 * webhook REAL (POST /webhooks/asaas) pra exercitar exatamente o
 * mesmo código que roda em produção, em vez de reimplementar a lógica
 * de agrupamento neste script.
 *
 * Limpa os próprios dados de teste no final (sucesso ou falha).
 * Pré-requisito: o servidor precisa estar rodando (`npm run dev`).
 *
 * Rodar: npm run test:supplier-orders-multi
 */
const { Pool } = require('pg');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_EMAIL = 'multi-supplier-teste@example.com';
const TEST_PAYMENT_ID = `pay_test_multi_supplier_${Date.now()}`;

function printSection(title) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n${title}\n${line}`);
}

async function cleanup() {
  const { rows: customerRows } = await pool.query(`SELECT id FROM customers WHERE email = $1`, [TEST_EMAIL]);
  for (const c of customerRows) {
    const { rows: orderRows } = await pool.query(`SELECT id FROM orders WHERE customer_id = $1`, [c.id]);
    for (const o of orderRows) {
      await pool.query(`DELETE FROM supplier_orders WHERE order_id = $1`, [o.id]);
      await pool.query(`DELETE FROM order_items WHERE order_id = $1`, [o.id]);
    }
    await pool.query(`DELETE FROM orders WHERE customer_id = $1`, [c.id]);
  }
  await pool.query(`DELETE FROM customers WHERE email = $1`, [TEST_EMAIL]);
}

async function main() {
  printSection('1/7 — Fornecedores distintos com produto primário');
  const { rows: primaryProducts } = await pool.query(
    `SELECT sp.product_id, sp.supplier_id, sp.cost_cents, sp.supplier_shipping_cents,
            p.slug, p.name, p.sale_price_cents, s.name AS supplier_name
       FROM supplier_products sp
       JOIN products p ON p.id = sp.product_id
       JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.is_primary = true
      ORDER BY sp.supplier_id`
  );
  console.table(primaryProducts.map(({ product_id, supplier_id, ...rest }) => rest));

  const bySupplier = new Map();
  for (const row of primaryProducts) {
    if (!bySupplier.has(row.supplier_id)) bySupplier.set(row.supplier_id, row);
  }
  if (bySupplier.size < 2) {
    throw new Error(
      `Só existe ${bySupplier.size} fornecedor com produto primário — precisa de pelo menos 2. Não vou criar fornecedor/produto fictício sem confirmação.`
    );
  }
  const [itemA, itemB] = [...bySupplier.values()];
  console.log(`Usando: "${itemA.name}" (${itemA.supplier_name}) + "${itemB.name}" (${itemB.supplier_name})`);

  printSection('2/7 — Criando cliente + pedido com 1 item de cada fornecedor (direto no banco)');
  const {
    rows: [customer],
  } = await pool.query(
    `INSERT INTO customers (email, name) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [TEST_EMAIL, 'Cliente Teste Multi Fornecedor']
  );

  const totalCents = itemA.sale_price_cents + itemB.sale_price_cents;
  const {
    rows: [order],
  } = await pool.query(
    `INSERT INTO orders (
       customer_id, status, total_cents, asaas_payment_id,
       shipping_street, shipping_number, shipping_complement,
       shipping_neighborhood, shipping_city, shipping_state, shipping_zip_code
     ) VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      customer.id,
      totalCents,
      TEST_PAYMENT_ID,
      'Rua Multi Fornecedor',
      '200',
      null,
      'Bairro Teste',
      'Curitiba',
      'PR',
      '80000-000',
    ]
  );

  for (const item of [itemA, itemB]) {
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity)
       VALUES ($1, $2, $3, $4, 1)`,
      [order.id, item.product_id, item.name, item.sale_price_cents]
    );
  }
  console.log('orderId:', order.id, '| asaas_payment_id (fake, só pra este teste):', TEST_PAYMENT_ID);

  printSection('3/7 — Disparando o webhook REAL (POST /webhooks/asaas)');
  const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!webhookToken) throw new Error('ASAAS_WEBHOOK_TOKEN não configurado no .env.');

  const webhookRes = await fetch(`${BASE_URL}/webhooks/asaas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'asaas-access-token': webhookToken },
    body: JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: TEST_PAYMENT_ID, status: 'RECEIVED' } }),
  });
  console.log('Webhook status HTTP:', webhookRes.status);
  if (!webhookRes.ok) throw new Error(`Webhook falhou com status ${webhookRes.status}`);

  printSection('4/7 — orders.status = paid e EXATAMENTE 2 linhas em supplier_orders?');
  const {
    rows: [orderAfter],
  } = await pool.query(`SELECT status FROM orders WHERE id = $1`, [order.id]);
  console.log('orders.status:', orderAfter.status);
  if (orderAfter.status !== 'paid') throw new Error('Pedido não virou paid.');

  const { rows: supplierOrders } = await pool.query(
    `SELECT id, supplier_id, cost_cents, status FROM supplier_orders WHERE order_id = $1 ORDER BY supplier_id`,
    [order.id]
  );
  console.log('supplier_orders criados:', supplierOrders);
  if (supplierOrders.length !== 2) {
    throw new Error(`Esperava 2 linhas em supplier_orders, achei ${supplierOrders.length}.`);
  }

  const soA = supplierOrders.find((so) => so.supplier_id === itemA.supplier_id);
  const soB = supplierOrders.find((so) => so.supplier_id === itemB.supplier_id);
  const expectedA = itemA.cost_cents + itemA.supplier_shipping_cents;
  const expectedB = itemB.cost_cents + itemB.supplier_shipping_cents;

  console.log(
    `\n${itemA.supplier_name}: cost_cents=${soA?.cost_cents} (esperado ${expectedA}) →`,
    soA?.cost_cents === expectedA ? 'OK' : 'FALHOU'
  );
  console.log(
    `${itemB.supplier_name}: cost_cents=${soB?.cost_cents} (esperado ${expectedB}) →`,
    soB?.cost_cents === expectedB ? 'OK' : 'FALHOU'
  );
  if (soA?.cost_cents !== expectedA || soB?.cost_cents !== expectedB) {
    throw new Error('cost_cents não bateu com o esperado em pelo menos um fornecedor.');
  }

  printSection('5/7 — GET /admin/supplier-orders/pending (as duas devem aparecer, sem misturar itens)');
  const pendingRes = await fetch(`${BASE_URL}/admin/supplier-orders/pending`);
  const pendingData = await pendingRes.json();
  const entryA = pendingData.supplierOrders.find((so) => so.supplier_order_id === soA.id);
  const entryB = pendingData.supplierOrders.find((so) => so.supplier_order_id === soB.id);

  console.log('Entrada do fornecedor A (' + itemA.supplier_name + ') encontrada?', entryA ? 'SIM' : 'NÃO');
  console.log('  items:', entryA?.items);
  console.log('Entrada do fornecedor B (' + itemB.supplier_name + ') encontrada?', entryB ? 'SIM' : 'NÃO');
  console.log('  items:', entryB?.items);

  if (!entryA || !entryB) throw new Error('Uma das duas entradas não apareceu em /admin/supplier-orders/pending.');

  const crossA = entryA.items.some((i) => i.product_name === itemB.name);
  const crossB = entryB.items.some((i) => i.product_name === itemA.name);
  console.log('\nEntrada A contém item do fornecedor B (não deveria)?', crossA ? 'SIM (FALHOU)' : 'NÃO (esperado)');
  console.log('Entrada B contém item do fornecedor A (não deveria)?', crossB ? 'SIM (FALHOU)' : 'NÃO (esperado)');
  if (crossA || crossB) {
    throw new Error('Itens de fornecedores diferentes vazaram pra dentro da mesma entrada de supplier_orders.');
  }

  printSection('6/7 — mark-placed só na entrada do fornecedor A');
  const placeRes = await fetch(`${BASE_URL}/admin/supplier-orders/${soA.id}/mark-placed`, { method: 'POST' });
  console.log('Status HTTP:', placeRes.status);
  if (!placeRes.ok) throw new Error('mark-placed falhou.');

  printSection('7/7 — GET /admin/supplier-orders/pending de novo: só B deve continuar');
  const pendingRes2 = await fetch(`${BASE_URL}/admin/supplier-orders/pending`);
  const pendingData2 = await pendingRes2.json();
  const stillA = pendingData2.supplierOrders.some((so) => so.supplier_order_id === soA.id);
  const stillB = pendingData2.supplierOrders.some((so) => so.supplier_order_id === soB.id);
  console.log('Fornecedor A ainda pendente (esperado NÃO)?', stillA ? 'SIM (FALHOU)' : 'NÃO (esperado)');
  console.log('Fornecedor B ainda pendente (esperado SIM)?', stillB ? 'SIM (esperado)' : 'NÃO (FALHOU)');
  if (stillA || !stillB) throw new Error('mark-placed afetou o fornecedor errado (ou os dois, ou nenhum).');

  printSection('RESULTADO: caso de borda multi-fornecedor OK');
  console.log('orderId:', order.id);
  console.log(`${itemA.supplier_name} → supplier_order ${soA.id} (placed)`);
  console.log(`${itemB.supplier_name} → supplier_order ${soB.id} (pending)`);
}

main()
  .then(() => cleanup())
  .then(() => console.log('\nDados de teste limpos do banco.'))
  .catch(async (err) => {
    console.error('\nFALHOU:', err.message);
    await cleanup();
    console.error('Dados de teste limpos mesmo após falha.');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
