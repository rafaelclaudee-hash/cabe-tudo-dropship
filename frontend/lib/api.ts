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
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  items: Array<{
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

export interface CheckoutItem {
  productSlug: string;
  quantity: number;
}

export interface CheckoutParams {
  customerEmail: string;
  customerName: string;
  customerCpfCnpj: string;
  items: CheckoutItem[];
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
  // Atribuição de campanha (lida do cookie de UTM, ver lib/utm.ts)
  utmSource?: string;
  utmCampaign?: string;
  utmMedium?: string;
  utmContent?: string;
  utmTerm?: string;
  src?: string;
  sck?: string;
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

/**
 * Conta de cliente (login) — Fase 2. Sessão via cookie httpOnly, os
 * proxies /api/auth/* cuidam de repassar o cookie nos dois sentidos.
 */
export interface CustomerAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface RegisterParams {
  nome: string;
  email: string;
  senha: string;
  aceite_privacidade: boolean;
}

export interface LoginParams {
  email: string;
  senha: string;
}

async function extractAuthErrorMessage(response: Response): Promise<string> {
  const data = await response.json().catch(() => null);
  return data?.error?.message || data?.error?.code || `Erro (${response.status})`;
}

export async function registerCustomer(params: RegisterParams): Promise<CustomerAccount> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await extractAuthErrorMessage(response));
  }

  const data = await response.json();
  return data.customer;
}

export async function loginCustomer(params: LoginParams): Promise<CustomerAccount> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await extractAuthErrorMessage(response));
  }

  const data = await response.json();
  return data.customer;
}

/**
 * Devolve a conta logada, ou null se não houver sessão válida (401 é
 * esperado aqui — não é um estado de erro, é "deslogado").
 */
export async function fetchCurrentCustomer(): Promise<CustomerAccount | null> {
  const response = await fetch('/api/auth/me', { cache: 'no-store' });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Erro ao buscar conta logada: ${response.status}`);
  }

  const data = await response.json();
  return data.customer;
}

export async function logoutCustomer(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

/**
 * Newsletter — só captura e-mail (sem disparo de campanha). Idempotente
 * no backend: inscrever o mesmo e-mail de novo nunca lança erro.
 */
export interface NewsletterSubscribeParams {
  email: string;
  aceite_lgpd: boolean;
  origem: string;
}

export async function subscribeNewsletter(params: NewsletterSubscribeParams): Promise<void> {
  const response = await fetch('/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || data?.error?.code || `Erro (${response.status})`);
  }
}
