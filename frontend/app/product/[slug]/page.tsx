'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchProductBySlug, type Product } from '@/lib/api';
import { useCart } from '@/lib/cart-context';

export default function ProductPage({ params }: { params: { slug: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

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

  const photos = product.photos && product.photos.length > 0 ? product.photos : [];
  const whatsappMessage = encodeURIComponent(`Olá! Tenho interesse no produto: ${product.name}`);

  function handleAddToCart() {
    if (!product) return;
    addItem(product.slug);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <main className="page">
      <Link href="/" className="btn-back">← Voltar para produtos</Link>

      {photos.length > 0 ? (
        <div className="gallery">
          <div className="gallery__main">
            <Image
              src={photos[activePhoto]}
              alt={product.name}
              fill
              sizes="(max-width: 700px) 100vw, 600px"
              className="gallery__main-img"
              priority
            />
          </div>
          {photos.length > 1 && (
            <div className="gallery__thumbs">
              {photos.map((photo, index) => (
                <button
                  key={photo}
                  type="button"
                  className={`gallery__thumb${index === activePhoto ? ' gallery__thumb--active' : ''}`}
                  onClick={() => setActivePhoto(index)}
                  aria-label={`Ver foto ${index + 1} de ${product.name}`}
                >
                  <Image src={photo} alt="" fill sizes="80px" className="gallery__thumb-img" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="image-placeholder image-placeholder--standalone">Foto do produto</div>
      )}

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
      {!product.available && <p className="soon-notice">Em breve disponível para compra.</p>}
      {product.description && (
        <p className="product-description">{product.description}</p>
      )}
      <div className="product-cta-group">
        {product.available ? (
          <>
            <Link href={`/checkout?product=${product.slug}`} className="btn">Ir para checkout</Link>
            <button type="button" className="btn btn--secondary" onClick={handleAddToCart}>
              {added ? 'Adicionado!' : 'Adicionar ao carrinho'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--disabled" disabled>
            Em breve
          </button>
        )}
        <a
          href={`https://wa.me/5553984750216?text=${whatsappMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--whatsapp"
        >
          Falar no WhatsApp
        </a>
      </div>
    </main>
  );
}
