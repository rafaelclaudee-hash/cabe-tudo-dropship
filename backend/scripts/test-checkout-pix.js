/**
 * test-checkout-pix.js
 * ------------------------------------------------------------------
 * Script de teste MANUAL e TEMPORÁRIO: chama POST /checkout de ponta a
 * ponta contra o servidor local rodando (npm run dev, porta padrão
 * 3000) e confirma no banco que o pedido foi criado com
 * asaas_payment_id preenchido.
 *
 * Pré-requisito: o servidor precisa estar rodando (`npm run dev` em
 * outro terminal) antes de rodar este script.
 *
 * Rodar: npm run test:checkout-pix
 * Apagar depois de usar — não é código de produção.
 */
const { Pool } = require('pg');

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function printSection(title) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n${title}\n${line}`);
}

/**
 * Mesmo gerador de CPF-válido-por-checksum do test-asaas-pix.js —
 * só pra passar na validação de FORMATO do Asaas, não é pessoa real.
 */
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

async function main() {
  printSection('0/2 — Achando um produto ativo pra testar');
  const { rows: products } = await pool.query(
    `SELECT slug, name, sale_price_cents FROM products WHERE active = true LIMIT 1`
  );
  if (products.length === 0) {
    throw new Error('Nenhum produto ativo encontrado no banco — não dá pra testar o checkout.');
  }
  const product = products[0];
  console.log('Produto:', product);

  const payload = {
    customerEmail: 'checkout-teste@example.com',
    customerName: 'Cliente Teste Checkout',
    customerCpfCnpj: generateValidCpf(),
    productSlug: product.slug,
    quantity: 1,
  };

  printSection('1/2 — POST /checkout');
  console.log('Payload:', payload);

  const res = await fetch(`${BASE_URL}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  console.log('Status HTTP:', res.status);
  console.log('Resposta:', JSON.stringify(data, null, 2));

  if (!res.ok) {
    throw new Error(`Checkout falhou com status ${res.status}`);
  }

  printSection('2/2 — Confirmando no banco');
  const { rows: orderRows } = await pool.query(
    `SELECT id, status, total_cents, asaas_payment_id FROM orders WHERE id = $1`,
    [data.orderId]
  );
  console.log('Pedido no banco:', orderRows[0]);

  const { rows: customerRows } = await pool.query(
    `SELECT id, email, asaas_customer_id FROM customers WHERE email = $1`,
    [payload.customerEmail]
  );
  console.log('Cliente no banco:', customerRows[0]);

  console.log('\nasaas_payment_id preenchido no pedido?', Boolean(orderRows[0]?.asaas_payment_id) ? 'SIM' : 'NÃO');
  console.log('asaas_customer_id preenchido no cliente?', Boolean(customerRows[0]?.asaas_customer_id) ? 'SIM' : 'NÃO');

  printSection('RESULTADO');
  console.log('orderId:        ', data.orderId);
  console.log('expirationDate: ', data.expirationDate);
  console.log('\nPix copia e cola (payload):\n');
  console.log(data.payload);
  console.log('');
}

main()
  .catch((err) => {
    console.error('\nFALHOU:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
