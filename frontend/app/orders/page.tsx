'use client';

import { useState } from 'react';
import { fetchOrdersByEmail, type Order } from '@/lib/api';

export default function OrdersPage() {
  const [email, setEmail] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const data = await fetchOrdersByEmail(email);
      setOrders(data);
      setMessage(data.length ? '' : 'Nenhum pedido encontrado.');
    } catch (error) {
      setMessage('Erro ao buscar pedidos. Tente novamente.');
      console.error(error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <h1>Meus pedidos</h1>
      <form onSubmit={handleSearch} className="form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar pedidos'}
        </button>
      </form>

      {message && <p>{message}</p>}
      {orders.length > 0 && (
        <ul className="orders-list">
          {orders.map((order) => (
            <li key={order.id} className="order-card">
              <div className="order-card__header">
                <span>Pedido {order.id}</span>
                <span className="badge">{order.status}</span>
              </div>
              <small className="order-card__meta">
                Total: R$ {(order.total_cents / 100).toFixed(2).replace('.', ',')} - Data:{' '}
                {new Date(order.created_at).toLocaleDateString('pt-BR')}
              </small>
              <ul className="order-items">
                {order.items.map((item, index) => (
                  <li key={`${order.id}-${item.product_name}-${index}`}>
                    {item.product_name} x{item.quantity} - R${' '}
                    {(item.unit_price_cents / 100).toFixed(2).replace('.', ',')}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
