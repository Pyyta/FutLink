-- 0004 · Perfil de usuario (RF-03, RF-09).
-- Solo agrega índices de apoyo; no modifica columnas ni datos.
-- El promedio y los comentarios se leen con un índice que cubre score/comment
-- (index-only scan), y la visibilidad del teléfono usa las FKs de solicitudes.

CREATE INDEX IF NOT EXISTS usersratings_player_created_idx
  ON usersratings (player_id, created_at DESC)
  INCLUDE (score, comment);

CREATE INDEX IF NOT EXISTS matchrequests_player_id_idx
  ON matchrequests (player_id);

CREATE INDEX IF NOT EXISTS matchrequests_matchvacant_id_idx
  ON matchrequests (matchvacant_id);

CREATE INDEX IF NOT EXISTS matchvacants_match_id_idx
  ON matchvacants (match_id);

CREATE INDEX IF NOT EXISTS matchs_creator_id_idx
  ON matchs (creator_id);
