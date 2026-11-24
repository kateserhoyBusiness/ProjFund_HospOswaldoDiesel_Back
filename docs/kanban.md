# Quadro Kanban de acompanhamento

## Situação

Este arquivo é um quadro Markdown inicial, não um quadro Trello/GitHub Projects.
O ambiente de trabalho não tem integração autenticada/CLI para criar um projeto
remoto, e nenhum link de quadro foi fornecido. O link externo deve ser inserido
no README quando o responsável o criar ou compartilhar.

## Colunas

### A fazer

- [ ] Criar quadro oficial no GitHub Projects ou Trello e adicionar a dupla.
- [ ] Publicar o OpenAPI JSON e registrar o URL público confirmado.
- [ ] Executar a migração/seed em ambiente de teste PostgreSQL e anexar evidência.
- [ ] Verificar backup, retenção, TLS e restrições de IP no provedor cloud.
- [ ] Definir com a dupla os responsáveis de cada cartão e revisar equilíbrio de
  contribuições reais.
- [ ] Preparar aceite e ensaio da demonstração com ambiente seguro.

### Em andamento

- [ ] Consolidar e revisar documentação técnica deste repositório.

### Revisão

- [ ] Revisão por outro integrante antes do merge.

### Concluído

- [x] Inventário da API, esquema e testes existentes.
- [x] Criar a relação usuário-setor, manter compatibilidade de `setor_id` e
  atualizar escopos do dashboard, perguntas e relatórios.
- [x] Aplicar mínimo de cinco respostas ao nome de equipe na exportação Excel.
- [x] Proteger TV Wall privado com autenticação e perfil administrativo.

## Regras de movimentação

Cada cartão deve ter responsável, critério verificável de conclusão e PR próprio
do integrante que realizou o trabalho. Mover para “Concluído” somente após
revisão/testes; não usar o quadro para atribuir contribuições retroativamente.
