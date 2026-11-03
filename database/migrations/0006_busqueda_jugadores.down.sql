-- 0006 · Down.
-- Solo elimina los índices creados en el up; no hay pérdida de datos.

DROP INDEX IF EXISTS userspositions_position_user_idx;
DROP INDEX IF EXISTS users_locality_active_idx;
