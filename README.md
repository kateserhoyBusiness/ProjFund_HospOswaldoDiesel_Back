# SGEP — Back-end

API do Sistema de Gestão da Experiência do Paciente. Este repositório contém
somente o back-end; não implementa telas nem substitui o briefing/aceite do
cliente.

## Stack e estrutura

- Node.js 20, JavaScript ES modules, Express e Zod.
- PostgreSQL via `pg`; modelo e scripts em `database/`.
- Vitest + Supertest.
- `src/modules/`: domínios da API; `src/core/`: regras e modo em memória;
  `src/runtime/`: configuração, conexão e erros.

O diretório `database/` está na raiz porque a raiz deste repositório já é o
back-end; não há uma pasta `/backend` aninhada.

## Instalação e execução

```bash
npm install
npm run dev
npm test
```

O servidor local usa `PORT` (padrão 3000). Sem configuração de conexão ele usa o
store em memória para desenvolvimento/testes. Para PostgreSQL:

1. Copie `.env.example` para `.env` local e preencha valores de desenvolvimento.
2. Configure **ou** `DATABASE_URL` **ou** todos os campos `DB_*`; não configure
   os dois formatos ao mesmo tempo.
3. Execute `npm run migrate` e, se necessário, `npm run seed`.
4. Configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` somente ao executar o
   seed para criar/atualizar a conta administrativa inicial.

O `.env` é ignorado pelo Git. `.env.example` contém apenas placeholders e valores
locais, nunca credenciais reais.

## Variáveis importantes

- `NODE_ENV=production` no serviço publicado.
- `JWT_SECRET`: segredo aleatório forte, com pelo menos 32 caracteres.
- `CORS_ORIGIN`: origem HTTPS exata do consumidor web, sem barra final.
- `DATABASE_URL` ou variáveis `DB_*`; TLS ligado por padrão.
- `TV_WALL_PRIVATE=true`: TV Wall exige JWT e perfil Super Admin/Admin de Setor.
  Só definir `false` se o endpoint realmente puder ser público.
- Render fornece `PORT`.

Para produção, mantenha `DB_SSL_REJECT_UNAUTHORIZED=true` sempre que possível.
Consulte [segurança e nuvem](docs/seguranca-e-nuvem.md) antes de publicar.

## Documentação do projeto

- [Requisitos e matriz de rastreabilidade](docs/requisitos.md)
- [Arquitetura do back-end](docs/arquitetura-backend.md)
- [Padrões de Git e PR](docs/padroes-git.md)
- [Plano e relatório de testes](docs/plano-e-relatorio-de-testes.md)
- [Modelo de dados e justificativa SQL](docs/modelo-de-dados-e-requisitos.md)
- [Padrões de banco de dados](docs/padroes-banco-de-dados.md)
- [Mapeamento de módulos e consultas](docs/mapeamento-classes-e-consultas.md)
- [Segurança e nuvem](docs/seguranca-e-nuvem.md)
- [Kanban local e pendências do quadro externo](docs/kanban.md)
- [Plano de negócios e pitch (hipóteses)](docs/plano-de-negocios-e-pitch.md)
- [Roteiro de aceite e apresentação](docs/aceite-e-apresentacao.md)

**Kanban Trello/GitHub Projects:** link externo pendente de criação/compartilhamento.
Até lá, o acompanhamento está no [quadro Markdown](docs/kanban.md).

## API e OpenAPI

- OpenAPI JSON local: [http://localhost:3000/docs](http://localhost:3000/docs)
- Health check: [http://localhost:3000/health](http://localhost:3000/health)
- URL pública da API e link publicado do OpenAPI: pendentes de confirmação do
  domínio do serviço Render. `/docs` serve JSON OpenAPI; não há Swagger UI
  interativa embutida.

A maioria das rotas responde JSON; `/api/reports/excel` baixa uma planilha.
Respostas, dados de paciente e manifestações de pesquisa exigem
`x-survey-token`; rotas administrativas exigem `Authorization: Bearer <JWT>`.
Consulte `/docs` para parâmetros e respostas completos.

## Banco e deploy

`npm run migrate` aplica os arquivos ordenados de `database/migrations/`;
`database/schema.sql` descreve o esquema e `database/seed.sql` carrega dados de
referência. O README documenta Render + Supabase, mas a URL pública, o estado do
deploy, backups e restrições de rede precisam ser confirmados no painel cloud.
