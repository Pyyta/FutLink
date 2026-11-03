-- 0009 · Reversión de calificaciones y configuración.
-- ATENCIÓN: elimina el autor y la fecha de edición de las calificaciones, y
-- borra la tabla `systemsettings` con su valor de configuración. Las
-- calificaciones y sus puntuaciones/comentarios se conservan.
-- Los comentarios que estaban vacíos y se normalizaron a NULL no se restauran.

DROP INDEX IF EXISTS usersratings_author_player_ux;

ALTER TABLE usersratings
  DROP CONSTRAINT IF EXISTS usersratings_score_check,
  DROP CONSTRAINT IF EXISTS usersratings_comment_check,
  DROP CONSTRAINT IF EXISTS usersratings_no_self_check,
  DROP CONSTRAINT IF EXISTS usersratings_author_id_fkey;

ALTER TABLE usersratings
  DROP COLUMN IF EXISTS author_id,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE usersratings
  ALTER COLUMN created_at DROP NOT NULL,
  ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;

DROP TABLE IF EXISTS systemsettings;
