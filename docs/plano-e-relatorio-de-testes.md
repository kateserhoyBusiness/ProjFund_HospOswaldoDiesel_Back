# Plano e relatório de testes

## Estratégia

| Nível | Ferramenta/escopo | Exemplos |
|---|---|---|
| Unitário | Vitest | `src/core/metrics.spec.js`: cálculo de métricas. |
| Integração HTTP | Vitest + Supertest | Login, rotas públicas/protegidas, permissões, fluxo de pesquisa e respostas. |
| Integração de módulos | Supertest em memória | Administração, dashboard, Excel, TV Wall, Ouvidoria e jobs. |
| PostgreSQL | Migração/consulta real | Requer instância PostgreSQL configurada; não se considera coberto por testes em memória. |
| Aceite funcional | Roteiro manual de API | Executar fluxo de pesquisa e fluxos administrativos num ambiente de demonstração após deploy. |

## Executar

```bash
npm test
npm test -- --coverage
git diff --check
```

O setup do Vitest limpa as variáveis de conexão antes de importar a aplicação,
portanto `npm test` usa o modo em memória e não tenta acessar o banco indicado
no `.env` local. Testes PostgreSQL devem ser executados como etapa separada,
contra uma base descartável de teste, nunca contra produção.

## Evidências e estado

| Verificação | Estado registrado |
|---|---|
| Vitest/Supertest | `npm test`: 7 arquivos aprovados, 27 testes aprovados (24/11/2026). |
| Cobertura | Configuração V8/text/html presente em `vitest.config.js`; percentual não foi medido para este relatório. |
| `git diff --check` | Aprovado nesta revisão; executar novamente antes do PR. |
| Testes PostgreSQL/migrações | Dependem de ambiente de teste configurado; não inferir sucesso a partir do modo em memória. |
| Teste funcional com cliente | Pendente de ambiente e aceite; esta etapa não foi solicitada nesta atividade. |

## Casos que devem permanecer cobertos

- Credenciais válidas/inválidas, rota protegida e perfil não autorizado.
- Criação/edição de usuário com um ou vários setores; login devolve `setor_ids`.
- Gestor vê dados dos setores atribuídos e recebe 403 fora do escopo.
- Fluxo de pesquisa exige token para escrita e respeita regras de perguntas.
- Excel omite nome de equipe abaixo de cinco respostas e o libera no limiar.
- TV Wall privado nega anônimo e perfil sem permissão; público só quando
  `TV_WALL_PRIVATE=false`.
- Health, jobs, erros de validação e regressões das rotas existentes.

## Falhas e correções

Manter no PR um resumo da falha reproduzida, causa e teste de regressão. Não
declarar cobertura de banco, browser ou aceite do cliente sem executar essa
verificação. Este documento é um plano; os resultados devem ser atualizados a
cada release.
