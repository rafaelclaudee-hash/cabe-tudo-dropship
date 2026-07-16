'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
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
      <section className="hero">
        <div className="hero__media">
          <Image
            src="/hero.png"
            alt="Família organizando a cozinha com produtos Cabe Tudo"
            fill
            priority
            quality={85}
            sizes="(max-width: 700px) 100vw, 60vw"
            className="hero__image"
          />
        </div>
        <div className="hero__content">
          <span className="hero__kicker">Para cada canto da casa</span>
          <h1 className="hero__title">
            Cabe tudo.
            <br />
            Sobra espaço.
          </h1>
          <p className="hero__subtitle">
            Utilidades e organizadores que aproveitam cada canto da sua casa.
          </p>
          <div className="hero__cta-group">
            <a href="#produtos" className="hero__cta">Ver produtos</a>
            <a href="#" className="hero__cta-secondary">Como funciona →</a>
          </div>
        </div>
      </section>

      <section>
        <h2>Cabe Tudo</h2>
        <p>Organize sua cozinha com soluções práticas e o melhor do dropshipping.</p>
      </section>

      <section id="produtos">
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
                className={`card card--product${product.featured ? ' card--featured' : ''}`}
              >
                <div className="card__image">
                  {product.featured && <span className="card__featured-tag">Destaque</span>}
                  {product.photos && product.photos.length > 0 ? (
                    <Image
                      src={product.photos[0]}
                      alt={product.name}
                      fill
                      sizes="(max-width: 700px) 100vw, 25vw"
                      className="card__image-img"
                    />
                  ) : (
                    <div className="image-placeholder">Foto do produto</div>
                  )}
                </div>
                <div className="card__body">
                  <h3>{product.name}</h3>
                  <span className="price">
                    R$ {(product.sale_price_cents / 100).toFixed(2).replace('.', ',')}
                  </span>
                  <div className="card__footer">
                    <small>de {product.supplier_name}</small>
                    <span className="badge badge--outline">Frete grátis</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
