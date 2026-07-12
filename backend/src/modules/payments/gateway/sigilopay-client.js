/**
 * Cliente HTTP da SigiloPay (gateway de pagamentos)
 * ------------------------------------------------------------------
 * Autenticação: toda requisição carrega os headers x-public-key e
 * x-secret-key (SIGILOPAY_PUBLIC_KEY / SIGILOPAY_SECRET_KEY no .env).
 *
 * Este módulo é só a FUNDAÇÃO reutilizável — get/post autenticados,
 * com timeout e log estruturado. Os endpoints específicos (ex: criar
 * cobrança Pix) usam este cliente, mas ficam em outro arquivo — ver
 * o comentário "PRÓXIMO PASSO" em server.js sobre a cobrança pós-checkout.
 *
 * Sem retry automático: um POST retentado sem chave de idempotência
 * pode criar duas cobranças para o mesmo pedido. Quem for criar a
 * cobrança Pix deve enviar sua própria idempotency key (ex: order.id)
 * e decidir se/como re-tentar.
 */
const { logger } = require('../../../shared/lib/logger');

const BASE_URL = 'https://app.sigilopay.com.br/api/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

function getCredentials() {
  const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;
  const secretKey = process.env.SIGILOPAY_SECRET_KEY;

  if (!publicKey || !secretKey) {
    throw new Error(
      'SIGILOPAY_PUBLIC_KEY e SIGILOPAY_SECRET_KEY precisam estar definidas no .env'
    );
  }

  return { publicKey, secretKey };
}

/**
 * @param {string} path - ex: '/pix/charges'
 * @param {object} [opts]
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [opts.method='GET']
 * @param {object} [opts.body] - serializado como JSON quando presente
 * @param {number} [opts.timeoutMs=15000]
 * @param {object} [opts.log] - logger com contexto (child logger)
 * @returns {Promise<{status: number, body: object|string|null}>} status HTTP e corpo (JSON parseado quando possível)
 * @throws {Error} err.status = status HTTP; err.body = corpo do erro (quando houver)
 */
async function sigiloPayRequest(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, log = logger } = {}) {
  const { publicKey, secretKey } = getCredentials();
  const reqLog = log.child({ service: 'sigilopay', method, path });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': publicKey,
        'x-secret-key': secretKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    // Endpoints desconhecidos podem devolver corpo não-JSON (página HTML
    // de erro, texto puro). Isso não pode derrubar o parse ANTES de a
    // gente conseguir ver o status — por isso o fallback para texto cru.
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const err = new Error(`SigiloPay respondeu HTTP ${res.status} em ${path}`);
      err.status = res.status;
      err.body = data;
      // Corpo do erro é logado (ajuda a debugar); corpo de SUCESSO não é
      // (pode conter QR code / copia-e-cola — não é o tipo de coisa que
      // queremos parando em log agregado por padrão).
      reqLog.error({ status: res.status, body: data }, 'Erro na chamada à SigiloPay');
      throw err;
    }

    reqLog.info({ status: res.status }, 'Chamada à SigiloPay concluída');
    return { status: res.status, body: data };
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Timeout de ${timeoutMs}ms ao chamar SigiloPay em ${path}`);
      reqLog.error({ timeoutMs }, timeoutErr.message);
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const sigiloPayClient = {
  get: (path, opts) => sigiloPayRequest(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => sigiloPayRequest(path, { ...opts, method: 'POST', body }),
};

module.exports = { sigiloPayClient, sigiloPayRequest };

/* ------------------------------------------------------------------
 * USO (esboço — cobrança Pix real fica para depois):
 *
 * const { sigiloPayClient } = require('./src/modules/payments/gateway/sigilopay-client');
 *
 * const { status, body: charge } = await sigiloPayClient.post('/pix/charges', {
 *   amount: order.totalCents,
 *   idempotencyKey: order.id, // evita cobrança duplicada em retry
 * }, { log: req.log });
 * ------------------------------------------------------------------ */
