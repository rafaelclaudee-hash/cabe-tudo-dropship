'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { fetchProducts, type Product } from '@/lib/api';
import PromoBanner from '@/components/PromoBanner';

// Ordem fixa do grid: destaques primeiro, depois Alpha ativos, depois
// C7Drop "Em breve" — aplicada tanto na home completa quanto nos
// filtros de categoria, pra manter os destaques sempre visíveis primeiro.
const PRODUCT_ORDER = [
  'cestos-empilhaveis',
  'fruteira-2-andares',
  'suporte-shampoo-sabonete',
  'kit-tabuas-coloridas',
  'escovao-eletrico',
  'escorredor-suspenso',
  'escorredor-loucas-cromado',
  'suporte-papel-higienico',
  'kit-3-organizadores',
  'kit-5-potes-hermeticos',
  'suporte-utensilios-cozinha',
  'porta-tempero-magnetico',
  'lixeira-retratil',
  'dispenser-sabonete-liquido',
];

const CATEGORY_LABELS: Record<string, string> = {
  cozinha: 'Cozinha',
  banheiro: 'Banheiro',
  organizacao: 'Organização',
};

function HomeContent() {
  const searchParams = useSearchParams();
  const categoria = searchParams.get('categoria');
  const categoryLabel = categoria ? CATEGORY_LABELS[categoria] : null;

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

  const sortedProducts = [...products].sort(
    (a, b) => PRODUCT_ORDER.indexOf(a.slug) - PRODUCT_ORDER.indexOf(b.slug)
  );

  const visibleProducts = categoryLabel
    ? sortedProducts.filter((product) => product.category === categoria)
    : sortedProducts;

  return (
    <main className="page">
      <PromoBanner
        imagem="/banners/kit-5-potes.png"
        selo="FRETE GRÁTIS"
        titulo="Kit de 5 Potes"
        precoDe="R$ 149,90"
        precoPor="R$ 104,90"
        sufixoPreco="à vista"
        textoBotao="COMPRAR"
        link="/product/kit-5-potes-hermeticos"
      />

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
        <h2>{categoryLabel ? `Produtos · ${categoryLabel}` : 'Produtos'}</h2>
        {categoryLabel && <Link href="/" className="btn-back">← Ver todos os produtos</Link>}
        {loading && <p>Carregando produtos...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && visibleProducts.length === 0 && <p>Nenhum produto disponível.</p>}
        {!loading && visibleProducts.length > 0 && (
          <div className="grid">
            {visibleProducts.map((product) =>
              product.available ? (
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
              ) : (
                <div key={product.slug} className="card card--product card--soon">
                  <div className="card__image">
                    <span className="card__soon-tag">Em breve</span>
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
                    <button type="button" className="btn btn--disabled" disabled>
                      Em breve
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <p>Carregando...</p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
