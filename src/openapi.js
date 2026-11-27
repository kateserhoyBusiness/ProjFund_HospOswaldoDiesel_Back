import { env } from './runtime/env.js';

export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'SGEP API',
    version: '1.0.0',
    description: 'Sistema de Gestão da Experiência do Paciente da Fundação Hospitalar Dr. Oswaldo Diesel',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      surveyTokenAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-survey-token',
      },
    },
    schemas: {
      Setor: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          slug: { type: 'string' },
          url: { type: 'string' },
          qrcode: { type: 'string' },
          ativo: { type: 'boolean' },
        },
      },
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          email: { type: 'string' },
          perfil_id: { type: 'integer' },
          perfil: { type: 'string' },
          perfil_nome: { type: 'string' },
          setor_id: { type: ['integer', 'null'] },
          setor_ids: { type: 'array', items: { type: 'integer' } },
          ativo: { type: 'boolean' },
          permissoes: { type: 'array', items: { type: 'string' } },
        },
      },
      AdminUsuarioCreate: {
        type: 'object',
        required: ['nome', 'email', 'senha', 'perfil_id'],
        properties: {
          nome: { type: 'string', minLength: 2, maxLength: 120 },
          email: { type: 'string', format: 'email' },
          senha: { type: 'string', minLength: 8, maxLength: 72 },
          perfil_id: { type: 'integer', description: 'ID de um perfil atribuível retornado por GET /admin/perfis.' },
          setor_id: { type: ['integer', 'null'], description: 'Compatibilidade; use setor_ids para múltiplos setores.' },
          setor_ids: { type: 'array', items: { type: 'integer' }, description: 'Obrigatório com ao menos um setor para perfis Gestão e Admin de Setor.' },
        },
        additionalProperties: false,
      },
      AdminUsuarioUpdate: {
        type: 'object',
        minProperties: 1,
        properties: {
          nome: { type: 'string', minLength: 2, maxLength: 120 },
          email: { type: 'string', format: 'email' },
          senha: { type: 'string', minLength: 8, maxLength: 72 },
          perfil_id: { type: 'integer', description: 'ID de um perfil atribuível retornado por GET /admin/perfis.' },
          setor_id: { type: ['integer', 'null'] },
          setor_ids: { type: 'array', items: { type: 'integer' } },
          ativo: { type: 'boolean', description: 'Use false para desativar a conta.' },
        },
        additionalProperties: false,
      },
      AuthLoginRequest: {
        type: 'object',
        required: ['email', 'senha'],
        properties: {
          email: { type: 'string', format: 'email' },
          senha: { type: 'string', minLength: 4 },
        },
      },
      AuthLoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          usuario: { $ref: '#/components/schemas/Usuario' },
        },
      },
      PesquisaCriada: {
        type: 'object',
        properties: {
          pesquisa_id: { type: 'integer' },
          token: { type: 'string' },
          setor: { type: 'string' },
        },
      },
      RespostaRequest: {
        type: 'object',
        properties: {
          valor: { type: 'integer', minimum: 0, maximum: 10 },
          texto: { type: 'string' },
          opcao_id: { type: 'integer' },
          pergunta_id: { type: 'integer' },
        },
      },
      Manifestacao: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          pesquisa_id: { type: 'integer' },
          tipo: { type: 'string', enum: ['elogio', 'reclamacao', 'sugestao'] },
          descricao: { type: 'string' },
          status: { type: 'string' },
          data: { type: 'string', format: 'date-time' },
          anonimo: { type: 'boolean' },
          origem: { type: 'string' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        summary: 'Login do usuário',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AuthLoginRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Login realizado com sucesso', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthLoginResponse' } } } },
          '400': { description: 'Dados inválidos' },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Retorna o usuário autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Usuário autenticado', content: { 'application/json': { schema: { type: 'object', properties: { usuario: { $ref: '#/components/schemas/Usuario' } } } } } },
          '401': { description: 'Token ausente ou inválido' },
        },
      },
    },
    '/setores': {
      get: {
        summary: 'Lista setores ativos',
        security: [],
        responses: {
          '200': { description: 'Lista de setores', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Setor' } } } } },
        },
      },
    },
    '/setores/{slug}': {
      get: {
        summary: 'Detalha um setor',
        security: [],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Setor encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Setor' } } } },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/setores/{slug}/fluxo': {
      get: {
        summary: 'Retorna o fluxo da pesquisa por setor',
        security: [],
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Fluxo retornado com sucesso' },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/setores/{slug}/perguntas/{n}': {
      get: {
        summary: 'Busca uma pergunta específica do fluxo',
        security: [],
        parameters: [
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'n', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Pergunta retornada' },
          '404': { description: 'Pergunta não encontrada' },
        },
      },
    },
    '/pesquisas': {
      post: {
        summary: 'Cria uma pesquisa para um setor',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['setor_id'],
                properties: {
                  setor_id: { type: 'integer' },
                  anonimo: { type: 'boolean' },
                  consentimento: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Pesquisa criada com sucesso', content: { 'application/json': { schema: { $ref: '#/components/schemas/PesquisaCriada' } } } },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/pesquisas/{id}/respostas/{perguntaId}': {
      put: {
        summary: 'Salva ou atualiza a resposta de uma pergunta',
        security: [{ surveyTokenAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'perguntaId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RespostaRequest' } } },
        },
        responses: {
          '200': { description: 'Resposta salva com sucesso' },
          '404': { description: 'Pesquisa ou pergunta não encontrada' },
          '400': { description: 'Dados inválidos' },
        },
      },
    },
    '/pesquisas/{id}/finalizar': {
      post: {
        summary: 'Finaliza a pesquisa e decide destino',
        security: [{ surveyTokenAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Pesquisa finalizada', content: { 'application/json': { schema: { type: 'object', properties: { destino: { type: 'string' }, motivo: { type: 'string' } } } } } },
          '404': { description: 'Pesquisa não encontrada' },
          '422': { description: 'NPS obrigatório antes de finalizar' },
        },
      },
    },
    '/pesquisas/{id}/paciente': {
      post: {
        summary: 'Registra dados do paciente com consentimento',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '201': { description: 'Paciente registrado' },
          '400': { description: 'Consentimento inválido ou payload inválido' },
        },
      },
    },
    '/pesquisas/{id}/manifestacoes': {
      post: {
        summary: 'Cria uma manifestação a partir da pesquisa',
        security: [{ surveyTokenAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '201': { description: 'Manifestação criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Manifestacao' } } } },
        },
      },
    },
    '/manifestacoes': {
      get: {
        summary: 'Lista manifestações',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de manifestações', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Manifestacao' } } } } },
        },
      },
    },
    '/manifestacoes/{id}': {
      get: {
        summary: 'Detalha uma manifestação',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Manifestação detalhada' },
          '404': { description: 'Manifestação não encontrada' },
        },
      },
      patch: {
        summary: 'Atualiza status ou parecer de uma manifestação',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Manifestação atualizada' },
          '404': { description: 'Manifestação não encontrada' },
        },
      },
    },
    '/dashboard/resumo': {
      get: {
        summary: 'Resumo geral do dashboard',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Resumo do dashboard' },
        },
      },
      '/dashboard/pesquisas': {
        get: {
          summary: 'Lista pesquisas resumidas, sem dados identificáveis',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Registros resumidos e limitados ao escopo do perfil' },
            '403': { description: 'Perfil sem permissão para consultar pesquisas' },
          },
        },
      },
    },
    '/dashboard/setores': {
      get: {
        summary: 'Resumo por setor',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Dados resumidos por setor' },
        },
      },
    },
    '/dashboard/setores/{id}/turnos': {
      get: {
        summary: 'Resumo por turno de um setor',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Dados por turno' },
        },
      },
    },
    '/dashboard/em-andamento': {
      get: {
        summary: 'Pesquisas em andamento',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de pesquisas em andamento' },
        },
      },
    },
    '/tvwall': {
      get: {
        summary: 'Dados agregados para TV Wall',
        security: env.tvWallPrivate ? [{ bearerAuth: [] }] : [],
        responses: {
          '200': { description: 'Dados agregados da experiência do paciente' },
        },
      },
    },
    '/jobs/abandono': {
      get: {
        summary: 'Monitora pesquisas em abandono',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Métricas de abandono' },
        },
      },
    },
    '/jobs/retencao': {
      get: {
        summary: 'Calcula indicador de retenção',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Métricas de retenção' },
        },
      },
    },
    '/exportacoes/excel': {
      get: {
        summary: 'Exporta dados em Excel',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Exportação concluída' },
        },
      },
    },
    '/exportacoes/pdf': {
      get: {
        summary: 'Exporta dados em PDF',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Exportação concluída' },
        },
      },
    },
    '/admin/setores': {
      get: {
        summary: 'Lista setores administrativos',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de setores' },
        },
      },
      post: {
        summary: 'Cria setor administrativo',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Setor criado' },
        },
      },
    },
    '/admin/setores/{id}': {
      patch: {
        summary: 'Atualiza os dados ou o status de um setor',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Setor atualizado' },
          '404': { description: 'Setor não encontrado' },
        },
      },
      delete: {
        summary: 'Desativa um setor',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Setor desativado' },
          '404': { description: 'Setor não encontrado' },
        },
      },
    },
    '/admin/equipes': {
      get: {
        summary: 'Lista equipes cadastradas nos setores autorizados',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de equipes' },
        },
      },
      post: {
        summary: 'Cadastra uma equipe fixa por setor ou uma escala temporária',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['setor_id', 'nome'],
                properties: {
                  setor_id: { type: 'integer' },
                  nome: { type: 'string' },
                  permanente: { type: 'boolean', default: false },
                  data: { type: 'string', format: 'date', nullable: true },
                  turno: { type: 'string', enum: ['manha', 'tarde', 'noite'], nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Equipe cadastrada' },
          '409': { description: 'Já existe equipe fixa para o setor' },
        },
      },
    },
    '/admin/equipes/{id}': {
      delete: {
        summary: 'Arquiva uma equipe fixa e preserva as pesquisas históricas',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Equipe arquivada' },
          '403': { description: 'Setor fora do perfil de acesso' },
          '404': { description: 'Equipe fixa não encontrada' },
        },
      },
    },
    '/admin/perfis': {
      get: {
        summary: 'Lista perfis atribuíveis a contas (sem o perfil administrador)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Lista de perfis atribuíveis',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      nome: { type: 'string' },
                      perfil: { type: 'string' },
                      permissoes: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
          '403': { description: 'Somente administradores podem listar perfis atribuíveis' },
        },
      },
    },
    '/admin/usuarios': {
      get: {
        summary: 'Lista usuários do sistema',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Lista de contas sem hashes de senha', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Usuario' } } } } },
          '401': { description: 'Token ausente ou inválido' },
          '403': { description: 'Somente administradores podem listar contas' },
        },
      },
      post: {
        summary: 'Cria uma conta com senha armazenada em hash',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUsuarioCreate' } } },
        },
        responses: {
          '201': { description: 'Conta criada sem retornar hash de senha', content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } } },
          '400': { description: 'Dados, perfil ou setor inválidos' },
          '401': { description: 'Token ausente ou inválido' },
          '403': { description: 'Somente administradores podem criar contas' },
          '409': { description: 'E-mail já cadastrado' },
        },
      },
    },
    '/admin/usuarios/{id}': {
      patch: {
        summary: 'Edita perfil/setores e dados da conta ou a desativa',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUsuarioUpdate' } } },
        },
        responses: {
          '200': { description: 'Conta atualizada sem retornar hash de senha', content: { 'application/json': { schema: { $ref: '#/components/schemas/Usuario' } } } },
          '400': { description: 'Dados, perfil ou setor inválidos' },
          '401': { description: 'Token ausente ou inválido' },
          '403': { description: 'Somente administradores podem editar contas' },
          '404': { description: 'Conta não encontrada' },
          '409': { description: 'E-mail já cadastrado' },
        },
      },
    },
  },
};
