'use client';

import { useCart } from '@/lib/cart-context';

export default function CartIcon() {
  const { totalItemCount, openCart } = useCart();

  return (
    <button type="button" className="cart-icon" onClick={openCart} aria-label="Abrir carrinho">
      🛒
      {totalItemCount > 0 && <span className="cart-icon__badge">{totalItemCount}</span>}
    </button>
  );
}
