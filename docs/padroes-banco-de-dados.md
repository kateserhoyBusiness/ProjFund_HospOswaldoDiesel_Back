# Padrões de banco de dados

## Convenções existentes

O esquema já usa nomes singulares em snake_case, com nomes de tabela em inglês
(`survey`, `sector`, `user_account`) e algumas colunas em português
(`setor_id`, `pesquisa_id`, `criado_em`). Essa mistura é histórica e faz parte
do contrato atual; não renomear tabelas/colunas em uma tarefa isolada.

## Padrões para novas alterações

- Tabelas e colunas: `snake_case`, singular, sem espaços/acentos.
- PK: `id SERIAL PRIMARY KEY` para tabelas simples; PK composta para tabelas de
  associação como `user_sector`.
- FK: nome semântico `<entidade>_id`, sempre declarar `REFERENCES` e política
  `ON DELETE` deliberada.
- Booleanos: `BOOLEAN NOT NULL DEFAULT ...` quando estado obrigatório.
- Datas: `DATE` para dia civil; `TIMESTAMPTZ` para instantes.
- JSONB: somente para atributos flexíveis/configuração, não para substituir
  relações que exigem integridade ou filtragem.
- Estados/valores finitos: `CHECK` no banco e validação correspondente na API.
- Unicidade: `UNIQUE`/índice único para chaves naturais e combinações de negócio.
- Índices: `idx_<tabela>_<colunas>`; criar a partir de filtros/joins observados,
  verificando seletividade e custo de escrita.
- Constraints nomeadas: `<tabela>_<regra>_ck` para checks; registrar objetivo e
  cobrir nos testes.
- Migrações: `NNN_nome_curto.sql`, idempotentes quando possível, com backfill
  explícito, compatibilidade temporária e revisão de lock/tempo de execução.
- Seed: dados de referência sem segredos, reexecutáveis com `ON CONFLICT`.

## Padrões já usados

O esquema contém constraints como `question_flow_ck` e `answer_content_ck`,
índices em pesquisa/data/status e chaves de unicidade em opções/escalas. Os
nomes de alguns índices atuais não seguem integralmente o padrão acima; manter
os nomes existentes ao alterá-los para evitar duplicação, e aplicar o padrão em
novos índices.

## Revisão de migração

Antes do merge, revisar:

1. efeito em banco existente e em instalação nova;
2. preservação/backfill de dados;
3. FKs, índices e estratégia de rollback;
4. impacto de locks e volume;
5. compatibilidade da versão anterior da API;
6. execução em PostgreSQL de teste (o modo em memória não valida SQL).
