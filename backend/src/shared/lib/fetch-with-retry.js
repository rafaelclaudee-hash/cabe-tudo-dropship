/**
 * fetchWithRetry — fetch com timeout, retry e backoff exponencial
 * ------------------------------------------------------------------
 * Política de retry (a parte que importa):
 *
 *   RETENTA:      timeout, erro de rede, HTTP 5xx, HTTP 429
 *   NÃO RETENTA:  HTTP 4xx (exceto 429)
 *
 * Por quê? Um 500 ou timeout é problema TEMPORÁRIO do fornecedor —
 * retentar resolve. Um 404 ou 401 é problema PERMANENTE (URL errada,
 * credencial inválida) — retentar só desperdiça tempo e polui logs.
 *
 * Backoff exponencial + jitter:
 *   tentativa 1 → espera ~1s | 2 → ~2s | 3 → ~4s
 *   O "jitter" (aleatoriedade) evita que 500 produtos retentam todos
 *   no mesmo milissegundo e derrubem o fornecedor de novo (thundering herd).
 */
const { logger } = require('./logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} url
 * @param {object} opts
 * @param {number} opts.timeoutMs   - tempo máximo por tentativa (default 10s)
 * @param {number} opts.maxRetries  - nº de RETENTATIVAS além da 1ª (default 3)
 * @param {object} opts.log         - logger com contexto (child logger)
 * @returns {Promise<object>} JSON da resposta
 * @throws  {Error} err.permanent = true se não vale a pena retentar
 */
async function fetchWithRetry(url, { timeoutMs = 10_000, maxRetries = 3, log = logger } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    // AbortController implementa o timeout: sem ele, um fornecedor
    // lento pode segurar seu job por minutos.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });

      if (res.ok) {
        return await res.json(); // sucesso — sai do loop
      }

      // 4xx (exceto 429) = erro permanente: falha imediata, sem retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const err = new Error(`HTTP ${res.status} em ${url}`);
        err.permanent = true;
        throw err;
      }

      // 5xx ou 429 = erro transitório: cai no catch e retenta
      lastError = new Error(`HTTP ${res.status} em ${url}`);
    } catch (err) {
      if (err.permanent) throw err; // não retentar 4xx
      // AbortError = timeout; outros = falha de rede/DNS
      lastError = err.name === 'AbortError' ? new Error(`Timeout ${timeoutMs}ms em ${url}`) : err;
    } finally {
      clearTimeout(timer);
    }

    // Se ainda há tentativas, espera com backoff exponencial + jitter
    if (attempt <= maxRetries) {
      const backoff = Math.pow(2, attempt - 1) * 1000;      // 1s, 2s, 4s...
      const jitter = Math.floor(Math.random() * 300);        // 0-300ms
      log.warn(
        { attempt, maxRetries, nextRetryMs: backoff + jitter, err: lastError.message },
        'Falha transitória, agendando retry'
      );
      await sleep(backoff + jitter);
    }
  }

  // Esgotou todas as tentativas
  lastError.retriesExhausted = true;
  throw lastError;
}

module.exports = { fetchWithRetry };
