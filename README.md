# Cabe Tudo Monorepo

Monorepo para o projeto de dropshipping de organização de cozinha.

## Estrutura

- `backend/`: API Node.js com Supabase/PostgreSQL, validação de checkout, sync de fornecedores e healthcheck.
- `frontend/`: Next.js App Router para a vitrine, checkout e área de pedidos.

## Comandos

```bash
npm install
npm run dev:backend
npm run dev:frontend
npm run dev
```

## Observação

O diretório `backend/` contém o backend original. O frontend ainda precisa ser integrado ao backend via APIs e pagamentos Asaas.
