INSERT INTO hospital (id, nome, cnpj, endereco) VALUES
  (1, 'Fundação Hospitalar Dr. Oswaldo Diesel', '90.936.774/0001-11', 'Rua 12 de Maio, 555')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sector (id, hospital_id, nome, slug, url, qrcode, ativo) VALUES
  (1, 1, 'Recepção', 'recepcao', '/pesquisa/recepcao', '/pesquisa/recepcao', TRUE),
  (2, 1, 'Triagem', 'triagem', '/pesquisa/triagem', '/pesquisa/triagem', TRUE),
  (3, 1, 'Enfermagem', 'enfermagem', '/pesquisa/enfermagem', '/pesquisa/enfermagem', TRUE),
  (4, 1, 'Médico', 'medico', '/pesquisa/medico', '/pesquisa/medico', TRUE),
  (5, 1, 'Internação', 'internacao', '/pesquisa/internacao', '/pesquisa/internacao', TRUE),
  (6, 1, 'Raio-X', 'raio-x', '/pesquisa/raio-x', '/pesquisa/raio-x', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO care_route (id, setor_id, caminho, ordem, ativo) VALUES
  (1, 1, '/recepcao', 1, TRUE),
  (2, 2, '/triagem', 1, TRUE),
  (3, 3, '/enfermagem', 1, TRUE),
  (4, 4, '/medico', 1, TRUE),
  (5, 5, '/internacao', 1, TRUE),
  (6, 6, '/raio-x', 1, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO question (id, hospital_id, setor_id, rota_id, texto, tipo, geral, ordem, obrigatoria, ativo)
VALUES
  (1, 1, 1, 1, 'Como você avalia a recepção?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (2, 1, 2, 2, 'Como você avalia a triagem?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (3, 1, 3, 3, 'Como você avalia a enfermagem?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (4, 1, 4, 4, 'Como você avalia o atendimento médico?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (5, 1, 5, 5, 'Como você avalia a internação?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (6, 1, 6, 6, 'Como você avalia o serviço de raio-x?', 'rostinho', FALSE, 1, FALSE, TRUE),
  (7, 1, NULL, NULL, 'De 0 a 10, o quanto você recomendaria a Fundação a um amigo ou familiar?', 'nps', TRUE, 99, TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO answer_option (pergunta_id, valor, rotulo, emoji)
SELECT id, valor, rotulo, emoji
FROM (
  VALUES
    (1, 1, 'Muito ruim', '😡'),
    (1, 2, 'Ruim', '🙁'),
    (1, 3, 'Neutro', '😐'),
    (1, 4, 'Bom', '🙂'),
    (1, 5, 'Muito bom', '😍'),
    (2, 1, 'Muito ruim', '😡'), (2, 2, 'Ruim', '🙁'), (2, 3, 'Neutro', '😐'), (2, 4, 'Bom', '🙂'), (2, 5, 'Muito bom', '😍'),
    (3, 1, 'Muito ruim', '😡'), (3, 2, 'Ruim', '🙁'), (3, 3, 'Neutro', '😐'), (3, 4, 'Bom', '🙂'), (3, 5, 'Muito bom', '😍'),
    (4, 1, 'Muito ruim', '😡'), (4, 2, 'Ruim', '🙁'), (4, 3, 'Neutro', '😐'), (4, 4, 'Bom', '🙂'), (4, 5, 'Muito bom', '😍'),
    (5, 1, 'Muito ruim', '😡'), (5, 2, 'Ruim', '🙁'), (5, 3, 'Neutro', '😐'), (5, 4, 'Bom', '🙂'), (5, 5, 'Muito bom', '😍'),
    (6, 1, 'Muito ruim', '😡'), (6, 2, 'Ruim', '🙁'), (6, 3, 'Neutro', '😐'), (6, 4, 'Bom', '🙂'), (6, 5, 'Muito bom', '😍')
) AS v(pergunta_id, valor, rotulo, emoji)
WHERE EXISTS (SELECT 1 FROM question WHERE id = v.pergunta_id)
ON CONFLICT (pergunta_id, valor) DO NOTHING;

INSERT INTO user_role (id, nome, permissoes) VALUES
  (1, 'Super Admin', '{"roles": ["super_admin", "admin_setor", "gestao", "ouvidoria", "visualizador"]}'::jsonb),
  (2, 'Admin de Setor', '{"roles": ["admin_setor"]}'::jsonb),
  (3, 'Gestão', '{"roles": ["gestao"]}'::jsonb),
  (4, 'Ouvidoria', '{"roles": ["ouvidoria"]}'::jsonb),
  (5, 'Visualizador', '{"roles": ["visualizador"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO hospital_setting (hospital_id, chave, valor) VALUES
  (1, 'limiar_media_baixa', '{"valor": 2}'),
  (1, 'limiar_nps_baixo', '{"valor": 6}'),
  (1, 'minutos_abandono', '{"valor": 30}'),
  (1, 'retencao_dias', '{"valor": 365}')
ON CONFLICT (hospital_id, chave) DO NOTHING;

SELECT setval(pg_get_serial_sequence('hospital', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM hospital;
SELECT setval(pg_get_serial_sequence('sector', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM sector;
SELECT setval(pg_get_serial_sequence('care_route', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM care_route;
SELECT setval(pg_get_serial_sequence('question', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM question;
SELECT setval(pg_get_serial_sequence('user_role', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM user_role;
