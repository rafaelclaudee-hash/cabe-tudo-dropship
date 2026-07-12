/**
 * test-asaas-pix.js
 * ------------------------------------------------------------------
 * Script de teste MANUAL e TEMPORÁRIO: exercita o fluxo completo do
 * asaas-client.js ponta a ponta — createCustomer → createPixCharge →
 * getPixQrCode → getPaymentStatus — e salva o QR code gerado como PNG
 * pra escanear.
 *
 * Roda contra ASAAS_BASE_URL (Sandbox, confirmado no .env) — nenhum
 * dinheiro real é movimentado, mesmo pagando o Pix de teste depois.
 *
 * Rodar (fluxo completo, cria cliente + cobrança novos):
 *   npm run test:asaas-pix
 *
 * Rodar (só consulta status de uma cobrança já existente, sem criar
 * nada novo — útil pra conferir se um Pix confirmado manualmente no
 * painel Sandbox já virou RECEIVED):
 *   npm run test:asaas-pix -- pay_v43osuyrasun9qwx
 *
 * Apagar depois de usar — não é código de produção.
 */
const fs = require('fs');
const path = require('path');
const {
  createCustomer,
  createPixCharge,
  getPixQrCode,
  getPaymentStatus,
} = require('../src/modules/payments/gateway/asaas-client');
const { logger } = require('../src/shared/lib/logger');

const log = logger.child({ script: 'test-asaas-pix' });

const QR_CODE_PATH = path.join(__dirname, 'test-qrcode.png');

/**
 * Gera um CPF com dígitos verificadores válidos (algoritmo mod-11
 * padrão) só pra passar na validação de FORMATO do sandbox — os 9
 * primeiros dígitos são aleatórios, não corresponde a pessoa real.
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

function printSection(title) {
  const line = '='.repeat(60);
  console.log(`\n${line}\n${title}\n${line}`);
}

function printFailure(step, err) {
  printSection(`FALHOU: ${step}`);
  console.error('Mensagem:', err.message);
  if (err.status !== undefined) console.error('Status HTTP:', err.status);
  if (err.body !== undefined) console.error('Corpo da resposta:', JSON.stringify(err.body, null, 2));
  // err.cause é onde o Node/undici esconde a causa real de falhas de
  // rede (ex: ConnectTimeoutError) por trás da mensagem genérica
  // "fetch failed" — sem isso o erro fica ilegível.
  if (err.cause) console.error('Causa:', err.cause.message || err.cause);
  if (err.status === undefined) console.error('Stack:', err.stack);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retenta SÓ falhas de rede (err.status undefined = a requisição nunca
 * chegou a ter resposta HTTP, então não há risco de duplicar cliente
 * ou cobrança no lado do Asaas). Erros HTTP reais (4xx/5xx) não são
 * retentados — sobem na hora, como antes.
 */
async function withNetworkRetry(fn, { retries = 2, label } = {}) {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isNetworkError = err.status === undefined;
      if (!isNetworkError || attempt > retries) throw err;
      console.warn(`  (falha de rede em ${label}, tentativa ${attempt}/${retries + 1}: ${err.message} — retentando...)`);
      await sleep(1000 * attempt);
    }
  }
}

async function main() {
  // Modo consulta: `npm run test:asaas-pix -- <paymentId>` pula a criação
  // de cliente/cobrança e só checa o status de um pagamento existente.
  const existingPaymentId = process.argv[2];
  if (existingPaymentId) {
    printSection(`Consultando status da cobrança ${existingPaymentId}`);
    try {
      const payment = await withNetworkRetry(() => getPaymentStatus(existingPaymentId, { log }), {
        label: 'getPaymentStatus',
      });
      console.log('status:', payment.status);
      console.log('value: ', payment.value);
      console.log('\nObjeto completo:\n', JSON.stringify(payment, null, 2));
    } catch (err) {
      printFailure('getPaymentStatus', err);
      process.exit(1);
    }
    return;
  }

  printSection('1/4 — Criando cliente de teste');
  const customerPayload = {
    name: 'Cliente Teste Sandbox',
    cpfCnpj: generateValidCpf(),
    email: 'teste@example.com',
  };
  console.log('Payload:', customerPayload);

  let customerId;
  try {
    customerId = await withNetworkRetry(() => createCustomer(customerPayload, { log }), { label: 'createCustomer' });
    console.log('Cliente criado. customerId:', customerId);
  } catch (err) {
    printFailure('createCustomer', err);
    process.exit(1);
  }

  // R$5,00 é o mínimo aceito pelo Asaas por cobrança Pix — R$1,00 é
  // rejeitado com HTTP 400 ("valor da cobrança... não pode ser menor
  // que R$ 5,00"), confirmado rodando este script.
  printSection('2/4 — Criando cobrança Pix de R$5,00');
  let charge;
  try {
    charge = await withNetworkRetry(
      () => createPixCharge({ customerId, value: 5, description: 'Teste de integração Pix' }, { log }),
      { label: 'createPixCharge' }
    );
    console.log('Cobrança criada. id:', charge.id, '| status:', charge.status);
  } catch (err) {
    printFailure('createPixCharge', err);
    process.exit(1);
  }

  printSection('3/4 — Buscando QR Code Pix');
  let qr;
  try {
    qr = await withNetworkRetry(() => getPixQrCode(charge.id, { log }), { label: 'getPixQrCode' });
  } catch (err) {
    printFailure('getPixQrCode', err);
    process.exit(1);
  }

  // encodedImage pode vir com ou sem prefixo data URI — normaliza antes de decodificar.
  const base64Image = qr.encodedImage.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(QR_CODE_PATH, Buffer.from(base64Image, 'base64'));

  // Cobrança acabou de ser criada — o status normal aqui é PENDING, não
  // dá tempo de confirmar manualmente no painel entre o passo 2 e este.
  // Pra conferir um pagamento já pago como RECEIVED, rode:
  //   npm run test:asaas-pix -- <paymentId>
  printSection('4/4 — Consultando status da cobrança');
  let payment;
  try {
    payment = await withNetworkRetry(() => getPaymentStatus(charge.id, { log }), { label: 'getPaymentStatus' });
    console.log('status:', payment.status);
    console.log('value: ', payment.value);
  } catch (err) {
    printFailure('getPaymentStatus', err);
    process.exit(1);
  }

  printSection('RESULTADO');
  console.log('customerId:      ', customerId);
  console.log('paymentId:       ', charge.id);
  console.log('status:          ', payment.status);
  console.log('expirationDate:  ', qr.expirationDate);
  console.log('QR code salvo em:', QR_CODE_PATH);
  console.log('\nPix copia e cola (payload):\n');
  console.log(qr.payload);
  console.log('');
}

main().catch((err) => {
  printFailure('erro inesperado', err);
  process.exit(1);
});
