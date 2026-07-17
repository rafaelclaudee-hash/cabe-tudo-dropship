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
  if (message === 'PAYMENT_GATEWAY_ERROR') {
    return 'Não foi possível gerar a cobrança agora. Seu pedido já foi registrado — tente novamente.';
  }
  if (message === 'Backend indisponível') {
    return 'Não foi possível conectar ao servidor. Tente novamente em instantes.';
  }
  return message;
}

function CheckoutContent() {
  const searchParams = useSearchParams();
  const productSlug = searchParams.get('product');

  const [product, setProduct] = useState<Product | null>(null);
  const [productLoading, setProductLoading] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState('');
  const [quantity, setQuantity] = useState(1);

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

  useEffect(() => {
    if (!productSlug) {
      setProductLoading(false);
      return;
    }

    let cancelled = false;
    async function loadProduct() {
      try {
        const data = await fetchProductBySlug(productSlug as string);
        if (cancelled) return;
        if (!data) {
          setProductError('Produto não encontrado.');
        } else {
          setProduct(data);
        }
      } catch (err) {
        if (!cancelled) setProductError('Erro ao carregar produto. Tente novamente.');
        console.error(err);
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  // Evita levar um número de parcelas de um produto pro outro (ou de
  // quando o método era cartão pra quando volta a ser) além do limite.
  useEffect(() => {
    setInstallments(1);
  }, [product?.slug, paymentMethod]);

  const isCardStepValid =
    paymentMethod !== 'CREDIT_CARD' ||
    (cardNumber.replace(/\D/g, '').length >= 13 &&
      cardExpiryMonth.length === 2 &&
      cardExpiryYear.length === 4 &&
      cardCvv.length >= 3 &&
      cardHolderName.trim().length > 0 &&
      isValidPhoneFormat(cardHolderPhone) &&
      installments >= 1 &&
      installments <= (product?.max_installments || 1));

  const isFormValid =
    customerName.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(customerEmail) &&
    isValidCpfCnpjFormat(customerCpfCnpj) &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    isValidZipCodeFormat(shippingZipCode) &&
    shippingStreet.trim().length > 0 &&
    shippingNumber.trim().length > 0 &&
    shippingNeighborhood.trim().length > 0 &&
    shippingCity.trim().length > 0 &&
    shippingState.length === 2 &&
    isCardStepValid;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFormValid || !productSlug) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const data = await createCheckout({
        customerEmail,
        customerName,
        customerCpfCnpj: customerCpfCnpj.replace(/\D/g, ''),
        productSlug,
        quantity,
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

  if (!productSlug) {
    return (
      <main className="page">
        <h1>Checkout</h1>
        <div className="card" style={{ cursor: 'default' }}>
          <p>Nenhum produto selecionado.</p>
        </div>
        <Link href="/" className="btn-back">← Voltar para a loja</Link>
      </main>
    );
  }

  if (productLoading) {
    return (
      <main className="page">
        <p>Carregando produto...</p>
      </main>
    );
  }

  if (productError || !product) {
    return (
      <main className="page">
        <p className="error-text">{productError || 'Produto não encontrado.'}</p>
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

  const totalCents = product.sale_price_cents * quantity;

  return (
    <main className="page">
      <Link href={`/product/${product.slug}`} className="btn-back">← Voltar para o produto</Link>
      <h1>Checkout</h1>

      <div className="card" style={{ cursor: 'default' }}>
        <h3>{product.name}</h3>
        <span className="price">{formatCentsToBRL(product.sale_price_cents)}</span>
        {quantity > 1 && <small>Total ({quantity}x): {formatCentsToBRL(totalCents)}</small>}
      </div>

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

        <label>
          Quantidade
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            disabled={submitting}
          />
        </label>

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
                {Array.from({ length: product.max_installments }, (_, i) => i + 1).map((n) => (
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
