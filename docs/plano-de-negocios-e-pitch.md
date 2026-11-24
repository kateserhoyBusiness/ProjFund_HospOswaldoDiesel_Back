# Plano de negócios e pitch 

## Produto e proposta de valor

O SGEP é uma API para registrar experiência do paciente, organizar perguntas
por setor, receber manifestações e gerar indicadores para gestão hospitalar.
O valor potencial é consolidar feedback em um fluxo auditável e oferecer
indicadores agregados sem expor grupos pequenos.

Esta proposta é um modelo de estudo baseado nas capacidades do back-end. Não é
pesquisa de mercado, orçamento, promessa de lucro ou validação com cliente.

## Segmento e alternativas comerciais

- Clientes potenciais: hospitais, clínicas e redes com vários setores.
- SaaS: mensalidade por unidade/porte, suporte e operação hospedada.
- Licenciamento: implantação em infraestrutura do cliente, licença anual e
  serviços de suporte/atualização.
- Receita adicional possível: implantação, treinamento, integrações e suporte
  premium; precificação depende de entrevistas e análise de concorrência.

## Simulação financeira ilustrativa

Hipóteses didáticas editáveis — não são cotações:

- preço médio: **R$ 1.500 por instituição/mês**;
- custo variável: **R$ 300 por instituição/mês**;
- custos fixos operacionais: **R$ 12.000/mês**;
- resultado antes de impostos, investimento inicial e despesas financeiras.

Margem de contribuição por instituição = R$ 1.500 − R$ 300 = R$ 1.200.
Ponto de equilíbrio operacional = `ceil(12.000 / 1.200)` = **10 instituições**.

| Instituições ativas | Receita recorrente mensal | Custos variáveis | Custos fixos | Resultado operacional hipotético |
|---:|---:|---:|---:|---:|
| 6 | R$ 9.000 | R$ 1.800 | R$ 12.000 | −R$ 4.800 |
| 10 | R$ 15.000 | R$ 3.000 | R$ 12.000 | R$ 0 |
| 15 | R$ 22.500 | R$ 4.500 | R$ 12.000 | R$ 6.000 |
| 24 | R$ 36.000 | R$ 7.200 | R$ 12.000 | R$ 16.800 |

O cenário sugere que o lucro operacional pode surgir após o ponto de equilíbrio,
mas não considera tributos, inadimplência, aquisição de clientes, implantação,
desenvolvimento, compliance, suporte 24x7 ou despesas de capital. Substituir
todos os valores por cotações e entrevistas antes de usar em decisão comercial.

## Riscos e validações necessárias

- Validar disposição de pagamento, ciclo de compra hospitalar e requisitos de
  LGPD/contratos.
- Orçar suporte, monitoramento, backups, segurança e certificações aplicáveis.
- Para SaaS multi-instituição, completar isolamento por `hospital_id` em todas as
  consultas, permissões e relatórios. O modelo atual tem hospital como entidade,
  mas não comprova isolamento multi-tenant completo.
- Definir plano de continuidade, portabilidade/exportação e processo de
  encerramento contratual.

## Pitch sugerido (5–7 minutos)

1. Problema a validar: feedback disperso e dificuldade de acompanhar a jornada.
2. Solução: pesquisas por setor, NPS, manifestações e indicadores agregados.
3. Demonstração: criar uma pesquisa, enviar resposta, consultar dashboard e
   exportar relatório; mostrar como grupos abaixo de cinco são protegidos.
4. Arquitetura: API modular Express, PostgreSQL relacional, JWT e OpenAPI.
5. Segurança: autenticação/autorização no servidor, TLS e proteção de dados.
6. Modelo comercial: SaaS/licenciamento e simulação financeira explicitamente
   hipotética.
7. Pedido de validação: piloto, métricas de sucesso, preço e próximos passos.

Não afirmar resultados, clientes, economia, lucro ou conformidade que ainda não
tenham evidência.
