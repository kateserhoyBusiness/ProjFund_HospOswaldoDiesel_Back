# Padrões de Git e colaboração

## Branches

- `main`: branch de integração/entrega; recomenda-se protegê-la contra push
  direto.
- `feat/<assunto-curto>`: funcionalidade.
- `fix/<assunto-curto>`: correção.
- `docs/<assunto-curto>`: documentação.
- `test/<assunto-curto>`: testes.
- `chore/<assunto-curto>`: manutenção e ferramentas.

Criar branches a partir da `main` atualizada. Não desenvolver diretamente na
branch protegida, nem reescrever histórico compartilhado sem acordo da dupla.

## Conventional Commits

Formato: `<tipo>(<escopo>): <resumo no imperativo>`.

Tipos recomendados: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`,
`ci`, `chore`, `revert`.

Exemplos:

```text
feat(auth): aceitar múltiplos setores por usuário
fix(report): ocultar equipe em grupos pequenos
docs(api): documentar filtros do dashboard
test(tvwall): validar acesso de perfil administrativo
```

Commits devem ser pequenos, relacionados e escritos pelo integrante que
realizou o trabalho. Não criar commits em nome do colega, dividir artificialmente
um commit ou alterar autoria para simular equilíbrio.

## Pull Requests e revisão

1. Cada integrante abre seus próprios PRs a partir da própria branch.
2. O PR descreve problema, solução, impactos, migração e evidências de teste.
3. O outro integrante revisa escopo, autorização, dados pessoais, erros,
   compatibilidade e documentação.
4. CI/testes e revisão precisam passar antes do merge.
5. Resolver comentários e registrar a decisão; merge pela política do
   repositório.

## Contribuição individual

Como a avaliação considera a contribuição de cada integrante, cada pessoa deve
registrar trabalho real por commits e PRs próprios. A distribuição deve ser
acordada e revisada pelo grupo; este documento não declara uma divisão nem
atribui trabalho sem evidência.

## Checklist antes do PR

- [ ] Escopo restrito à tarefa e sem `.env`, chaves ou credenciais.
- [ ] Testes pertinentes executados e resultado informado.
- [ ] Migrações e documentação atualizadas quando aplicável.
- [ ] `git diff --check` sem erros.
- [ ] Nenhum dado pessoal real em fixtures, logs ou exemplos.
