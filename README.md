# SGEP Backend

Backend do Sistema de Gestão da Experiência do Paciente para a Fundação Hospitalar Dr. Oswaldo Diesel.

## Stack

- Node.js 20
- JavaScript
- Express
- PostgreSQL + Supabase
- Zod
- Vitest + Supertest

## Scripts

- `npm install`
- `npm run dev`
- `npm test`
- `npm run migrate`
- `npm run seed`

## Configuração

Copy `.env.example` to `.env`. For local development, `CORS_ORIGIN` must include
the frontend origin (`http://localhost:5173`). The frontend can use its Vite
development proxy, so browser requests are same-origin.

The backend uses PostgreSQL through `pg`. Configure either `DATABASE_URL` or all of
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`; do not set both
connection formats. For Supabase on Render, use the Supabase Session Pooler
connection details. TLS is enabled by default; set `DB_SSL=false` only for a
trusted local PostgreSQL instance. TLS certificate verification is enabled by
default; `DB_SSL_REJECT_UNAUTHORIZED=false` disables certificate verification
while keeping the connection encrypted. Use this only when necessary for a
trusted Supabase endpoint; prefer configuring the provider's CA certificate
where available, especially in production.

Also configure `JWT_SECRET` with a random value of at least 32 characters and
`CORS_ORIGIN` with the exact frontend origin (or comma-separated origins, without
trailing slashes). Render provides `PORT` automatically. Production refuses to
start without a database connection, a strong JWT secret, and an explicit CORS
origin; wildcard CORS is only for local development.

For in-memory local development, run `npm install` and `npm run dev`. The seeded
development accounts are `super@fundacao.com` / `super123` and
`ouvidoria@fundacao.com` / `ouvidoria123`. Do not use these credentials in
production.

After configuring the database variables, apply the schema and starter data once:

1. Run `npm run migrate`.
2. Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, then run `npm run seed` to
   create or update the initial super-admin account. The password is stored as a
   bcrypt hash. These two seed variables are only needed when running the seed.

The migration and seed scripts connect to the configured PostgreSQL database and
execute the SQL files in `database/`. The seed creates reference data and starter
survey questions; it does not create a default account unless the seed credentials
are provided.

## Estrutura

- `src/modules` — módulos de domínio
- `src/shared` — utilitários comuns
- `src/config` — configuração e conexão
- `database` — migrations e seed SQL

## Observações

A aplicação foi projetada para funcionar com Postgres em produção e com fallback em memória para execução local e testes quando a conexão ao banco não está disponível.

## Endpoints principais

- `GET /api/setores`
- `GET /api/setores/:slug/fluxo`
- `POST /api/pesquisas`
- `PUT /api/pesquisas/:id/respostas/:perguntaId`
- `POST /api/pesquisas/:id/finalizar`
- `POST /api/pesquisas/:id/manifestacoes`
- `POST /api/auth/login` and `GET /api/auth/me`
- `GET /api/admin/perguntas`, `POST/PATCH /api/admin/perguntas`
- `POST /api/admin/setores`
- `GET /api/dashboard/resumo`
- `GET /api/dashboard/pesquisas`
- `GET /api/manifestacoes` and `PATCH /api/manifestacoes/:id`
- `GET /api/tvwall`
- `GET /docs`

Survey responses and feedback require the per-survey `x-survey-token`; staff
endpoints use `Authorization: Bearer <JWT>`. The frontend adapter translates
these Portuguese API payloads to its UI models.
