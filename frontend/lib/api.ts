/**
 * Client de API para conectar ao backend Dropship Engine
 * ------------------------------------------------------------------
 * Chama os endpoints de proxy do próprio frontend (`/api/...`),
 * que por sua vez chamam o backend em http://localhost:3000.
 *
 * Endpoints disponíveis:
 *   - GET /api/products       → lista todos os produtos
 *   - GET /api/products/:slug → busca um produto por slug
 *   - GET /api/orders?email=X → lista pedidos do cliente
 *   - POST /api/checkout      → mock antigo, não usar (ver createOrder)
 *   - POST /api/checkout-pix  → checkout real (pedido + cobrança Asaas:
 *                               Pix, cartão de crédito ou boleto — nome
 *                               da rota ficou de quando só existia Pix)
 */

export interface Product {
  id: string;
  name: string;
  slug: string;
  sale_price_cents: number;
  description?: string;
  photos?: string[];
  featured?: boolean;
  category?: string;
  available: boolean;
  max_installments: number;
  supplier_name: string;
  avg_shipping_days: number;
}

export interface Order {
  order_id: string;
  status: string;
  total_cents: number;
  created_at: string;
  items: Array<{
    product_id: string;
    product_name: string;
    unit_price_cents: number;
    quantity: number;
  }>;
}

/**
 * Lista todos os produtos ativos
 */
export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch(`/api/products`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar produtos: ${response.status}`);
  }

  const data = await response.json();
  return data.products || [];
}

/**
 * Busca um produto específico pelo slug
 */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const response = await fetch(`/api/products/${slug}`, {
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Erro ao buscar produto: ${response.status}`);
  }

  return response.json();
}

/**
 * Lista os pedidos de um cliente pelo email
 */
export async function fetchOrdersByEmail(email: string): Promise<Order[]> {
  const response = await fetch(`/api/orders?email=${encodeURIComponent(email)}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar pedidos: ${response.status}`);
  }

  const data = await response.json();
  return data.orders || [];
}

/**
 * Cria um novo pedido (NÃO IMPLEMENTADO AINDA)
 * Será integrado com o gateway de pagamento na fase 2
 */
export async function createOrder(customerEmail: string, items: any[]) {
  const response = await fetch(`/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerEmail, items }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao criar pedido: ${response.status}`);
  }

  return response.json();
}

export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BOLETO';

export interface CheckoutParams {
  customerEmail: string;
  customerName: string;
  customerCpfCnpj: string;
  productSlug: string;
  quantity: number;
  shippingStreet: string;
  shippingNumber: string;
  shippingComplement?: string;
  shippingNeighborhood: string;
  shippingCity: string;
  shippingState: string;
  shippingZipCode: string;
  paymentMethod: PaymentMethod;
  // Só quando paymentMethod === 'CREDIT_CARD'
  installments?: number;
  cardNumber?: string;
  cardExpiryMonth?: string;
  cardExpiryYear?: string;
  cardCvv?: string;
  cardHolderName?: string;
  cardHolderPhone?: string;
}

export interface PixCheckoutResult {
  orderId: string;
  paymentMethod: 'PIX';
  payload: string;
  qrCodeImage: string;
  expirationDate: string;
}

export interface CreditCardCheckoutResult {
  orderId: string;
  paymentMethod: 'CREDIT_CARD';
  status: string;
  installments: number;
  totalCents: number;
}

export interface BoletoCheckoutResult {
  orderId: string;
  paymentMethod: 'BOLETO';
  bankSlipUrl: string;
  identificationField: string;
  barCode: string;
  dueDate: string;
}

export type CheckoutResult = PixCheckoutResult | CreditCardCheckoutResult | BoletoCheckoutResult;

/**
 * Cria o pedido e a cobrança de verdade (gateway Asaas) — Pix, cartão
 * de crédito ou boleto, de acordo com params.paymentMethod.
 */
export async function createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
  const response = await fetch(`/api/checkout-pix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    // O backend responde { error: { code, message? } } ou, no proxy
    // indisponível, { error: 'Backend indisponível' } (string direto) —
    // tenta extrair algo legível antes de cair no status genérico.
    const data = await response.json().catch(() => null);
    const message =
      (typeof data?.error === 'string' && data.error) ||
      data?.error?.message ||
      data?.error?.code ||
      `Erro ao criar checkout (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}
