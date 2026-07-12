'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchProducts, type Product } from '@/lib/api';

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await fetchProducts();
        setProducts(data);
        setError(null);
      } catch (err) {
        setError('Erro ao carregar produtos. Tente novamente.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  return (
    <main className="page">
      <section>
        <h1>Cabe Tudo</h1>
        <p>Organize sua cozinha com soluções práticas e o melhor do dropshipping.</p>
      </section>

      <section>
        <h2>Produtos</h2>
        {loading && <p>Carregando produtos...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && products.length === 0 && <p>Nenhum produto disponível.</p>}
        {!loading && products.length > 0 && (
          <div className="grid">
            {products.map((product) => (
              <Link
                key={product.slug}
                href={`/product/${product.slug}`}
                className="card"
              >
                <h3>{product.name}</h3>
                <span className="price">
                  R$ {(product.sale_price_cents / 100).toFixed(2).replace('.', ',')}
                </span>
                <small>de {product.supplier_name}</small>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>Minha conta</h2>
        <p>Veja seus pedidos por email e finalize a compra com pagamento seguro.</p>
      </section>
    </main>
  );
}
