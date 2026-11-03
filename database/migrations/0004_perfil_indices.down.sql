-- 0004 · Down. Elimina solo los índices de apoyo creados en la fase 4.
-- No elimina datos: el perfil y las calificaciones siguen intactos.

DROP INDEX IF EXISTS usersratings_player_created_idx;
DROP INDEX IF EXISTS matchrequests_player_id_idx;
DROP INDEX IF EXISTS matchrequests_matchvacant_id_idx;
DROP INDEX IF EXISTS matchvacants_match_id_idx;
DROP INDEX IF EXISTS matchs_creator_id_idx;
