const { notifyOrderStatusToUtmify } = require('../../tracking/service/notify-utmify');

/**
 * MARCAR PEDIDO COMO PAGO + CRIAR REPASSE AO FORNECEDOR
 * ==================================================================
 * Lógica compartilhada entre duas entradas possíveis:
 *   1. Webhook do Asaas (POST /webhooks/asaas) — caminho normal.
 *   2. Verificação ativa (GET /api/orders/:id/status) — fallback pra
 *      quando a entrega do webhook não chega a tempo (ou não chega).
 *
 * As duas entradas fazem exatamente a mesma coisa a partir daqui, então
 * vivem numa função só — evita duas implementações divergindo com o
 * tempo (e foi visto na prática: a entrega automática da Asaas não é
 * garantida contra uma instância que hiberna).
 *
 * Idempotência: o UPDATE guardado por "status = 'pending'" é a fonte
 * da verdade sobre se ALGO de fato mudou. Se o webhook e uma checagem
 * manual chegarem ao mesmo tempo para o mesmo pedido, o Postgres
 * serializa as duas transações na linha da tabela orders — só a
 * primeira a commitar realmente muda o status e cria supplier_orders;
 * a segunda vê "0 linhas afetadas" e cai no ramo ALREADY_PAID sem
 * duplicar nada.
 */

/**
 * @param {import('pg').Pool} pool
 * @param {string} paymentId - asaas_payment_id do pedido
 * @param {object} log - logger com contexto (child logger)
 * @param {object} [opts]
 * @param {string} [opts.source] - de onde veio a chamada ('webhook' | 'status-check'), só pra log
 * @returns {Promise<
 *   {outcome: 'PAID', orderId: string, supplierOrdersCreated: number} |
 *   {outcome: 'ALREADY_PAID', orderId: string, status: string} |
 *   {outcome: 'NOT_FOUND'}
 * >}
 */
async function markOrderPaidByPaymentId(pool, paymentId, log, { source } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: updatedRows } = await client.query(
      `UPDATE orders SET status = 'paid'
        WHERE asaas_payment_id = $1 AND status = 'pending'
        RETURNING id`,
      [paymentId]
    );

    if (updatedRows.length > 0) {
      const orderId = updatedRows[0].id;

      // Repasse ao fornecedor: um supplier_orders por fornecedor envolvido
      // no pedido. cost_cents vem do supplier_products ATUAL, nunca do
      // snapshot em order_items — o fornecedor pode ter mudado o preço
      // entre a compra e a confirmação do pagamento, e esse valor precisa
      // refletir quanto vai custar repor AGORA. Inclui
      // supplier_shipping_cents, mesmo cálculo do /api/checkout antigo.
      const { rows: supplierCosts } = await client.query(
        `SELECT sp.supplier_id,
                SUM((sp.cost_cents + sp.supplier_shipping_cents) * oi.quantity) AS cost_cents
           FROM order_items oi
           JOIN supplier_products sp
             ON sp.product_id = oi.product_id AND sp.is_primary = true
          WHERE oi.order_id = $1
          GROUP BY sp.supplier_id`,
        [orderId]
      );

      for (const row of supplierCosts) {
        await client.query(
          `INSERT INTO supplier_orders (order_id, supplier_id, status, cost_cents)
           VALUES ($1, $2, 'pending', $3)`,
          [orderId, row.supplier_id, row.cost_cents]
        );
      }

      await client.query('COMMIT');

      log.info(
        {
          event: 'ORDER_PAID',
          orderId,
          paymentId,
          source,
          supplierOrdersCreated: supplierCosts.length,
        },
        'Pedido marcado como pago — repasse ao fornecedor criado'
      );

      // Fora da transação (já commitada) e sem await — chamador (webhook
      // ou checkout de cartão síncrono) não deve esperar a Utmify pra
      // responder.
      notifyOrderStatusToUtmify(pool, orderId, { status: 'paid', approvedDate: new Date() }, log).catch(() => {});

      return { outcome: 'PAID', orderId, supplierOrdersCreated: supplierCosts.length };
    }

    // UPDATE não afetou nenhuma linha — descobre por quê, só pra decidir
    // o que devolver (e permitir logar direito no chamador).
    const { rows: existingRows } = await client.query(
      'SELECT id, status FROM orders WHERE asaas_payment_id = $1',
      [paymentId]
    );

    await client.query('COMMIT');

    if (existingRows.length === 0) {
      return { outcome: 'NOT_FOUND' };
    }

    return { outcome: 'ALREADY_PAID', orderId: existingRows[0].id, status: existingRows[0].status };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { markOrderPaidByPaymentId };
