'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchProductBySlug, createPixCheckout, type Product, type PixCheckoutResult } from '@/lib/api';

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

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

function friendlyErrorMessage(message: string) {
  if (message === 'PRODUCT_NOT_FOUND') return 'Produto não encontrado.';
  if (message === 'PAYMENT_GATEWAY_ERROR') {
    return 'Não foi possível gerar a cobrança Pix agora. Seu pedido já foi registrado — tente novamente.';
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

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PixCheckoutResult | null>(null);
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
    shippingState.length === 2;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isFormValid || !productSlug) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const data = await createPixCheckout({
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
      });
      setResult(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? friendlyErrorMessage(err.message) : 'Erro ao processar o pagamento.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyPayload() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.payload);
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
        <h1>Pagamento pendente</h1>
        <div className="card qr-code-box">
          {/* qrCodeImage vem em base64 puro do backend */}
          <img src={`data:image/png;base64,${result.qrCodeImage}`} alt="QR Code Pix" className="qr-code-image" />
          <p className="form-hint">Escaneie no app do seu banco, ou copie o código abaixo:</p>
          <div className="copy-field">
            <input type="text" readOnly value={result.payload} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={handleCopyPayload}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="form-hint">Válido até {new Date(result.expirationDate).toLocaleString('pt-BR')}</p>
        </div>
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

        {submitError && <p className="error-text">{submitError}</p>}

        <button type="submit" disabled={!isFormValid || submitting}>
          {submitting ? 'Gerando cobrança Pix...' : 'Pagar com Pix'}
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
