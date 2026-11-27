# SGEP - Back-end

API do Sistema de Gestão da Experiência do Paciente (SGEP), hospedada no Render
e integrada a um banco PostgreSQL no Supabase.

## Serviços publicados

| Serviço | Ambiente |
| --- | --- |
| API | `https://projfund-hosposwaldodiesel-back.onrender.com` |
| Front-end | `https://projeto-hospital-pqxh.onrender.com` |
| Documentação OpenAPI | `https://projfund-hosposwaldodiesel-back.onrender.com/docs` |
| Health check | `https://projfund-hosposwaldodiesel-back.onrender.com/health` |

As URLs devem ser confirmadas no painel do Render caso o projeto seja criado
novamente ou vinculado a outro workspace.

## Arquitetura

- Node.js 20+, JavaScript ES modules e Express.
- PostgreSQL/Supabase via `pg`.
- Zod para validação de entradas.
- JWT para autenticação administrativa.
- Helmet, CORS e limite de requisições.
- Vitest e Supertest para testes.
- OpenAPI disponível em `/docs`.

Estrutura principal:

```text
src/
  app.js                 Rotas, middleware e health check
  server.js              Inicialização e validações de produção
  openapi.js             Documento OpenAPI
  config/                Configuração e banco
  runtime/               Ambiente e conexões
  modules/               Domínios da API
database/
  migrations/            Migrações versionadas
  schema.sql             Estrutura completa
  seed.sql               Dados de referência
docs/                    Documentação funcional e técnica
```

## Configuração no Render

Crie um **Web Service** usando o repositório do back-end:

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Branch: a branch que contém a versão publicada

Configure estas variáveis no ambiente do serviço:

| Variável | Valor de produção |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | fornecida automaticamente pelo Render |
| `DATABASE_URL` | URL de conexão PostgreSQL/Supabase |
| `JWT_SECRET` | segredo aleatório com pelo menos 32 caracteres |
| `CORS_ORIGIN` | `https://projeto-hospital-pqxh.onrender.com` |
| `DB_SSL` | `true` |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` |
| `TV_WALL_PRIVATE` | `true` |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `RATE_LIMIT_MAX` | `120` |

`DATABASE_URL` é o formato recomendado para o Render. Alternativamente, configure
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`, mas não misture os
dois formatos. Não use `*` como `CORS_ORIGIN` em produção.

Para criar ou atualizar o usuário administrador inicial no banco:

```text
SEED_ADMIN_EMAIL=<e-mail-do-administrador>
SEED_ADMIN_PASSWORD=<senha-forte>
```

Execute as migrações e o seed pelo Shell do Render ou por outro ambiente seguro
conectado ao mesmo banco:

```bash
npm run migrate
npm run seed
```

Não execute o seed contra dados reais sem revisar
`src/scripts/run-seed.js` e `database/seed.sql`. Não coloque senhas reais no
repositório ou em arquivos `.env`.

## Desenvolvimento local opcional

A execução local serve apenas para desenvolvimento e testes:

```bash
npm install
npm run dev
```

Endpoints locais:

- API: `http://localhost:3000`
- OpenAPI: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`

Copie `.env.example` para `.env` e configure o banco ou deixe
`DATABASE_URL` vazio para usar o armazenamento em memória. O modo em memória não
é persistente e não deve ser usado na publicação.

## Testes

```bash
npm test
```

Os testes cobrem autenticação, administração, setores, pesquisas, dashboard,
TV Wall e compatibilidade de contratos.

## Banco de dados

```bash
npm run migrate
npm run seed
```

O banco não é criado automaticamente no primeiro deploy. O responsável pelo
deploy deve executar as migrações uma vez e após novas versões de banco.

`database/migrations/` contém as alterações versionadas aplicadas pela rotina
`npm run migrate`. Para diagnóstico em produção, use o health check; ele informa
se o banco está conectado.

## Segurança

- Nunca reutilize o `JWT_SECRET` de demonstração.
- Configure CORS com a origem HTTPS exata do front-end.
- Use HTTPS e mantenha TLS rejeitando certificados não autorizados.
- Mantenha `TV_WALL_PRIVATE=true`, exceto quando a TV Wall tiver sido
  deliberadamente publicada como recurso público.
- Use credenciais fortes e controle de acesso por perfil.
- Dados pessoais e manifestações devem seguir a política de privacidade aprovada
  pelo hospital.

## API

A OpenAPI hospedada em `/docs` contém os parâmetros e respostas dos endpoints.
Principais grupos:

- `/api/auth/*`: login e autenticação.
- `/api/setores/*` e `/api/pesquisas/*`: pesquisa pública.
- `/api/manifestacoes/*`: Ouvidoria.
- `/api/dashboard/*`: indicadores e consultas.
- `/api/admin/*`: setores e perguntas.
- `/api/tvwall`: indicadores agregados.
- `/api/reports/*`: relatórios e exportação.

Rotas protegidas usam `Authorization: Bearer <JWT>`. Respostas de pesquisa
particularmente protegidas usam `x-survey-token`.

## Front-end integrado

O front-end publicado deve enviar requisições para:

```text
VITE_API_URL=https://projfund-hosposwaldodiesel-back.onrender.com
```

Caso a URL do front-end mude no Render, atualize o `CORS_ORIGIN` do back-end e faça
um novo deploy do serviço. CORS diferencia HTTPS, domínio e barra final.

## Publicação

Após alterar o código:

1. Execute `npm test`.
2. Envie o commit para a branch configurada no Render.
3. Confirme o build e o health check.
4. Execute migrações pendentes pelo Shell, se houver.
5. Valide `/docs`, login, pesquisa, dashboard e TV Wall no ambiente publicado.

## Documentação do projeto

- [Requisitos](docs/requisitos.md)
- [Arquitetura](docs/arquitetura-backend.md)
- [Modelo de dados](docs/modelo-de-dados-e-requisitos.md)
- [Padrões de banco](docs/padroes-banco-de-dados.md)
- [Segurança e nuvem](docs/seguranca-e-nuvem.md)
- [Plano e relatório de testes](docs/plano-e-relatorio-de-testes.md)
- [Roteiro de aceite](docs/aceite-e-apresentacao.md)
