CREATE TABLE IF NOT EXISTS hospital (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE NOT NULL,
  endereco TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sector (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  url VARCHAR(255),
  qrcode TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS care_route (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES sector(id) ON DELETE CASCADE,
  caminho VARCHAR(255) NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS question (
  id SERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
  setor_id INTEGER NULL REFERENCES sector(id) ON DELETE CASCADE,
  rota_id INTEGER NULL REFERENCES care_route(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('nps', 'rostinho', 'texto', 'multipla')),
  geral BOOLEAN NOT NULL DEFAULT FALSE,
  ordem INTEGER NOT NULL DEFAULT 1,
  obrigatoria BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT question_flow_ck CHECK (
    (geral = TRUE AND setor_id IS NULL AND tipo = 'nps' AND obrigatoria = TRUE)
    OR (geral = FALSE AND setor_id IS NOT NULL AND obrigatoria = FALSE)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS question_active_general_uidx
  ON question (hospital_id)
  WHERE geral = TRUE AND ativo = TRUE;

CREATE TABLE IF NOT EXISTS answer_option (
  id SERIAL PRIMARY KEY,
  pergunta_id INTEGER NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  valor SMALLINT NOT NULL CHECK (valor BETWEEN 1 AND 5),
  rotulo VARCHAR(120) NOT NULL,
  emoji VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS patient (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120),
  nome_mae VARCHAR(120),
  data_nascimento DATE,
  telefone VARCHAR(30) CHECK (telefone IS NULL OR LENGTH(BTRIM(telefone)) BETWEEN 8 AND 30),
  consentimento BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES sector(id) ON DELETE CASCADE,
  paciente_id INTEGER NULL REFERENCES patient(id) ON DELETE SET NULL,
  data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  turno VARCHAR(10) NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  anonimo BOOLEAN NOT NULL DEFAULT FALSE,
  consentimento BOOLEAN NOT NULL DEFAULT FALSE,
  media_parcial DECIMAL(3,1) NULL,
  nps_nota SMALLINT NULL CHECK (nps_nota BETWEEN 0 AND 10),
  status VARCHAR(20) NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'parcial')),
  encaminhado_ouvidoria BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_atividade TIMESTAMPTZ DEFAULT NOW(),
  token VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS answer (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
  pergunta_id INTEGER NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  opcao_id INTEGER NULL REFERENCES answer_option(id) ON DELETE SET NULL,
  valor SMALLINT NULL CHECK (valor BETWEEN 0 AND 10),
  texto TEXT NULL,
  UNIQUE (pesquisa_id, pergunta_id),
  CONSTRAINT answer_content_ck CHECK (
    opcao_id IS NOT NULL OR valor IS NOT NULL OR NULLIF(BTRIM(texto), '') IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  pesquisa_id INTEGER NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('elogio', 'reclamacao', 'sugestao')),
  descricao TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_tratamento', 'concluida')),
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anonimo BOOLEAN NOT NULL DEFAULT FALSE,
  origem VARCHAR(20) NOT NULL CHECK (origem IN ('pesquisa', 'abandono')),
  media_origem DECIMAL(3,1) NULL,
  motivo_encaminhamento TEXT,
  canal_contato VARCHAR(255),
  parecer_interno TEXT
);

CREATE TABLE IF NOT EXISTS care_team (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER NOT NULL REFERENCES sector(id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  turno VARCHAR(10) NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  data DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_member (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  cargo VARCHAR(150),
  registro VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS staff_shift (
  id SERIAL PRIMARY KEY,
  equipe_id INTEGER NOT NULL REFERENCES care_team(id) ON DELETE CASCADE,
  profissional_id INTEGER NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  turno VARCHAR(10) NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite'))
);

ALTER TABLE survey ADD COLUMN IF NOT EXISTS equipe_id INTEGER REFERENCES care_team(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_sector_date_shift ON care_team(setor_id, data, turno);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_assignment ON staff_shift(equipe_id, profissional_id, data, turno);
CREATE INDEX IF NOT EXISTS idx_survey_team ON survey(equipe_id);

CREATE TABLE IF NOT EXISTS user_role (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  permissoes JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS user_account (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  perfil_id INTEGER NOT NULL REFERENCES user_role(id),
  setor_id INTEGER NULL REFERENCES sector(id),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  senha_hash TEXT
);

ALTER TABLE user_account ADD COLUMN IF NOT EXISTS senha_hash TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NULL REFERENCES user_account(id),
  acao VARCHAR(100) NOT NULL,
  entidade VARCHAR(100) NOT NULL,
  entidade_id INTEGER,
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS report_export (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES user_account(id),
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('excel', 'pdf')),
  data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filtros JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS hospital_setting (
  hospital_id INTEGER NOT NULL REFERENCES hospital(id) ON DELETE CASCADE,
  chave VARCHAR(80) NOT NULL,
  valor JSONB NOT NULL,
  PRIMARY KEY (hospital_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_survey_sector ON survey(setor_id);
CREATE INDEX IF NOT EXISTS idx_survey_created_at ON survey(data_hora);
CREATE INDEX IF NOT EXISTS idx_survey_status ON survey(status);
CREATE INDEX IF NOT EXISTS idx_answer_survey ON answer(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

CREATE OR REPLACE VIEW vw_nps_by_sector_shift AS
SELECT
  p.setor_id,
  p.turno,
  COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL) AS total_avaliacoes,
  ROUND(AVG(p.nps_nota)::numeric, 1) AS media_nps,
  ROUND((100.0 * COUNT(*) FILTER (WHERE p.nps_nota BETWEEN 9 AND 10)) / NULLIF(COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL), 0), 1) AS promotores_pct,
  ROUND((100.0 * COUNT(*) FILTER (WHERE p.nps_nota BETWEEN 0 AND 6)) / NULLIF(COUNT(*) FILTER (WHERE p.nps_nota IS NOT NULL), 0), 1) AS detratores_pct
FROM survey p
GROUP BY p.setor_id, p.turno;

ALTER TABLE survey ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sector_public_read ON sector;
CREATE POLICY sector_public_read ON sector
 FOR SELECT USING (ativo = TRUE);

DROP POLICY IF EXISTS survey_public_insert ON survey;
DROP POLICY IF EXISTS survey_public_update ON survey;
DROP POLICY IF EXISTS feedback_private_read ON feedback;

CREATE UNIQUE INDEX IF NOT EXISTS answer_option_question_value_uidx
 ON answer_option (pergunta_id, valor);
