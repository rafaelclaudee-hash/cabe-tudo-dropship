/**
 * NOTIFICAÇÃO DE PEDIDO PRA UTMIFY
 * ==================================================================
 * Monta o payload (lendo o pedido do BANCO, não do request atual — os
 * dois momentos mais tardios, pago e reembolsado, chegam via webhook
 * da Asaas, que não tem acesso ao cookie de UTM do navegador nem ao
 * body do checkout original) e chama o cliente da Utmify.
 *
 * Chamada nos 3 momentos do pedido:
 *   waiting_payment → logo após o pedido ser criado (POST /checkout)
 *   paid            → quando markOrderPaidByPaymentId confirma o 1º pagamento
 *   refunded        → webhook PAYMENT_REFUNDED da Asaas
 *
 * NUNCA lança — todo erro (query, rede, Utmify fora do ar) vira log e
 * a função retorna normalmente. Chamar sem "await" nos pontos de
 * origem também é seguro por isso, mas cada chamador ainda decide se
 * quer aguardar ou não.
 */
const { notifyOrder } = require('../gateway/utmify-client');
const { logger } = require('../../../shared/lib/logger');

const PAYMENT_METHOD_MAP = { PIX: 'pix', CREDIT_CARD: 'credit_card', BOLETO: 'boleto' };

// Utmify espera "YYYY-MM-DD HH:mm:ss" em UTC+0 (doc oficial), não ISO 8601.
function toUtmifyDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} orderId
 * @param {object} params
 * @param {'waiting_payment'|'paid'|'refunded'} params.status
 * @param {Date} [params.approvedDate] - só quando status = 'paid'
 * @param {Date} [params.refundedAt] - só quando status = 'refunded'
 * @param {object} [log] - logger com contexto (child logger)
 */
async function notifyOrderStatusToUtmify(pool, orderId, { status, approvedDate, refundedAt }, log = logger) {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.total_cents, o.payment_method, o.created_at,
              o.utm_source, o.utm_campaign, o.utm_medium, o.utm_content, o.utm_term, o.src, o.sck,
              o.customer_ip, o.customer_cpf_cnpj, o.customer_phone,
              c.name AS customer_name, c.email AS customer_email,
              oi.product_id, oi.product_name, oi.unit_price_cents, oi.quantity,
              p.slug AS product_slug
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE o.id = $1`,
      [orderId]
    );

    if (rows.length === 0) {
      log.warn({ orderId, event: 'UTMIFY_ORDER_NOT_FOUND' }, 'Pedido não encontrado pra notificar Utmify');
      return;
    }

    const first = rows[0];

    const products = rows.map((r) => ({
      id: r.product_id,
      name: r.product_name,
      planId: null,
      planName: null,
      quantity: r.quantity,
      priceInCents: r.unit_price_cents,
    }));

    const totalPriceInCents = first.total_cents;
    // Estimativa: a Asaas cobra por fora, não temos a taxa exata aqui.
    const gatewayFeeInCents = Math.round(totalPriceInCents * 0.05);
    // NÃO subtrai custo de produto aqui — a Utmify já faz essa conta
    // sozinha a partir do cadastro de custo dela própria (card "Custos
    // de Produto" no painel). Se subtraíssemos aqui de novo, o custo
    // sairia contado em dobro e o "Faturamento Líquido" ficaria errado.
    const userCommissionInCents = totalPriceInCents - gatewayFeeInCents;

    const payload = {
      orderId: first.id,
      platform: 'CabeTudo',
      paymentMethod: PAYMENT_METHOD_MAP[first.payment_method] || 'pix',
      status,
      createdAt: toUtmifyDate(first.created_at),
      approvedDate: approvedDate ? toUtmifyDate(approvedDate) : null,
      refundedAt: refundedAt ? toUtmifyDate(refundedAt) : null,
      customer: {
        name: first.customer_name,
        email: first.customer_email,
        phone: first.customer_phone || null,
        document: first.customer_cpf_cnpj || null,
        country: 'BR',
        ip: first.customer_ip || null,
      },
      products,
      trackingParameters: {
        src: first.src || null,
        sck: first.sck || null,
        utm_source: first.utm_source || null,
        utm_campaign: first.utm_campaign || null,
        utm_medium: first.utm_medium || null,
        utm_content: first.utm_content || null,
        utm_term: first.utm_term || null,
      },
      commission: {
        totalPriceInCents,
        gatewayFeeInCents,
        userCommissionInCents,
        currency: 'BRL',
      },
      // Pedidos do produto interno teste-pagamento não devem contaminar
      // o painel de vendas reais da Utmify.
      isTest: rows.some((r) => r.product_slug === 'teste-pagamento'),
    };

    await notifyOrder(payload, { log });
  } catch (err) {
    // Erro ao MONTAR o payload (query falhou etc) também não pode
    // derrubar quem chamou — checkout/webhook seguem normais.
    log.error({ err, orderId, event: 'UTMIFY_NOTIFY_BUILD_FAILED' }, 'Erro ao montar/enviar notificação Utmify');
  }
}

module.exports = { notifyOrderStatusToUtmify };
