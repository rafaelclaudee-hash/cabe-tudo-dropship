'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchProductBySlug,
  createCheckout,
  type Product,
  type PaymentMethod,
  type CheckoutResult,
} from '@/lib/api';
import { readUtmCookie } from '@/lib/utm';
import { useCart } from '@/lib/cart-context';

function formatCentsToBRL(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

// Aceita CPF (11 dígitos) ou CNPJ (14), com ou sem máscara — só formato,
// sem checar dígito verificador (não foi pedido).
function isValidCpfCnpjFormat(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14;
}

// CEP brasileiro: 8 dígitos, com ou sem hífen.
function isValidZipCodeFormat(value: string) {
  return value.replace(/\D/g, '').length === 8;
}

// Telefone brasileiro: 10 (fixo) ou 11 (celular) dígitos, com DDD.
function isValidPhoneFormat(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão',
  BOLETO: 'Boleto',
};

function friendlyErrorMessage(message: string) {
  if (message === 'PRODUCT_NOT_FOUND') return 'Produto não encontrado.';
  if (message === 'PRODUCT_UNAVAILABLE') return 'Um ou mais produtos do carrinho não estão mais disponíveis.';
  if (message === 'PAYMENT_GATEWAY_ERROR') {
    return 'Não foi possível gerar a cobrança agora. Seu pedido já foi registrado — tente novamente.';
  }
  if (message === 'Backend indisponível') {
    return 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
  }
  return message;
}

interface CheckoutLineItem {
  slug: string;
  quantity: number;
  product: Product;
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const directProductSlug = searchParams.get('product');
  const isDirectMode = Boolean(directProductSlug);

  const { items: cartItems } = useCart();

  // Modo compra direta: 1 produto, quantidade editável nesta página
  // (comportamento de sempre). Modo carrinho: quantidades já vêm
  // fixadas do carrinho (ajustadas no drawer, não aqui).
  const [directQuantity, setDirectQuantity] = useState(1);

  const [lineItems, setLineItems] = useState<CheckoutLineItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [unavailableSlugs, setUnavailableSlugs] = useState<string[]>([]);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState('');

  const [shippingZipCode, setShippingZipCode] = useState('');
  const [shippingStreet, setShippingStreet] = useState('');
  const [shippingNumber, setShippingNumber] = useState('');
  const [shippingComplement, setShippingComplement] = useState('');
  const [shippingNeighborhood, setShippingNeighborhood] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [installments, setInstallments] = useState(1);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiryMonth, setCardExpiryMonth] = useState('');
  const [cardExpiryYear, setCardExpiryYear] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardHolderPhone, setCardHolderPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Busca os produtos (1 direto, ou todos do carrinho) e monta a lista
  // unificada que o resto da página usa, independente do modo.
  useEffect(() => {
    let cancelled = false;

    async function loadDirect(slug: string) {
      try {
        const product = await fetchProductBySlug(slug);
        if (cancelled) return;
        if (!product) {
          setItemsError('Produto não encontrado.');
        } else {
          setLineItems([{ slug, quantity: directQuantity, product }]);
        }
      } catch (err) {
        if (!cancelled) setItemsError('Erro ao carregar produto. Tente novamente.');
        console.error(err);
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    }

    async function loadCart() {
      if (cartItems.length === 0) {
        if (!cancelled) setItemsLoading(false);
        return;
      }
      try {
        const results = await Promise.all(
          cartItems.map(async (item) => ({ item, product: await fetchProductBySlug(item.slug) }))
        );
        if (cancelled) return;

        const missing = results.filter((r) => !r.product);
        // Item cadastrado no carrinho (localStorage) mas que sumiu do
        // catálogo (descontinuado/ocultado) desde que foi adicionado —
        // não trava o checkout, só ignora esse item e avisa.
        if (missing.length > 0) {
          setUnavailableSlugs(missing.map((r) => r.item.slug));
        }

        const valid = results
          .filter((r): r is { item: { slug: string; quantity: number }; product: Product } => Boolean(r.product))
          .map((r) => ({ slug: r.item.slug, quantity: r.item.quantity, product: r.product }));

        setLineItems(valid);
      } catch (err) {
        setItemsError('Erro ao carregar carrinho. Tente novamente.');
        console.error(err);
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    }

    setItemsLoading(true);
    setItemsError(null);
    setUnavailableSlugs([]);

    if (directProductSlug) {
      loadDirect(directProductSlug);
    } else {
      loadCart();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directProductSlug, isDirectMode ? directQuantity : cartItems]);

  // Evita levar um número de parcelas de quando o carrinho/produto era
  // outro (ou de quando o método era cartão pra quando volta a ser)
  // além do limite efetivo atual.
  useEffect(() => {
    setInstallments(1);
  }, [lineItems.length, paymentMethod]);

  const totalCents = lineItems.reduce((sum, li) => sum + li.product.sale_price_cents * li.quantity, 0);

  // Carrinho com produtos de max_installments diferentes: o limite que
  // vale pro cliente ver (e o backend confirma de novo) é o mais
  // restritivo.
  const effectiveMaxInstallments =
    lineItems.length > 0 ? Math.min(...lineItems.map((li) => li.product.max_installments)) : 1;

  const isCardStepValid =
    paymentMethod !== 'CREDIT_CARD' ||
    (cardNumber.replace(/\D/g, '').length >= 13 &&
      cardExpiryMonth.length === 2 &&
      cardExpiryYear.length === 4 &&
      cardCvv.length >= 3 &&
      cardHolderName.trim().length > 0 &&
      isValidPhoneFormat(cardHolderPhone) &&
      installments >= 1 &&
      installments <= effectiveMaxInstallments);

  const isFormValid =
    lineItems.length > 0 &&
    customerName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(customerEmail) &&
    isValidCpfCnpjFormat(customerCpfCnpj) &&
    isValidZipCodeFormat(shippingZipCode) &&
    shippingStreet.trim().length > 0 &&
    shippingNumber.trim().length > 0 &&
    shippingNeighborhood.trim().length > 0 &&
    shippingCity.trim().length > 0 &&
    shippingState.length === 2 &&
    isCardStepValid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const utm = readUtmCookie();

      const data = await createCheckout({
        customerEmail,
        customerName,
        customerCpfCnpj: customerCpfCnpj.replace(/\D/g, ''),
        items: lineItems.map((li) => ({ productSlug: li.slug, quantity: li.quantity })),
        shippingZipCode,
        shippingStreet,
        shippingNumber,
        shippingComplement: shippingComplement || undefined,
        shippingNeighborhood,
        shippingCity,
        shippingState,
        paymentMethod,
        ...(paymentMethod === 'CREDIT_CARD'
          ? {
              installments,
              cardNumber: cardNumber.replace(/\D/g, ''),
              cardExpiryMonth,
              cardExpiryYear,
              cardCvv,
              cardHolderName,
              cardHolderPhone: cardHolderPhone.replace(/\D/g, ''),
            }
          : {}),
        ...(utm
          ? {
              utmSource: utm.utm_source,
              utmCampaign: utm.utm_campaign,
              utmMedium: utm.utm_medium,
              utmContent: utm.utm_content,
              utmTerm: utm.utm_term,
              src: utm.src,
              sck: utm.sck,
            }
          : {}),
      });
      setResult(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? friendlyErrorMessage(err.message) : 'Erro ao processar o pagamento.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  if (!isDirectMode && cartItems.length === 0 && !itemsLoading) {
    return (
      <main className="page">
        <h1>Checkout</h1>
        <div className="card" style={{ cursor: 'default' }}>
          <p>Seu carrinho está vazio.</p>
        </div>
        <Link href="/" className="btn-back">← Voltar para a loja</Link>
      </main>
    );
  }

  if (itemsLoading) {
    return (
      <main className="page">
        <p>Carregando {isDirectMode ? 'produto' : 'carrinho'}...</p>
      </main>
    );
  }

  if (itemsError || lineItems.length === 0) {
    return (
      <main className="page">
        <p className="error-text">{itemsError || 'Nenhum produto disponível pra checkout.'}</p>
        <Link href="/" className="btn-back">← Voltar para a loja</Link>
      </main>
    );
  }

  if (result) {
    return (
      <main className="page">
        {result.paymentMethod === 'PIX' && (
          <>
            <h1>Pagamento pendente</h1>
            <div className="card qr-code-box">
              {/* qrCodeImage vem em base64 puro do backend */}
              <img src={`data:image/png;base64,${result.qrCodeImage}`} alt="QR Code Pix" className="qr-code-image" />
              <p className="form-hint">Escaneie no app do seu banco, ou copie o código abaixo:</p>
              <div className="copy-field">
                <input type="text" readOnly value={result.payload} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={() => handleCopy(result.payload)}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="form-hint">Válido até {new Date(result.expirationDate).toLocaleString('pt-BR')}</p>
            </div>
          </>
        )}

        {result.paymentMethod === 'CREDIT_CARD' && (
          <>
            <h1>{result.status === 'paid' ? 'Pagamento aprovado!' : 'Pagamento em análise'}</h1>
            <div className="card qr-code-box">
              <p>
                {result.status === 'paid'
                  ? 'Seu cartão foi aprovado.'
                  : 'Seu pagamento está sendo processado pela operadora — você verá a confirmação em Meus Pedidos assim que sair.'}
              </p>
              <p className="form-hint">
                {result.installments > 1
                  ? `Parcelado em ${result.installments}x de ${formatCentsToBRL(result.totalCents / result.installments)}, sem juros.`
                  : `Cobrança à vista de ${formatCentsToBRL(result.totalCents)}.`}
              </p>
            </div>
          </>
        )}

        {result.paymentMethod === 'BOLETO' && (
          <>
            <h1>Boleto gerado</h1>
            <div className="card qr-code-box">
              <p className="form-hint">Compensação em até 3 dias úteis após o pagamento.</p>
              <div className="copy-field">
                <input type="text" readOnly value={result.identificationField} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={() => handleCopy(result.identificationField)}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <a href={result.bankSlipUrl} target="_blank" rel="noopener noreferrer" className="btn">
                Abrir boleto (PDF)
              </a>
              <p className="form-hint">Vencimento: {new Date(result.dueDate).toLocaleDateString('pt-BR')}</p>
            </div>
          </>
        )}

        <p>
          Assim que o pagamento for confirmado, seu pedido aparece em{' '}
          <Link href="/orders">Meus Pedidos</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <Link href={isDirectMode ? `/product/${directProductSlug}` : '/'} className="btn-back">
        ← {isDirectMode ? 'Voltar para o produto' : 'Voltar para a loja'}
      </Link>
      <h1>Checkout</h1>

      {unavailableSlugs.length > 0 && (
        <p className="error-text">
          {unavailableSlugs.length} item(ns) do carrinho não está(ão) mais disponível(is) e foi(ram) ignorado(s) neste
          pedido.
        </p>
      )}

      <ul className="checkout-summary">
        {lineItems.map((li) => (
          <li key={li.slug} className="checkout-summary__item">
            <span className="checkout-summary__name">
              {li.product.name}
              {li.quantity > 1 ? ` × ${li.quantity}` : ''}
            </span>
            <span className="price">{formatCentsToBRL(li.product.sale_price_cents * li.quantity)}</span>
          </li>
        ))}
        <li className="checkout-summary__total">
          <span>Total</span>
          <span className="price">{formatCentsToBRL(totalCents)}</span>
        </li>
      </ul>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Nome completo
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          CPF ou CNPJ
          <input
            type="text"
            value={customerCpfCnpj}
            onChange={(e) => setCustomerCpfCnpj(e.target.value)}
            placeholder="000.000.000-00"
            required
            disabled={submitting}
          />
        </label>

        {isDirectMode && (
          <label>
            Quantidade
            <input
              type="number"
              min={1}
              value={directQuantity}
              onChange={(e) => setDirectQuantity(Math.max(1, Number(e.target.value) || 1))}
              disabled={submitting}
            />
          </label>
        )}

        <h3>Endereço de entrega</h3>

        <label>
          CEP
          <input
            type="text"
            value={shippingZipCode}
            onChange={(e) => setShippingZipCode(e.target.value)}
            placeholder="00000-000"
            required
            disabled={submitting}
          />
        </label>

        <label>
          Rua
          <input
            type="text"
            value={shippingStreet}
            onChange={(e) => setShippingStreet(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Número
          <input
            type="text"
            value={shippingNumber}
            onChange={(e) => setShippingNumber(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Complemento (opcional)
          <input
            type="text"
            value={shippingComplement}
            onChange={(e) => setShippingComplement(e.target.value)}
            placeholder="Apto, bloco, referência..."
            disabled={submitting}
          />
        </label>

        <label>
          Bairro
          <input
            type="text"
            value={shippingNeighborhood}
            onChange={(e) => setShippingNeighborhood(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Cidade
          <input
            type="text"
            value={shippingCity}
            onChange={(e) => setShippingCity(e.target.value)}
            required
            disabled={submitting}
          />
        </label>

        <label>
          Estado
          <select
            value={shippingState}
            onChange={(e) => setShippingState(e.target.value)}
            required
            disabled={submitting}
          >
            <option value="">Selecione...</option>
            {BRAZILIAN_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </label>

        <h3>Forma de pagamento</h3>

        <div className="payment-method-selector">
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              className={`payment-method-option${paymentMethod === method ? ' payment-method-option--active' : ''}`}
              onClick={() => setPaymentMethod(method)}
              disabled={submitting}
            >
              {PAYMENT_METHOD_LABELS[method]}
            </button>
          ))}
        </div>

        {paymentMethod === 'CREDIT_CARD' && (
          <>
            <label>
              Número do cartão
              <input
                type="text"
                inputMode="numeric"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="0000 0000 0000 0000"
                required
                disabled={submitting}
              />
            </label>

            <div className="form-row">
              <label>
                Validade (mês)
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={cardExpiryMonth}
                  onChange={(e) => setCardExpiryMonth(e.target.value.replace(/\D/g, ''))}
                  placeholder="MM"
                  required
                  disabled={submitting}
                />
              </label>
              <label>
                Validade (ano)
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={cardExpiryYear}
                  onChange={(e) => setCardExpiryYear(e.target.value.replace(/\D/g, ''))}
                  placeholder="AAAA"
                  required
                  disabled={submitting}
                />
              </label>
              <label>
                CVV
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                  placeholder="000"
                  required
                  disabled={submitting}
                />
              </label>
            </div>

            <label>
              Nome impresso no cartão
              <input
                type="text"
                value={cardHolderName}
                onChange={(e) => setCardHolderName(e.target.value)}
                required
                disabled={submitting}
              />
            </label>

            <label>
              Telefone do titular
              <input
                type="text"
                value={cardHolderPhone}
                onChange={(e) => setCardHolderPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                required
                disabled={submitting}
              />
            </label>

            <label>
              Parcelas
              <select
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                disabled={submitting}
              >
                {Array.from({ length: effectiveMaxInstallments }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}x de {formatCentsToBRL(totalCents / n)}{n > 1 ? ' sem juros' : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {paymentMethod === 'BOLETO' && (
          <p className="form-hint">Boleto: compensação em até 3 dias úteis após o pagamento.</p>
        )}

        {submitError && <p className="error-text">{submitError}</p>}

        <button type="submit" disabled={!isFormValid || submitting}>
          {submitting
            ? 'Processando...'
            : paymentMethod === 'PIX'
              ? 'Pagar com Pix'
              : paymentMethod === 'CREDIT_CARD'
                ? 'Pagar com cartão'
                : 'Gerar boleto'}
        </button>
      </form>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <p>Carregando...</p>
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
