# Plano de Negócios e Pitch — SGEP

**Instituição-alvo:** Fundação Hospitalar Doutor Oswaldo Diesel

## 1. Produto e Proposta de Valor

O **SGEP** é uma API voltada à gestão da experiência do paciente para a **Fundação Hospitalar Doutor Oswaldo Diesel**, estruturada para:

* **Organizar avaliações por setor hospitalar:** Coleta segmentada (pronto-atendimento, internação, recepção, ambulatório) para identificar gargalos assistenciais com precisão.
* **Consolidar manifestações em fluxo auditável:** Registro rastreável de elogios, sugestões e reclamações, apoiando a ouvidoria e a gestão da qualidade.
* **Proteger a privacidade e a LGPD:** Geração de indicadores agregados sem expor grupos pequenos, evitando a reidentificação de pacientes ou equipes em setores com baixo volume de respostas.

> *Nota de escopo: Esta proposta é um modelo de estudo baseado nas capacidades técnicas do back-end. Não constitui pesquisa de mercado, orçamento auditado, promessa de lucro ou validação comercial definitiva.*

---

## 2. Modelo Comercial e Alternativas

Como o projeto é direcionado especificamente à **Fundação Hospitalar Doutor Oswaldo Diesel**, a operação dedicada substitui a escala multi-hospitalar genérica:

* **SaaS Dedicado (Operação Hospedada):** Mensalidade fixa de **R$ 300/mês**, cobrindo hospedagem, manutenção contínua e disponibilidade da API para todos os setores da instituição.
* **Licenciamento On-Premise (Alternativa):** Implantação na infraestrutura interna da própria Fundação, caso a política institucional de TI exija retenção local dos dados, com licença anual e suporte técnico.
* **Serviços Adicionais (Escopo Sob Demanda):** Setup inicial, treinamento das equipes de ouvidoria/qualidade e integrações com sistemas hospitalares existentes (prontuário eletrônico ou ERP) precificados à parte conforme horas técnicas estimadas.

---

## 3. Simulação Financeira Específica (1 Instituição)

Hipóteses didáticas editáveis para a operação exclusiva da Fundação:

* **Preço médio (Receita recorrente mensal):** R$ 300,00 / mês
* **Custo variável mensal:** R$ 20,00 / mês
* **Custos fixos operacionais mensais:** R$ 80,00 / mês
* **Margem de contribuição:** $\text{R\$ } 300{,}00 - \text{R\$ } 20{,}00 = \text{R\$ } 280{,}00$ (**93,3%** sobre a receita)
* **Ponto de equilíbrio operacional:** $\lceil 80 / 280 \rceil = \lceil 0{,}29 \rceil =$ **1 instituição**

### Demonstrativo Projetado — Fundação Hospitalar Doutor Oswaldo Diesel

| Indicador Financeiro | Visão Mensal (1 Instituição) | Visão Anual (12 Meses) | Participação na Receita |
|---|---:|---:|---:|
| **Receita Recorrente Bruta** | R$ 300,00 | R$ 3.600,00 | 100,0% |
| **(-) Custos Variáveis** | R$ 20,00 | R$ 240,00 | 6,7% |
| **(=) Margem de Contribuição** | **R$ 280,00** | **R$ 3.360,00** | **93,3%** |
| **(-) Custos Fixos Operacionais** | R$ 80,00 | R$ 960,00 | 26,7% |
| **(=) Resultado Operacional** | **R$ 200,00** | **R$ 2.400,00** | **66,7%** |

> *Ressalva financeira: O cenário aponta resultado operacional positivo já na 1ª instituição ativa, mas não considera tributos, inadimplência, horas de implantação inicial, desenvolvimento evolutivo, suporte 24x7 ou despesas de capital.*

---

## 4. Riscos e Validações Necessárias

* **Adequação à LGPD e Contratos:** Validar requisitos jurídicos da Fundação, definindo papéis de Controlador e Operador de dados e regras para tratamento de manifestações sensíveis.
* **Nível de Serviço (SLA) e Suporte:** Compatibilizar a janela de atendimento (ex.: horário comercial), rotina de backups, monitoramento e segurança com a estrutura enxuta de custos fixos (R$ 80,00/mês).
* **Isolamento Arquitetural (`hospital_id`):** Manter o filtro rigoroso por identificador institucional nas consultas, permissões e relatórios, preservando a integridade dos dados caso novos módulos ou unidades sejam incorporados no futuro.
* **Continuidade e Portabilidade:** Definir plano de continuidade de negócios, formato de exportação integral da base (CSV/JSON) e fluxo de encerramento contratual.

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
