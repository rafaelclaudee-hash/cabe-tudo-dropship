/**
 * Logger estruturado (pino)
 * ------------------------------------------------------------------
 * Regra de ouro: NUNCA use console.log no código de produção.
 *
 * Por quê pino?
 *  - Loga em JSON: cada linha é um objeto pesquisável (grep, Datadog,
 *    Grafana Loki, CloudWatch... todos entendem).
 *  - "Child loggers" carregam contexto automaticamente: você cria um
 *    logger filho com { jobId } e TODAS as linhas daquele job saem
 *    com o jobId, sem repetir na mão.
 *  - Serializa erros corretamente (stack trace incluído).
 *
 * Instalação: npm i pino
 * Em dev, para logs bonitos no terminal: npm i -D pino-pretty
 *   e rode: node script.js | npx pino-pretty
 */
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',

  // Campos presentes em TODAS as linhas de log
  base: {
    app: 'dropship',
    env: process.env.NODE_ENV || 'development',
  },

  // Nunca logar dados sensíveis, mesmo por acidente
  redact: {
    paths: ['*.password', '*.apiKey', '*.authorization', '*.card'],
    censor: '[REDACTED]',
  },
});

module.exports = { logger };
