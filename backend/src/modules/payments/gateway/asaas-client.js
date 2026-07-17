/**
 * Cliente HTTP do Asaas (gateway de pagamentos)
 * ------------------------------------------------------------------
 * Autenticação: header `access_token` com a chave de API crua (NÃO é
 * "Bearer <token>" como a maioria das APIs — o Asaas quer o valor puro).
 *
 * Base URL vem de ASAAS_BASE_URL. HOJE aponta pra PRODUÇÃO
 * (https://api.asaas.com/v3) — cobranças criadas por este módulo são
 * reais. Trocar de ambiente é só trocar essa variável — o código não
 * hardcoda ambiente nenhum (ver getCurrentAsaasEnvironment em server.js).
 *
 * Camadas deste arquivo:
 *   1. asaasRequest/asaasClient — fundação genérica (get/post autenticados),
 *      mesmo padrão do sigilopay-client.js: timeout, log estruturado,
 *      corpo não-JSON não derruba o parse antes de vermos o status.
 *   2. createCustomer/createPixCharge/getPixQrCode/createCreditCardCharge/
 *      createBoletoCharge/getBoletoIdentificationField — funções de
 *      domínio (Pix, cartão, boleto), construídas em cima da camada 1.
 *
 * Sem retry automático: POST retentado sem controle pode criar cliente
 * ou cobrança duplicada. Quem chamar decide se/como re-tentar.
 *
 * Este módulo NÃO expõe nenhuma rota HTTP — é só o cliente, pronto pra
 * ser usado por um handler depois.
 */
const { logger } = require('../../../shared/lib/logger');

const DEFAULT_TIMEOUT_MS = 15_000;

function getConfig() {
  const baseUrl = process.env.ASAAS_BASE_URL;
  const apiKey = process.env.ASAAS_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('ASAAS_BASE_URL e ASAAS_API_KEY precisam estar definidas no .env');
  }

  return { baseUrl, apiKey };
}

/**
 * @param {string} path - ex: '/customers'
 * @param {object} [opts]
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [opts.method='GET']
 * @param {object} [opts.body] - serializado como JSON quando presente
 * @param {number} [opts.timeoutMs=15000]
 * @param {object} [opts.log] - logger com contexto (child logger)
 * @returns {Promise<{status: number, body: object|string|null}>} status HTTP e corpo (JSON parseado quando possível)
 * @throws {Error} err.status = status HTTP; err.body = corpo do erro (quando houver)
 */
async function asaasRequest(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, log = logger } = {}) {
  const { baseUrl, apiKey } = getConfig();
  const reqLog = log.child({ service: 'asaas', method, path });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    // Corpo pode não ser JSON (erro de proxy, HTML, texto puro) — isso
    // não pode quebrar o parse ANTES de a gente ver o status.
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const err = new Error(`Asaas respondeu HTTP ${res.status} em ${path}`);
      err.status = res.status;
      err.body = data;
      reqLog.error({ status: res.status, body: data }, 'Erro na chamada ao Asaas');
      throw err;
    }

    reqLog.info({ status: res.status }, 'Chamada ao Asaas concluída');
    return { status: res.status, body: data };
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Timeout de ${timeoutMs}ms ao chamar Asaas em ${path}`);
      reqLog.error({ timeoutMs }, timeoutErr.message);
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const asaasClient = {
  get: (path, opts) => asaasRequest(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => asaasRequest(path, { ...opts, method: 'POST', body }),
};

function todayDateString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Data (YYYY-MM-DD) N dias ÚTEIS a partir de hoje (pula sábado/domingo;
 * feriados não entram na conta — suficiente pro MVP, sem tabela de
 * feriados). Usado como vencimento padrão do boleto.
 */
function businessDaysFromTodayDateString(days) {
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay(); // 0 = domingo, 6 = sábado
    if (dayOfWeek !== 0 && dayOfWeek !== 6) added++;
  }
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Cria um cliente no Asaas.
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.cpfCnpj
 * @param {string} params.email
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<string>} id do cliente criado
 */
async function createCustomer({ name, cpfCnpj, email }, opts) {
  const { body } = await asaasClient.post('/customers', { name, cpfCnpj, email }, opts);
  return body.id;
}

/**
 * Cria uma cobrança Pix.
 * @param {object} params
 * @param {string} params.customerId - id retornado por createCustomer
 * @param {number} params.value - valor em REAIS (ex: 99.90), NÃO em centavos —
 *   o resto do projeto usa *_cents, mas o Asaas espera o valor decimal puro.
 *   Converta antes de chamar: value = totalCents / 100.
 * @param {string} [params.description]
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<object>} objeto completo da cobrança (inclui .id)
 */
async function createPixCharge({ customerId, value, description }, opts) {
  const { body } = await asaasClient.post(
    '/lean/payments',
    {
      billingType: 'PIX',
      customer: customerId,
      value,
      dueDate: todayDateString(),
      description,
    },
    opts
  );
  return body;
}

/**
 * Busca o QR Code Pix de uma cobrança já criada.
 * @param {string} paymentId - id retornado por createPixCharge
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<{encodedImage: string, payload: string, expirationDate: string}>}
 */
async function getPixQrCode(paymentId, opts) {
  const { body } = await asaasClient.get(`/payments/${paymentId}/pixQrCode`, opts);
  return {
    encodedImage: body.encodedImage,
    payload: body.payload,
    expirationDate: body.expirationDate,
  };
}

/**
 * Busca uma cobrança pelo id — usado pra conferir se um Pix já foi
 * pago (status sai de PENDING e vira RECEIVED após a confirmação).
 * @param {string} paymentId - id retornado por createPixCharge
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<object>} objeto completo da cobrança (inclui pelo menos status e value)
 */
async function getPaymentStatus(paymentId, opts) {
  const { body } = await asaasClient.get(`/payments/${paymentId}`, opts);
  return body;
}

/**
 * Cria uma cobrança de cartão de crédito. Diferente do Pix, a
 * autorização é tentada de forma SÍNCRONA na criação: se aprovada, a
 * Asaas já devolve o payment com status CONFIRMED/RECEIVED nesta mesma
 * chamada (sem precisar esperar o webhook). Se recusada, a chamada
 * inteira rejeita — err.status/err.body trazem o motivo (ver asaasRequest).
 *
 * Parcelamento sem juros pro cliente: quando installmentCount > 1,
 * manda installmentCount + totalValue (nunca "value" junto com
 * installmentCount — são alternativas, não complementares). A Asaas
 * divide o totalValue em partes iguais entre as parcelas; não enviamos
 * nenhum campo de juros/multa de parcelamento, então não há acréscimo
 * pro cliente — a loja absorve a taxa da Asaas por fora.
 *
 * Endpoint: usa /payments (padrão da Asaas), diferente do /lean/payments
 * usado pelo Pix — não existe combinação documentada de billingType
 * CREDIT_CARD com /lean/payments, e o fluxo Pix não deve ser tocado.
 *
 * @param {object} params
 * @param {string} params.customerId
 * @param {number} params.value - valor total em REAIS (não centavos)
 * @param {string} [params.description]
 * @param {number} params.installmentCount - 1 = à vista, sem parcelamento
 * @param {object} params.card - { number, expiryMonth, expiryYear, ccv, holderName }
 * @param {object} params.holder - { name, email, cpfCnpj, postalCode, addressNumber, addressComplement, phone }
 * @param {string} params.remoteIp - IP do comprador (obrigatório pela Asaas p/ antifraude; NUNCA o IP do servidor)
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<object>} objeto completo da cobrança (inclui .id e .status)
 */
async function createCreditCardCharge(
  { customerId, value, description, installmentCount, card, holder, remoteIp },
  opts
) {
  const body = {
    billingType: 'CREDIT_CARD',
    customer: customerId,
    dueDate: todayDateString(),
    description,
    creditCard: {
      holderName: card.holderName,
      number: card.number,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      ccv: card.ccv,
    },
    creditCardHolderInfo: {
      name: holder.name,
      email: holder.email,
      cpfCnpj: holder.cpfCnpj,
      postalCode: holder.postalCode,
      addressNumber: holder.addressNumber,
      addressComplement: holder.addressComplement || null,
      phone: holder.phone,
      mobilePhone: holder.phone,
    },
    remoteIp,
  };

  if (installmentCount > 1) {
    body.installmentCount = installmentCount;
    body.totalValue = value;
  } else {
    body.value = value;
  }

  const { body: payment } = await asaasClient.post('/payments', body, opts);
  return payment;
}

/**
 * Cria uma cobrança de boleto. Vencimento padrão: 3 dias úteis a
 * partir de hoje.
 * @param {object} params
 * @param {string} params.customerId
 * @param {number} params.value - valor em REAIS (não centavos)
 * @param {string} [params.description]
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<object>} objeto completo da cobrança (inclui .id e .bankSlipUrl)
 */
async function createBoletoCharge({ customerId, value, description }, opts) {
  const { body: payment } = await asaasClient.post(
    '/payments',
    {
      billingType: 'BOLETO',
      customer: customerId,
      value,
      dueDate: businessDaysFromTodayDateString(3),
      description,
    },
    opts
  );
  return payment;
}

/**
 * Busca a linha digitável e o código de barras de um boleto já criado
 * (a criação devolve bankSlipUrl direto, mas linha digitável/código de
 * barras exigem esta chamada separada).
 * @param {string} paymentId - id retornado por createBoletoCharge
 * @param {object} [opts] - repassado pro request (log, timeoutMs...)
 * @returns {Promise<{identificationField: string, barCode: string}>}
 */
async function getBoletoIdentificationField(paymentId, opts) {
  const { body } = await asaasClient.get(`/payments/${paymentId}/identificationField`, opts);
  return { identificationField: body.identificationField, barCode: body.barCode };
}

module.exports = {
  asaasClient,
  createCustomer,
  createPixCharge,
  getPixQrCode,
  getPaymentStatus,
  createCreditCardCharge,
  createBoletoCharge,
  getBoletoIdentificationField,
};

/* ------------------------------------------------------------------
 * USO (esboço — nenhuma rota HTTP chama isto ainda):
 *
 * const { createCustomer, createPixCharge, getPixQrCode } =
 *   require('./src/modules/payments/gateway/asaas-client');
 *
 * const customerId = await createCustomer(
 *   { name: 'Cliente Teste', cpfCnpj: '12345678900', email: 'cliente@email.com' },
 *   { log: req.log }
 * );
 *
 * const charge = await createPixCharge(
 *   { customerId, value: order.totalCents / 100, description: `Pedido ${order.id}` },
 *   { log: req.log }
 * );
 *
 * const qr = await getPixQrCode(charge.id, { log: req.log });
 * ------------------------------------------------------------------ */
