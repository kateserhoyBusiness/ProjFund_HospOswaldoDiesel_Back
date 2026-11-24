CREATE TABLE IF NOT EXISTS user_sector (
  usuario_id INTEGER NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  setor_id INTEGER NOT NULL REFERENCES sector(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, setor_id)
);

INSERT INTO user_sector (usuario_id, setor_id)
SELECT id, setor_id FROM user_account WHERE setor_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_sector_sector ON user_sector(setor_id);
