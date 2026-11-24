# Aceite e apresentação

## Roteiro de demonstração do back-end

1. Abrir `/health` e confirmar estado do banco no ambiente de demonstração.
2. Abrir `/docs` e apresentar operações/contratos OpenAPI JSON.
3. Autenticar usuário de demonstração e verificar `/api/auth/me`.
4. Criar uma conta de Gestão com dois setores e demonstrar `setor_ids` na
   resposta/login.
5. Consultar dashboard e perguntas em setores autorizados e confirmar 403 ao
   tentar setor não atribuído.
6. Criar respostas de teste; demonstrar exportação Excel com nome da equipe
   oculto abaixo de cinco e liberado a partir do mínimo.
7. Com TV Wall privado, demonstrar 401 sem token, 403 para perfil não
   administrativo e acesso para perfil administrativo.
8. Não usar dados pessoais reais; usar dataset de demonstração descartável.

## Critérios de aceite propostos

- Migrações e seed executados sem erro em ambiente de demonstração.
- Rotas essenciais respondem conforme OpenAPI e testes automatizados.
- Perfis e escopos de setores negam acesso indevido.
- Exportação Excel e TV Wall respeitam o limite de privacidade.
- Responsável do cliente confirma resultado, pendências e data.

## Registro do aceite

| Campo | Registro |
|---|---|
| Cliente/responsável | Pendente |
| Ambiente e versão demonstrados | Pendente |
| Data | Pendente |
| Critérios aprovados | Pendente |
| Pendências e prazo | Pendente |
| Aprovação formal | Pendente |

O aceite não foi realizado nesta atividade. UX, telas e demo visual pertencem ao
front-end e estão fora do escopo deste repositório.
