import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cabe Tudo',
  description: 'Dropshipping de organização de cozinha'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <Link href="/" className="site-header__brand">
              <span className="site-header__logo">Cabe Tudo</span>
              <span className="site-header__tagline">
                Chega de abrir o armário e não achar nada 😤
              </span>
            </Link>
            <nav className="site-header__nav">
              <Link href="/">Início</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
