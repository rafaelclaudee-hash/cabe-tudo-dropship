/**
 * Cliente HTTP da Utmify — notifica pedidos (criado/pago/reembolsado)
 * pra rastreamento de UTM.
 * ------------------------------------------------------------------
 * A Utmify não integra nativamente com a Asaas — a arquitetura é:
 * Asaas → webhook do nosso backend → esta chamada pra Utmify.
 *
 * Doc: https://docs.utmify.com.br/envio-de-vendas
 * Endpoint: POST https://api.utmify.com.br/api-credentials/orders
 * Auth: header x-api-token (UTMIFY_API_TOKEN).
 *
 * Fire-and-forget por design: notifyOrder NUNCA lança — uma falha aqui
 * (timeout, 5xx, token inválido) não pode derrubar o checkout nem o
 * webhook da Asaas. Uma única retentativa IMEDIATA antes de desistir
 * (sem backoff — é o que foi pedido, nada mais sofisticado que isso).
 */
const { logger } = require('../../../shared/lib/logger');

const UTMIFY_URL = 'https://api.utmify.com.br/api-credentials/orders';
const TIMEOUT_MS = 10_000;

async function postOrderOnce(payload) {
  const apiToken = process.env.UTMIFY_API_TOKEN;
  if (!apiToken) {
    const err = new Error('UTMIFY_API_TOKEN não configurado');
    err.tokenMissing = true;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(UTMIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': apiToken },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Utmify respondeu HTTP ${res.status}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout de ${TIMEOUT_MS}ms ao chamar Utmify`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} payload - corpo já pronto pro POST /api-credentials/orders
 * @param {object} [opts]
 * @param {object} [opts.log] - logger com contexto (child logger)
 * @returns {Promise<void>} nunca rejeita — falha vira log, não exceção
 */
async function notifyOrder(payload, { log = logger } = {}) {
  const reqLog = log.child({ service: 'utmify', orderId: payload.orderId, status: payload.status });

  if (!process.env.UTMIFY_API_TOKEN) {
    reqLog.warn({ event: 'UTMIFY_TOKEN_MISSING' }, 'UTMIFY_API_TOKEN não configurado — notificação pulada');
    return;
  }

  try {
    await postOrderOnce(payload);
    reqLog.info({ event: 'UTMIFY_NOTIFIED' }, 'Utmify notificada');
    return;
  } catch (firstErr) {
    reqLog.warn({ err: firstErr }, 'Utmify falhou na 1ª tentativa — retentando uma vez');
  }

  try {
    await postOrderOnce(payload);
    reqLog.info({ event: 'UTMIFY_NOTIFIED', retried: true }, 'Utmify notificada (retry)');
  } catch (secondErr) {
    reqLog.error(
      { err: secondErr, event: 'UTMIFY_NOTIFY_FAILED' },
      'Utmify falhou nas 2 tentativas — pedido segue normal, sem notificação de tracking'
    );
  }
}

module.exports = { notifyOrder };
