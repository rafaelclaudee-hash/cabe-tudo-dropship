# Cabe Tudo – E-commerce de dropshipping

Loja virtual de produtos de organização para cozinha e casa, com catálogo, carrinho, contas de clientes, checkout com PIX, rastreamento de pedidos e repasse de compras aos fornecedores.

Projeto full stack em monorepo: **API em Node.js/Express** com PostgreSQL e **vitrine em Next.js** com TypeScript.

---

## Funcionalidades

- **Catálogo e vitrine:** páginas de produto, carrossel de banners e carrinho lateral
- **Contas de clientes:** cadastro, login, logout e histórico de pedidos
- **Checkout com PIX:** integração com o gateway de pagamento Asaas e confirmação por webhook
- **Fornecedores:** sincronização de produtos e fila de compras pendentes para repasse
- **Pós-venda:** rastreamento de pedidos por código e páginas de políticas (privacidade, trocas, termos)
- **Marketing:** newsletter e rastreamento de origem das vendas (UTM)

## Segurança

Decisões tomadas no backend para proteger clientes e pagamentos:

| Risco | Medida aplicada |
|---|---|
| Vazamento de senhas | Senhas armazenadas apenas como hash **bcrypt** |
| Roubo de sessão por XSS | Sessão em **JWT dentro de cookie**, com flag `secure` em produção |
| Webhook de pagamento falsificado | Webhook do Asaas exige **token próprio**, comparado em **tempo constante** (evita ataque de temporização) |
| Acesso indevido à área administrativa | Rotas `/admin/*` protegidas por token, também com comparação em tempo constante |
| SQL injection | Consultas **parametrizadas** (`$1`, `$2`) no driver `pg` |
| Dados sensíveis em logs | Logger **pino** com mascaramento de senha, chave de API, cabeçalho de autorização e dados de cartão |
| Credenciais no repositório | Segredos somente em variáveis de ambiente; `.env` e pasta de segredos locais no `.gitignore` |

**Melhorias mapeadas:** senha mínima maior que 6 caracteres, sessão com duração menor que 30 dias e troca do token estático do admin por login com usuário identificado.

## Arquitetura

```
cabe-tudo-dropship/
├── backend/            API Express (monolito modular)
│   ├── migrations/     17 migrations SQL versionadas
│   ├── scripts/        migração e testes dos fluxos de pagamento e fornecedor
│   └── src/modules/    orders · payments · suppliers · tracking
└── frontend/           Next.js 14 (App Router) + TypeScript
    ├── app/            páginas e rotas de API
    ├── components/     carrinho, carrossel, newsletter, captura de UTM
    └── lib/            contexto de autenticação, carrinho e cliente da API
```

## Tecnologias

**Backend:** Node.js, Express, PostgreSQL (`pg`), bcryptjs, jsonwebtoken, cookie-parser, pino, dotenv
**Frontend:** Next.js 14, React 18, TypeScript
**Integrações:** Asaas (PIX), UTMify, Meta Pixel

## Como rodar localmente

Pré-requisitos: Node.js 18+ e um banco PostgreSQL.

```bash
# 1. Instalar as dependências do monorepo
npm install

# 2. Criar o arquivo de ambiente e preencher as variáveis
cp backend/.env.example backend/.env

# 3. Criar as tabelas no banco
npm --workspace backend run migrate

# 4. Subir backend e frontend juntos
npm run dev
```

O frontend sobe em `http://localhost:3001`. As variáveis necessárias (banco, JWT, token de admin e credenciais dos gateways) estão documentadas em `backend/.env.example`.

## Autor

**Rafael Leal** – estudante de Engenharia de Software na Universidade Positivo
[LinkedIn](https://www.linkedin.com/in/rafael-leal-8704b0339) · [GitHub](https://github.com/rafaelclaudee-hash)
