# Especificação de requisitos

## 1. Objetivo e escopo

Esta especificação descreve o comportamento exposto pelo back-end SGEP neste
repositório. É um inventário técnico derivado das rotas, dos esquemas e dos
testes existentes; não representa validação de briefing nem aceite de cliente.
O repositório contém a API, não a aplicação de telas.

## 2. Atores e limites

| Ator | Capacidades observadas |
|---|---|
| Pessoa respondente | Consulta setores e fluxos; cria uma pesquisa e responde com o token da pesquisa. |
| Super Admin | Gerencia setores, contas e perfis administrativos; consulta dados sem escopo por setor. |
| Admin de Setor / Gestão | Acessa operações administrativas e métricas nos setores atribuídos, conforme a permissão da rota. |
| Ouvidoria | Consulta e atualiza manifestações; algumas rotas agregadas/exportações não limitam por setor. |
| Visualizador | Consulta indicadores e exportações permitidos pelo perfil. |
| Integração/monitoramento | Usa rotas de saúde e jobs com autenticação quando aplicável. |

As permissões efetivas são carregadas do perfil persistido no servidor; não se
deve confiar em permissões fornecidas pelo cliente.

## 3. Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | A API deve listar setores ativos e fornecer o fluxo de perguntas de um setor. |
| RF-02 | A API deve criar pesquisas, registrar respostas, finalizar a pesquisa e aceitar dados opcionais de paciente/manifestação mediante o token de pesquisa. |
| RF-03 | A API deve autenticar contas, devolver o perfil e os setores atribuídos, e permitir consultar a sessão autenticada. |
| RF-04 | Somente perfis autorizados podem gerenciar contas, perguntas, equipes e setores; gestores podem operar nos setores atribuídos. |
| RF-05 | A API deve expor indicadores de pesquisa, setor, turno e equipe com filtros por data, turno e setor autorizado. |
| RF-06 | A exportação Excel deve respeitar as permissões e não revelar o nome de uma equipe com menos de cinco respostas no conjunto filtrado. A exportação PDF permanece indisponível (501). |
| RF-07 | A API deve disponibilizar manifestações à Ouvidoria e permitir atualizar status e parecer interno. |
| RF-08 | O TV Wall deve ocultar métricas abaixo do mínimo de cinco respostas. Se estiver privado, exige autenticação e perfil Super Admin ou Admin de Setor. |
| RF-09 | A API deve fornecer métricas administrativas de abandono e retenção a usuários com a permissão correspondente. |
| RF-10 | A API deve expor health check e o documento OpenAPI JSON. |

## 4. Requisitos não funcionais (referência ISO/IEC 25010)

| Característica | Requisito/critério |
|---|---|
| Segurança | Autenticação JWT, autorização por perfil/setor, validação Zod, consultas parametrizadas, cabeçalhos Helmet, rate limit e segredos fora do repositório. |
| Confiabilidade | Respostas de erro explícitas; persistência relacional com PK/FK/constraints; transação na gravação conjunta de conta e setores. |
| Eficiência de desempenho | Indicadores são agregados no banco e existem índices para campos de pesquisa/relacionamento. Metas de latência e carga ainda precisam ser definidas e medidas. |
| Manutenibilidade | Módulos de domínio separados, SQL versionado em migrações e testes Vitest/Supertest. |
| Compatibilidade | API HTTP/JSON, documentação OpenAPI e execução em Node.js 20. |
| Portabilidade | Configuração por variáveis de ambiente; PostgreSQL remoto ou modo em memória para desenvolvimento/testes sem conexão configurada. |
| Privacidade | Dados de paciente são opcionais, informação de contato depende de consentimento, e nomes de equipes em grupos pequenos são suprimidos. |
| Usabilidade/acessibilidade | Dependem do consumidor de front-end; não são implementadas nem verificadas neste repositório de back-end. |

Os critérios mensuráveis de disponibilidade, latência, volume de usuários,
retenção de logs e RPO/RTO não foram fornecidos; não são declarados como
garantidos por esta versão.

## 5. Matriz de rastreabilidade

“Tela” identifica o fluxo consumidor em nível conceitual. Nenhuma tela é mantida
neste repositório.

| Requisito | Tela/fluxo consumidor (fora do repositório) | Rota da API | Tabelas/coleções | Teste de referência |
|---|---|---|---|---|
| RF-01 | Seleção de setor e navegação da pesquisa | `GET /api/setores`, `GET /api/setores/:slug`, `GET /api/setores/:slug/fluxo`, `GET /api/setores/:slug/perguntas/:n` | `sector`, `care_route`, `question`, `answer_option` | `src/modules/experience/experience.spec.js` |
| RF-02 | Pesquisa pública, resposta, conclusão e manifestação | `POST /api/pesquisas`, `PUT /api/pesquisas/:id/respostas/:perguntaId`, `POST /api/pesquisas/:id/finalizar`, `POST /api/pesquisas/:id/paciente`, `POST /api/pesquisas/:id/manifestacoes` | `survey`, `answer`, `patient`, `feedback` | `src/modules/experience/experience.spec.js`, `src/modules/experience/api.spec.js` |
| RF-03 | Login e sessão | `POST /api/auth/login`, `GET /api/auth/me` | `user_account`, `user_role`, `user_sector` | `src/modules/auth/auth.spec.js`, `src/modules/admin/admin.users.spec.js` |
| RF-04 | Administração de contas, perguntas, setores e equipes | `GET/POST/PATCH /api/admin/usuarios`, `GET /api/admin/perfis`, `/api/admin/perguntas`, `/api/admin/setores`, `/api/admin/equipes` | `user_account`, `user_role`, `user_sector`, `sector`, `question`, `answer_option`, `care_team` | `src/modules/admin/admin.users.spec.js`, `src/modules/experience/api.spec.js`, `src/modules/dashboard/frontend-compat.spec.js` |
| RF-05 | Painel gerencial | `GET /api/dashboard/resumo`, `/api/dashboard/pesquisas`, `/api/dashboard/setores`, `/api/dashboard/setores/:id/turnos`, `/api/dashboard/equipes`, `/api/dashboard/em-andamento` | `survey`, `sector`, `care_team`, `feedback` | `src/modules/dashboard/frontend-compat.spec.js`, `src/modules/experience/api.spec.js` |
| RF-06 | Exportação de relatórios | `GET /api/reports/excel`, `GET /api/reports/pdf` | `survey`, `sector`, `care_team`, `report_export` | `src/modules/experience/api.spec.js`, `src/modules/dashboard/frontend-compat.spec.js` |
| RF-07 | Caixa de entrada da Ouvidoria | `GET /api/manifestacoes`, `GET /api/manifestacoes/:id`, `PATCH /api/manifestacoes/:id` | `feedback`, `survey`, `answer`, `sector` | `src/modules/dashboard/frontend-compat.spec.js` |
| RF-08 | Exibição TV Wall | `GET /api/tvwall` | `survey`, `sector`, `feedback`, configuração `TV_WALL_PRIVATE` | `src/modules/experience/api.spec.js` |
| RF-09 | Monitoramento administrativo | `GET /api/jobs/abandono`, `GET /api/jobs/retencao` | `survey`, `hospital_setting` | `src/modules/jobs/jobs.spec.js` |
| RF-10 | Verificação e documentação da integração | `GET /health`, `GET /docs` | Não aplicável / OpenAPI embutido | Verificação de integração em `src/modules/*/*.spec.js` |

## 6. Pendências de validação

- Validar com as partes interessadas os atores, prioridades e critérios de aceite.
- Definir metas de desempenho, disponibilidade, recuperação e retenção.
- Confirmar quais perfis devem acessar cada relatório em produção.
- Confirmar o domínio público definitivo da API e publicar o link OpenAPI no README.
