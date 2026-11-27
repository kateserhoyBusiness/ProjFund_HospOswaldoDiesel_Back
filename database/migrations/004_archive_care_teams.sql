ALTER TABLE care_team
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

DROP INDEX IF EXISTS idx_permanent_team_sector;

CREATE UNIQUE INDEX idx_permanent_team_sector
  ON care_team(setor_id)
  WHERE permanente = TRUE AND ativo = TRUE;
