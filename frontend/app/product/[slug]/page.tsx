'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchProductBySlug, type Product } from '@/lib/api';

export default function ProductPage({ params }: { params: { slug: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProduct() {
      try {
        const data = await fetchProductBySlug(params.slug);
        if (!data) {
          setError('Produto não encontrado.');
        } else {
          setProduct(data);
          setError(null);
        }
      } catch (err) {
        setError('Erro ao carregar produto.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadProduct();
  }, [params.slug]);

  if (loading) {
    return (
      <main className="page">
        <p>Carregando produto...</p>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="page">
        <div style={{ color: 'red' }}>{error || 'Produto não encontrado.'}</div>
        <Link href="/" className="btn-back">← Voltar para produtos</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <Link href="/" className="btn-back">← Voltar para produtos</Link>
      <div className="image-placeholder image-placeholder--standalone">Foto do produto</div>
      <h1>{product.name}</h1>
      <p className="price">
        R$ {(product.sale_price_cents / 100).toFixed(2).replace('.', ',')}
      </p>
      <p>
        <strong>Fornecedor:</strong> {product.supplier_name}
      </p>
      <p>
        <strong>Prazo médio de entrega:</strong> {product.avg_shipping_days} dias
      </p>
      <Link href={`/checkout?product=${product.slug}`} className="btn">Ir para checkout</Link>
    </main>
  );
}
