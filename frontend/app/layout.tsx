import './globals.css';
import type { Metadata } from 'next';
import { Fraunces, Work_Sans } from 'next/font/google';
import Link from 'next/link';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-fraunces',
});

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-work-sans',
});

export const metadata: Metadata = {
  title: 'Cabe Tudo',
  description: 'Dropshipping de organização de cozinha'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${workSans.variable}`}>
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

        <div className="trust-bar">
          <div className="trust-bar__inner">
            <span>Frete grátis</span>
            <span>Pagamento seguro via Pix</span>
            <span>Entrega para todo o Brasil</span>
          </div>
        </div>

        {children}

        <footer className="site-footer">
          <div className="site-footer__inner">
            <div>
              <div className="site-footer__brand">Cabe Tudo</div>
              <p className="site-footer__tagline">
                Organização inteligente pra cada cantinho da sua casa.
              </p>
            </div>

            <div>
              <h4>Produtos</h4>
              <ul>
                <li><Link href="/">Cozinha</Link></li>
                <li><Link href="/">Banheiro</Link></li>
                <li><Link href="/">Organização</Link></li>
              </ul>
            </div>

            <div>
              <h4>Atendimento</h4>
              <ul>
                <li><a href="https://wa.me/5553984750216">WhatsApp</a></li>
                <li><a href="#">Perguntas frequentes</a></li>
                <li><Link href="/rastrear">Rastrear pedido</Link></li>
              </ul>
            </div>

            <div>
              <h4>Pagamento</h4>
              <ul>
                <li>Pix</li>
                <li>Compra segura</li>
              </ul>
            </div>
          </div>

          <div className="site-footer__bottom">
            <div className="site-footer__bottom-inner">
              <span>© 2026 Cabe Tudo</span>
              <span>Cabe Tudo · Curitiba/PR</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
