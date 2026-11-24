# Mapeamento de módulos e consultas

## Acesso a dados

O projeto não possui classes Repository/DAO. O acesso é feito por funções
exportadas de `src/runtime/database.js`: `query(text, values)`,
`withTransaction(operation)` e `databaseConfigured`. Os módulos de domínio
montam SQL parametrizado e mapeiam os resultados para respostas HTTP. Para
novos domínios, avaliar extrair consultas reutilizadas sem criar uma camada
abstrata sem necessidade.

| Módulo/funções | Operação e consulta principal | Tabelas |
|---|---|---|
| `auth.js`: login / `requireAuth` | Busca conta ativa e perfil; carrega setores atribuídos; compara hash bcrypt; assina/verifica JWT. | `user_account`, `user_role`, `user_sector` |
| `admin.js`: contas | Lista contas sem hash; cria/atualiza conta e sincroniza setores em transação; valida setor ativo e perfil atribuível. | `user_account`, `user_role`, `user_sector`, `sector` |
| `admin.js`: perguntas/opções | Lista pergunta com `json_agg` de opções; insere/altera pergunta e opções. | `question`, `answer_option`, `sector` |
| `admin.js`: equipes | Lista equipe e contagem de profissionais; insere equipe do setor permitido. | `care_team`, `staff_shift`, `sector` |
| `experience.js`: fluxo | Busca setor ativo, perguntas gerais/setoriais e opções ordenadas. | `sector`, `question`, `answer_option`, `care_route` |
| `experience.js`: pesquisa | Cria pesquisa, seleciona equipe do setor/turno/data, grava respostas e paciente, finaliza ou grava manifestação. | `survey`, `care_team`, `answer`, `patient`, `feedback` |
| `dashboard.js`: resumo/pesquisas | Agregações `COUNT`, `AVG`, `ARRAY_AGG`, filtros por setor/data/turno; anonimiza equipe abaixo do mínimo. | `survey`, `sector`, `care_team`, `feedback` |
| `report.js`: Excel | Busca linhas da pesquisa com setor/equipe e filtro de escopo; registra exportação. | `survey`, `sector`, `care_team`, `report_export` |
| `feedback.js` | Lista manifestações; busca pesquisa/respostas; atualiza status/parecer. | `feedback`, `survey`, `answer`, `sector` |
| `tvwall.js` | Agregações globais e setoriais com supressão abaixo do mínimo. | `survey`, `sector`, `feedback` |
| `jobs.js` | Calcula abandono e retenção com configurações do hospital. | `survey`, `hospital_setting`, `sector` |

## Regras de consulta

- Valores fornecidos pelo cliente são parâmetros (`$1`, `$2`, etc.); não
  concatenar valores de filtros em SQL.
- Fragmentos interpolados devem ser constantes definidos pelo servidor, nunca
  entrada arbitrária.
- Contas e setores devem ser gravados atomicamente quando há mais de uma tabela
  envolvida.
- Filtros de escopo devem aplicar-se em todas as consultas e agregações, não
  apenas ao filtro visual enviado pelo cliente.
- Manter consultas de relatório alinhadas às regras de privacidade do dashboard.
- Revisar `EXPLAIN (ANALYZE, BUFFERS)` em ambiente não produtivo para consultas
  lentas; não executar análise com dados reais sem autorização.

## Observação de arquitetura

As funções de domínio são os pontos de entrada; `query` é o adaptador de
persistência. Não há ORM nem unit of work geral. A API também oferece modo em
memória, então alterações de comportamento devem cobrir a ramificação SQL e a
ramificação em memória sempre que ambas existirem.
