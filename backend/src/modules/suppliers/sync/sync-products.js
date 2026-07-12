/**
 * SYNC JOB — sincroniza custo/estoque com os fornecedores
 * ==================================================================
 * Execução: node src/modules/suppliers/sync/sync-products.js
 * Em produção, agende via cron (ex: a cada 30 min):
 *   "*\/30 * * * *  node .../sync-products.js"
 * ou use um scheduler gerenciado (Railway cron, GitHub Actions, etc).
 *
 * DECISÃO DE DESIGN MAIS IMPORTANTE DESTE ARQUIVO:
 * ------------------------------------------------------------------
 * Um produto NUNCA é desativado na primeira falha de sync.
 * Fornecedor fora do ar por 10 minutos não significa "sem estoque".
 *
 * Mecânica:
 *   - Falha de rede/5xx → retry com backoff (fetchWithRetry).
 *   - Se TODAS as tentativas falharem → incrementa sync_failures,
 *     marca last_sync_status = 'error', MAS mantém 'available' como está.
 *   - Só após MAX_CONSECUTIVE_FAILURES syncs seguidos falhando é que
 *     o produto é pausado por segurança (e um alerta é emitido).
 *   - Um sync bem-sucedido zera o contador de falhas.
 *
 * Isso exige uma coluna nova (rode esta migration antes):
 *   ALTER TABLE supplier_products
 *     ADD COLUMN IF NOT EXISTS sync_failures INTEGER NOT NULL DEFAULT 0;
 */
const { randomUUID } = require('crypto');
const { Pool } = require('pg'); // npm i pg
const { logger } = require('../../../shared/lib/logger');
const { fetchWithRetry } = require('../../../shared/lib/fetch-with-retry');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---- Parâmetros operacionais (ajuste via env sem tocar no código) ----
const MAX_CONSECUTIVE_FAILURES = Number(process.env.SYNC_MAX_FAILURES || 3);
const MIN_MARGIN_PERCENT = Number(process.env.MIN_MARGIN_PERCENT || 15);
const BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE || 50);
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 5);

/**
 * Busca os produtos mais "atrasados" de sync.
 * FOR UPDATE SKIP LOCKED: se dois workers rodarem ao mesmo tempo,
 * cada um pega produtos diferentes — sem sync duplicado, sem lock.
 */
async function fetchProductsToSync(client) {
  const { rows } = await client.query(
    `SELECT sp.id, sp.product_id, sp.supplier_id, sp.supplier_sku,
            sp.sync_url, sp.cost_cents, sp.sync_failures, sp.available,
            p.name AS product_name, p.sale_price_cents,
            s.name AS supplier_name
       FROM supplier_products sp
       JOIN products  p ON p.id = sp.product_id
       JOIN suppliers s ON s.id = sp.supplier_id AND s.status = 'active'
      WHERE sp.sync_url IS NOT NULL
      ORDER BY sp.last_synced_at ASC NULLS FIRST
      LIMIT $1
        FOR UPDATE OF sp SKIP LOCKED`,
    [BATCH_SIZE]
  );
  return rows;
}

/**
 * Normaliza a resposta do fornecedor para um formato interno único.
 * Cada fornecedor tem um payload diferente — este é o ÚNICO lugar
 * que conhece esses formatos. O resto do sistema só vê o formato interno.
 */
function parseSupplierPayload(raw) {
  // Exemplo assumindo payload { price: 12.34, stock: 10 }.
  // Adicione um "adapter" por fornecedor aqui conforme integrar novos.
  const costCents = Math.round(Number(raw.price) * 100);
  const inStock = Number(raw.stock) > 0;

  // Validação defensiva: payload malformado é tratado como ERRO,
  // nunca como "custo zero" (que zeraria sua margem silenciosamente).
  if (!Number.isFinite(costCents) || costCents <= 0) {
    throw Object.assign(new Error('Payload do fornecedor sem preço válido'), { permanent: true });
  }
  return { costCents, inStock, raw };
}

/** Sincroniza UM produto. Retorna um resumo para as estatísticas do job. */
async function syncOne(client, item, log) {
  try {
    const raw = await fetchWithRetry(item.sync_url, { log });
    const { costCents, inStock } = parseSupplierPayload(raw);

    const costChanged = costCents !== item.cost_cents;
    const marginCents = item.sale_price_cents - costCents;
    const marginPct = (marginCents / item.sale_price_cents) * 100;
    const marginBelowMin = marginPct < MIN_MARGIN_PERCENT;

    await client.query(
      `UPDATE supplier_products
          SET cost_cents = $1,
              available = $2,
              sync_failures = 0,                -- sucesso zera o contador
              last_synced_at = now(),
              last_sync_status = $3,
              raw_supplier_data = $4
        WHERE id = $5`,
      [
        costCents,
        inStock,
        marginBelowMin ? 'price_changed' : inStock ? 'ok' : 'out_of_stock',
        JSON.stringify(raw),
        item.id,
      ]
    );

    // Alerta de margem: o bug nº 1 que quebra dropshipper é vender
    // no prejuízo depois que o fornecedor sobe o preço.
    if (costChanged && marginBelowMin) {
      log.warn(
        {
          event: 'MARGIN_ALERT',
          productId: item.product_id,
          product: item.product_name,
          oldCostCents: item.cost_cents,
          newCostCents: costCents,
          salePriceCents: item.sale_price_cents,
          marginPct: marginPct.toFixed(1),
        },
        'Margem abaixo do mínimo após sync — revisar preço de venda'
      );
      // Aqui você pluga notificação real: e-mail, Telegram, Slack...
    }

    return { status: 'ok', costChanged };
  } catch (err) {
    // Falha (após retries ou permanente): registra SEM zerar o produto.
    const failures = item.sync_failures + 1;
    const shouldPause = failures >= MAX_CONSECUTIVE_FAILURES;

    await client.query(
      `UPDATE supplier_products
          SET sync_failures = $1,
              last_sync_status = 'error',
              last_synced_at = now(),
              available = CASE WHEN $2 THEN false ELSE available END
        WHERE id = $3`,
      [failures, shouldPause, item.id]
    );

    const logPayload = {
      event: shouldPause ? 'PRODUCT_PAUSED' : 'SYNC_FAILED',
      productId: item.product_id,
      supplier: item.supplier_name,
      consecutiveFailures: failures,
      permanent: Boolean(err.permanent),
      err: err.message, // mensagem curta; stack completo só em nível debug
    };

    if (shouldPause) {
      log.error(logPayload, `Produto pausado após ${failures} falhas consecutivas de sync`);
    } else {
      log.warn(logPayload, 'Sync falhou — produto mantido, aguardando próximo ciclo');
    }
    return { status: 'failed', paused: shouldPause };
  }
}

/** Executa promessas com limite de concorrência (sem lib externa). */
async function runWithConcurrency(items, limit, fn) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  // jobId: TODA linha de log deste ciclo carrega o mesmo id.
  // Para investigar um ciclo específico: grep pelo jobId.
  const log = logger.child({ job: 'sync-products', jobId: randomUUID() });
  const startedAt = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const items = await fetchProductsToSync(client);
    log.info({ count: items.length }, 'Iniciando ciclo de sincronização');

    const results = await runWithConcurrency(items, CONCURRENCY, (item) =>
      syncOne(client, item, log.child({ supplierProductId: item.id }))
    );
    await client.query('COMMIT');

    // Uma ÚNICA linha de resumo por ciclo — é ela que você olha no dia a dia.
    log.info(
      {
        event: 'SYNC_SUMMARY',
        total: results.length,
        ok: results.filter((r) => r.status === 'ok').length,
        failed: results.filter((r) => r.status === 'failed').length,
        paused: results.filter((r) => r.paused).length,
        priceChanges: results.filter((r) => r.costChanged).length,
        durationMs: Date.now() - startedAt,
      },
      'Ciclo de sincronização concluído'
    );
  } catch (err) {
    await client.query('ROLLBACK');
    log.fatal({ err }, 'Ciclo de sync abortado por erro inesperado');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
