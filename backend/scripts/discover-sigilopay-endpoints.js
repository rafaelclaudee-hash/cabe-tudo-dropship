/**
 * discover-sigilopay-endpoints.js
 * ------------------------------------------------------------------
 * Script de reconhecimento MANUAL e TEMPORÁRIO: a doc pública da
 * SigiloPay não detalha o endpoint de criação de cobrança Pix, então
 * testamos uma lista de paths prováveis com GET (só leitura) pra ver
 * quais existem antes de implementar a cobrança de verdade.
 *
 * Só faz GET. NUNCA POST/PUT/DELETE — não cria, altera nem cobra nada.
 *
 * Rodar: npm run discover:sigilopay
 * Apagar depois de usar — não é código de produção.
 */
const { sigiloPayClient } = require('../src/modules/payments/gateway/sigilopay-client');
const { logger } = require('../src/shared/lib/logger');

const log = logger.child({ script: 'discover-sigilopay-endpoints' });

// Paths prováveis — chutes educados com base em nomenclatura comum de
// gateways de pagamento Pix. Ajuste a lista se surgir mais alguma pista.
const CANDIDATE_PATHS = [
  '/pix',
  '/pix/charges',
  '/charges',
  '/transactions',
  '/cobrancas',
  '/payments',
  '/checkout',
];

// Espaçamento entre chamadas: são só 7 requests, mas não custa não
// martelar a API de terceiro em rajada.
const DELAY_BETWEEN_REQUESTS_MS = 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function summarize(body) {
  if (body === null || body === undefined) return '(vazio)';
  const asString = typeof body === 'string' ? body : JSON.stringify(body);
  return asString.length > 200 ? `${asString.slice(0, 200)}…` : asString;
}

async function probe(path) {
  try {
    const { status, body } = await sigiloPayClient.get(path, { log, timeoutMs: 8000 });
    log.info({ path, status, body: summarize(body) }, `[${status}] ${path} → GET respondeu com sucesso`);
    return { path, status, outcome: 'OK', body: summarize(body) };
  } catch (err) {
    const status = err.status;

    if (status === 404) {
      log.info({ path, status }, `[404] ${path} → não existe nesse caminho`);
      return { path, status, outcome: 'NOT_FOUND' };
    }

    if (status === 405) {
      log.warn(
        { path, status, body: summarize(err.body) },
        `[405] ${path} → EXISTE, mas não aceita GET (provavelmente só POST) — candidato forte!`
      );
      return { path, status, outcome: 'EXISTS_WRONG_METHOD', body: summarize(err.body) };
    }

    if (status === 401) {
      log.error(
        { path, status, body: summarize(err.body) },
        `[401] ${path} → falha de autenticação (inesperado — credenciais deveriam estar válidas)`
      );
      return { path, status, outcome: 'AUTH_ERROR', body: summarize(err.body) };
    }

    if (status) {
      log.warn({ path, status, body: summarize(err.body) }, `[${status}] ${path} → status inesperado, revisar`);
      return { path, status, outcome: 'OTHER', body: summarize(err.body) };
    }

    // Sem status = não chegou a ter resposta HTTP (timeout, DNS, rede)
    log.error({ path, err: err.message }, `[ERRO] ${path} → falha de rede/timeout: ${err.message}`);
    return { path, status: null, outcome: 'NETWORK_ERROR', error: err.message };
  }
}

async function main() {
  log.info({ paths: CANDIDATE_PATHS }, 'Iniciando reconhecimento passivo (somente GET) da API SigiloPay');

  const results = [];
  for (const path of CANDIDATE_PATHS) {
    results.push(await probe(path));
    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log('\n=== RESUMO ===');
  console.table(results.map((r) => ({ path: r.path, status: r.status ?? '-', outcome: r.outcome })));

  const candidates = results.filter((r) => r.outcome === 'EXISTS_WRONG_METHOD');
  if (candidates.length > 0) {
    console.log('\nEndpoints que EXISTEM mas não aceitam GET (prováveis candidatos ao POST de cobrança):');
    candidates.forEach((c) => console.log(`  - ${c.path} (status ${c.status}) → ${c.body}`));
  } else {
    console.log('\nNenhum 405 encontrado — nenhum candidato óbvio de "existe mas não aceita GET".');
  }

  const ok = results.filter((r) => r.outcome === 'OK');
  if (ok.length > 0) {
    console.log('\nEndpoints que responderam GET com sucesso:');
    ok.forEach((r) => console.log(`  - ${r.path} (status ${r.status}) → ${r.body}`));
  }
}

main().catch((err) => {
  log.error({ err }, 'Script de descoberta falhou');
  process.exit(1);
});
