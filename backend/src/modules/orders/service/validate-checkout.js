/**
 * VALIDAÇÃO DE CHECKOUT
 * ==================================================================
 * Princípio inegociável: o preço que o cliente envia é apenas uma
 * EXPECTATIVA. A fonte da verdade é SEMPRE o banco, lido no momento
 * do pagamento. Nunca confie em valores vindos do frontend — qualquer
 * um pode editar o JSON da requisição no DevTools.
 *
 * Este serviço responde três perguntas, nesta ordem:
 *   1. O produto ainda existe, está ativo e disponível no fornecedor?
 *   2. O preço que o cliente viu ainda é o preço atual?
 *   3. Com o CUSTO ATUAL do fornecedor, esta venda ainda dá lucro?
 *
 * Saídas possíveis (result.code):
 *   OK               → pode cobrar
 *   PRICE_CHANGED    → preço mudou entre o carrinho e o pagamento;
 *                      devolve o preço novo para o front re-exibir
 *   UNAVAILABLE      → produto inativo ou fornecedor sem estoque
 *   MARGIN_BLOCKED   → fornecedor subiu o custo e a venda daria
 *                      prejuízo/margem abaixo do mínimo → bloqueia
 */
const { logger } = require('../../../shared/lib/logger');

const MIN_MARGIN_PERCENT = Number(process.env.MIN_MARGIN_PERCENT || 15);

/**
 * @param {import('pg').PoolClient} client - client DENTRO de transação
 * @param {Array<{productId: string, quantity: number, expectedUnitPriceCents: number}>} cartItems
 * @param {object} ctx - contexto p/ log (requestId, customerId...)
 * @returns {Promise<{ok: boolean, code: string, problems?: Array, order?: object}>}
 */
async function validateCheckout(client, cartItems, ctx = {}) {
  const log = logger.child({ service: 'validate-checkout', ...ctx });

  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { ok: false, code: 'EMPTY_CART' };
  }

  // 1) Busca o estado ATUAL de todos os itens em uma única query.
  //    FOR UPDATE trava as linhas até o fim da transação: nem o sync
  //    job nem outro checkout alteram custo/estoque no meio da validação.
  const productIds = cartItems.map((i) => i.productId);
  const { rows } = await client.query(
    `SELECT p.id AS product_id, p.name, p.active, p.sale_price_cents,
            sp.id AS supplier_product_id, sp.supplier_id, sp.available,
            sp.cost_cents, sp.supplier_shipping_cents
       FROM products p
       JOIN supplier_products sp
         ON sp.product_id = p.id AND sp.is_primary = true
      WHERE p.id = ANY($1::uuid[])
        FOR UPDATE`,
    [productIds]
  );
  const current = new Map(rows.map((r) => [r.product_id, r]));

  const problems = [];
  const validated = [];

  for (const item of cartItems) {
    const db = current.get(item.productId);

    // --- Checagem 1: existência e disponibilidade -------------------
    if (!db || !db.active || !db.available) {
      problems.push({
        productId: item.productId,
        code: 'UNAVAILABLE',
        message: 'Produto indisponível no momento',
      });
      continue;
    }

    // --- Checagem 2: preço que o cliente viu vs preço atual ---------
    // Se mudou (para cima OU para baixo), não cobramos silenciosamente
    // um valor diferente do exibido: devolvemos o preço novo e o front
    // pede confirmação. Transparência evita chargeback e reclamação.
    if (db.sale_price_cents !== item.expectedUnitPriceCents) {
      problems.push({
        productId: item.productId,
        code: 'PRICE_CHANGED',
        message: 'O preço deste produto foi atualizado',
        expectedCents: item.expectedUnitPriceCents,
        currentCents: db.sale_price_cents,
      });
      continue;
    }

    // --- Checagem 3: margem com o CUSTO ATUAL do fornecedor ---------
    // Cenário: cliente montou o carrinho às 14h; às 14h20 o sync
    // detectou custo maior; às 14h30 ele paga. Sem esta checagem,
    // você venderia no prejuízo sem perceber.
    const totalCost = db.cost_cents + db.supplier_shipping_cents;
    const marginCents = db.sale_price_cents - totalCost;
    const marginPct = (marginCents / db.sale_price_cents) * 100;

    if (marginPct < MIN_MARGIN_PERCENT) {
      problems.push({
        productId: item.productId,
        code: 'MARGIN_BLOCKED',
        // Mensagem EXTERNA genérica: o cliente não precisa saber
        // da sua estrutura de custos.
        message: 'Produto temporariamente indisponível',
      });
      // Log INTERNO completo: aqui sim, todos os números.
      log.error(
        {
          event: 'MARGIN_BLOCKED_AT_CHECKOUT',
          productId: db.product_id,
          product: db.name,
          salePriceCents: db.sale_price_cents,
          currentCostCents: totalCost,
          marginPct: marginPct.toFixed(1),
          minMarginPct: MIN_MARGIN_PERCENT,
        },
        'Checkout bloqueado: custo do fornecedor subiu e margem ficou abaixo do mínimo'
      );
      continue;
    }

    // Item aprovado — guarda os SNAPSHOTS que irão para order_items
    // e supplier_orders (preço e custo congelados no momento da venda).
    validated.push({
      productId: db.product_id,
      supplierProductId: db.supplier_product_id,
      supplierId: db.supplier_id,
      productName: db.name,
      quantity: item.quantity,
      unitPriceCents: db.sale_price_cents, // snapshot do preço de venda
      unitCostCents: totalCost,            // snapshot do custo
    });
  }

  // Política "tudo ou nada": qualquer problema → não cobra ninguém.
  // O front recebe a lista de problemas e re-renderiza o carrinho.
  if (problems.length > 0) {
    log.info(
      { event: 'CHECKOUT_REJECTED', problems: problems.map((p) => p.code) },
      'Checkout rejeitado na validação'
    );
    return { ok: false, code: problems[0].code, problems };
  }

  const totalCents = validated.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  log.info({ event: 'CHECKOUT_VALIDATED', items: validated.length, totalCents }, 'Checkout validado');

  return { ok: true, code: 'OK', order: { items: validated, totalCents } };
}

module.exports = { validateCheckout };

/* ------------------------------------------------------------------
 * USO no handler de checkout (esboço):
 *
 * const client = await pool.connect();
 * try {
 *   await client.query('BEGIN');
 *   const result = await validateCheckout(client, req.body.items, {
 *     requestId: req.id,
 *     customerId: req.user.id,
 *   });
 *
 *   if (!result.ok) {
 *     await client.query('ROLLBACK');
 *     return res.status(409).json({ error: result });  // 409 Conflict
 *   }
 *
 *   // Ainda DENTRO da transação (linhas travadas pelo FOR UPDATE):
 *   // 1. INSERT em orders + order_items (snapshots de result.order)
 *   // 2. INSERT em supplier_orders (um por fornecedor, custo congelado)
 *   // 3. Criar a cobrança no gateway com chave de idempotência
 *   await client.query('COMMIT');
 * } catch (err) {
 *   await client.query('ROLLBACK');
 *   throw err;
 * } finally {
 *   client.release();
 * }
 * ------------------------------------------------------------------ */
