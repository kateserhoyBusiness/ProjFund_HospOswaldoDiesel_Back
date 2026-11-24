# Segurança e nuvem

## Controles implementados

- JWT Bearer com duração limitada; `requireAuth` recarrega o usuário e suas
  permissões do banco, em vez de autorizar apenas por claims enviados.
- Hash de senha via bcrypt; endpoints de conta não devolvem `senha_hash`.
- Permissões por perfil e escopo por setores atribuídos.
- Zod valida payloads/filtros; SQL usa parâmetros PostgreSQL.
- Helmet, CORS explícito por `CORS_ORIGIN`, rate limit e limite de JSON de 1 MB.
- Token individual de pesquisa protege operações de escrita do fluxo público.
- Excel oculta o nome da equipe quando o grupo filtrado tem menos de cinco
  respostas; TV Wall suprime métricas abaixo desse mínimo. TV Wall é privado por
  padrão e só fica público com `TV_WALL_PRIVATE=false`.
- `.gitignore` ignora `.env`/`.env.*` e permite `.env.example`.

## Segredos e configuração

`/.env.example` contém placeholders e valores locais, nunca credenciais reais.
O `.env` local não deve ser commitado. Em Render, guardar segredos na seção
Environment do serviço backend; nunca em `VITE_*`, README, issue ou log.

| Variável | Uso |
|---|---|
| `DATABASE_URL` ou `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` | Conexão PostgreSQL; configurar somente um formato. |
| `DB_SSL` | TLS do banco; ligado por padrão. |
| `DB_SSL_REJECT_UNAUTHORIZED` | Verificação do certificado TLS; deixar `true` em produção sempre que possível. |
| `JWT_SECRET` | Segredo aleatório forte, mínimo 32 caracteres; rotacionar invalida sessões existentes. |
| `CORS_ORIGIN` | Origens exatas do consumidor web, sem barra final. |
| `NODE_ENV` | Usar `production` no serviço publicado. |
| `TV_WALL_PRIVATE` | `true` por padrão; `false` torna `/api/tvwall` público. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Somente para o comando de seed; evitar manter credenciais de seed quando não necessárias. |
| `PORT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | Porta (Render fornece `PORT`) e limites HTTP. |

## Banco e implantação

O README descreve Render como hospedagem da API e Supabase PostgreSQL/Session
Pooler como banco. O repositório não comprova o estado atual do deploy, backups,
alertas nem regras de rede; confirmar no painel de cada provedor.

- Executar migrações e seed em banco de teste antes da produção.
- Usar usuário de banco com privilégio mínimo compatível com migrações e runtime;
  idealmente separar credenciais de migração e de execução.
- Habilitar TLS e validação de certificado; não desativar validação para
  contornar erro sem entender a cadeia de certificados.
- Restringir IP de origem do banco ao tráfego da aplicação quando o plano e a
  topologia oferecerem IPs de saída estáveis; não declarar essa restrição como
  ativa sem verificá-la no provedor.
- Configurar backups/retention, monitoramento, rotação de segredo e plano de
  restauração; RPO/RTO ainda precisam ser acordados.

## Row Level Security

O DDL habilita RLS em `survey`, `sector` e `feedback`, mas a política explícita
presente é leitura pública de setores ativos; políticas de leitura/escrita de
pesquisa e leitura privada de feedback são removidas no script. Portanto, não
tratar RLS como substituto da autorização da API. Confirmar que a credencial do
backend tem o comportamento esperado e que nenhum acesso público direto ao
banco está habilitado.

## Limitações e checklist de operação

- `/docs` entrega o documento OpenAPI JSON; não há UI Swagger hospedada pelo
  código.
- Não há restrição de IP implementada no código; é configuração do provedor.
- Não registrar tokens, senhas, nomes/contatos de pacientes ou URLs de conexão.
- Testar `/health`, autenticação, permissão e exportação após cada deploy.
- Revisar política LGPD de consentimento, retenção, acesso e descarte com o
  responsável institucional; não inferir conformidade apenas do código.
