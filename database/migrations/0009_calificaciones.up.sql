-- 0009 · Calificaciones y comentarios (RF-10).
-- Reglas aprobadas en Fase 0: una calificación por par autor→perfil
-- (upsert), puntuación 1–5, comentario de máximo 240 caracteres y sin
-- autocalificación. El requisito de una solicitud aceptada previa queda
-- desactivado por defecto en `systemsettings` y puede endurecerse sin
-- cambiar código.
--
-- No destruye información: las calificaciones existentes no tienen autor
-- conocido, así que se conservan con `author_id NULL`. Las nuevas siempre
-- llevan autor. Los comentarios vacíos se normalizan a NULL.

-- 1) Guarda: el CHECK de rango no puede aplicarse sobre datos inválidos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM usersratings
    WHERE score < 1 OR score > 5
  ) THEN
    RAISE EXCEPTION
      'Hay calificaciones fuera del rango 1–5. Corrígelas antes de aplicar 0009.';
  END IF;
END
$$;

-- 2) Autor y fecha de edición. `comment` ya es varchar(240) desde 0001.
ALTER TABLE usersratings
  ADD COLUMN IF NOT EXISTS author_id integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE usersratings
  ADD CONSTRAINT usersratings_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE;

-- 3) Backfill sin pérdida: fechas faltantes y comentarios en blanco.
UPDATE usersratings
SET created_at = now()
WHERE created_at IS NULL;

UPDATE usersratings
SET updated_at = COALESCE(created_at, now())
WHERE updated_at IS NULL;

UPDATE usersratings
SET comment = NULL
WHERE comment IS NOT NULL
  AND btrim(comment) = '';

ALTER TABLE usersratings
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ADD CONSTRAINT usersratings_score_check
    CHECK (score BETWEEN 1 AND 5),
  ADD CONSTRAINT usersratings_comment_check
    CHECK (comment IS NULL OR char_length(comment) BETWEEN 1 AND 240),
  ADD CONSTRAINT usersratings_no_self_check
    CHECK (author_id IS NULL OR author_id <> player_id);

-- 4) Una sola calificación activa por par autor↔perfil. El índice es parcial
-- porque las filas heredadas sin autor no pueden participar en la unicidad.
CREATE UNIQUE INDEX usersratings_author_player_ux
  ON usersratings (author_id, player_id)
  WHERE author_id IS NOT NULL;

-- 5) Configuración del sistema (RF-14 la administrará en la Fase 10).
-- En la Fase 9 solo se lee `ratings.require_accepted_request`.
CREATE TABLE systemsettings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO systemsettings (key, value, description)
VALUES (
  'ratings.require_accepted_request',
  'false'::jsonb,
  'Si es true, solo se puede calificar a un jugador con quien exista una solicitud aceptada.'
)
ON CONFLICT (key) DO NOTHING;
