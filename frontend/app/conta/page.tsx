'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchOrdersByEmail, type Order } from '@/lib/api';

export default function AccountPage() {
  const { customer, loading, logout } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // Histórico de pedidos por email — mesmo endpoint da página /orders
  // (busca sem login). Pedidos não têm customer_id ligado a
  // customer_accounts hoje, então a ligação é só por email; pedidos
  // antigos feitos com outro email (ou sem conta) não aparecem aqui.
  useEffect(() => {
    if (!customer) {
      setOrdersLoading(false);
      return;
    }
    let cancelled = false;
    setOrdersLoading(true);
    fetchOrdersByEmail(customer.email)
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setOrdersError('Erro ao buscar pedidos.');
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  if (loading) {
    return (
      <main className="page">
        <p>Carregando...</p>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="page">
        <h1>Minha conta</h1>
        <p>Você precisa entrar para ver essa página.</p>
        <Link href="/conta/entrar" className="btn">Entrar</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Minha conta</h1>

      <div className="card account-summary">
        <div className="card__body">
          <div className="account-summary__row">
            <span>Nome</span>
            <strong>{customer.name}</strong>
          </div>
          <div className="account-summary__row">
            <span>Email</span>
            <strong>{customer.email}</strong>
          </div>
        </div>
      </div>

      <button type="button" className="btn btn--secondary" onClick={() => logout()}>
        Sair
      </button>

      <h2 style={{ marginTop: 32 }}>Meus pedidos</h2>

      {ordersLoading && <p>Carregando pedidos...</p>}
      {ordersError && <p className="error-text">{ordersError}</p>}
      {!ordersLoading && !ordersError && orders.length === 0 && <p>Nenhum pedido encontrado.</p>}

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
