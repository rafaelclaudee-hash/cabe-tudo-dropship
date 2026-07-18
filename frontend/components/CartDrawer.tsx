'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart-context';
import { fetchProducts, type Product } from '@/lib/api';

function formatCentsToBRL(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity } = useCart();
  const router = useRouter();
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  // Busca o catálogo inteiro quando o carrinho abre — é só 14 produtos,
  // mais simples que buscar um por um, e garante preço/disponibilidade
  // sempre atuais (nunca confia em preço guardado no localStorage).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    fetchProducts()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeCart();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  const enrichedItems = items
    .map((item) => {
      const product = catalog.find((p) => p.slug === item.slug);
      return product ? { ...item, product } : null;
    })
    .filter((item): item is { slug: string; quantity: number; product: Product } => item !== null);

  // Item no carrinho apontando pra um slug que sumiu do catálogo
  // (descontinuado/ocultado depois de adicionado) — não trava o
  // carrinho, só avisa e ignora esse item no total.
  const missingCount = items.length - enrichedItems.length;

  const totalCents = enrichedItems.reduce((sum, item) => sum + item.product.sale_price_cents * item.quantity, 0);

  function handleCheckout() {
    closeCart();
    router.push('/checkout');
  }

  return (
    <div className="cart-drawer-overlay" onClick={closeCart}>
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-drawer__header">
          <h2>Seu carrinho</h2>
          <button type="button" className="cart-drawer__close" onClick={closeCart} aria-label="Fechar carrinho">
            ✕
          </button>
        </div>

        {loading && enrichedItems.length === 0 && <p>Carregando...</p>}

        {!loading && items.length === 0 && (
          <div className="cart-drawer__empty">
            <p>Seu carrinho está vazio.</p>
            <Link href="/" className="btn" onClick={closeCart}>
              Ver produtos
            </Link>
          </div>
        )}

        {enrichedItems.length > 0 && (
          <>
            {missingCount > 0 && (
              <p className="error-text">
                {missingCount} item(ns) do carrinho não está(ão) mais disponível(is) e foi(ram) removido(s) do total.
              </p>
            )}

            <ul className="cart-drawer__items">
              {enrichedItems.map(({ slug, quantity, product }) => (
                <li key={slug} className="cart-item">
                  <div className="cart-item__media">
                    {product.photos && product.photos.length > 0 ? (
                      <Image src={product.photos[0]} alt={product.name} fill sizes="64px" className="cart-item__image" />
                    ) : (
                      <div className="image-placeholder">Foto</div>
                    )}
                  </div>
                  <div className="cart-item__body">
                    <span className="cart-item__name">{product.name}</span>
                    <span className="price">{formatCentsToBRL(product.sale_price_cents)}</span>
                    <div className="cart-item__controls">
                      <div className="quantity-stepper">
                        <button
                          type="button"
                          onClick={() => updateQuantity(slug, quantity - 1)}
                          aria-label={`Diminuir quantidade de ${product.name}`}
                        >
                          −
                        </button>
                        <span>{quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(slug, quantity + 1)}
                          aria-label={`Aumentar quantidade de ${product.name}`}
                        >
                          +
                        </button>
                      </div>
                      <button type="button" className="cart-item__remove" onClick={() => removeItem(slug)}>
                        Remover
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="cart-drawer__footer">
              <div className="cart-drawer__total">
                <span>Total</span>
                <span className="price">{formatCentsToBRL(totalCents)}</span>
              </div>
              <button type="button" className="btn" onClick={handleCheckout}>
                Finalizar compra
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
