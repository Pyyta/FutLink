-- 0010 · Administración (RF-11 a RF-14).
-- Agrega moderación de contenidos, notificaciones de moderación, histórico de
-- reportes, configuración de la escala de calificación y unicidad de catálogos
-- sin distinguir mayúsculas.
--
-- No destruye información: las columnas nuevas tienen valores por defecto y los
-- CHECK se relajan o amplían. Los datos existentes quedan visibles.
--
-- OJO: el DOWN de esta migración elimina la moderación (lo oculto vuelve a ser
-- visible), el histórico de reportes y las claves nuevas de configuración.

-- 1) Moderación de partidos publicados (RF-12).
ALTER TABLE matchs
  ADD COLUMN moderation_state text NOT NULL DEFAULT 'visible',
  ADD COLUMN moderated_at timestamptz,
  ADD COLUMN moderated_by integer;

ALTER TABLE matchs
  ADD CONSTRAINT matchs_moderated_by_fkey
    FOREIGN KEY (moderated_by) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT matchs_moderation_state_check
    CHECK (moderation_state IN ('visible', 'hidden', 'deleted'));

CREATE INDEX matchs_moderation_created_idx
  ON matchs (moderation_state, created_at DESC, id DESC);

CREATE INDEX matchs_moderated_by_idx
  ON matchs (moderated_by)
  WHERE moderated_by IS NOT NULL;

-- 2) Moderación de calificaciones y comentarios (RF-12).
ALTER TABLE usersratings
  ADD COLUMN moderation_state text NOT NULL DEFAULT 'visible',
  ADD COLUMN moderated_at timestamptz,
  ADD COLUMN moderated_by integer;

ALTER TABLE usersratings
  ADD CONSTRAINT usersratings_moderated_by_fkey
    FOREIGN KEY (moderated_by) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT usersratings_moderation_state_check
    CHECK (moderation_state IN ('visible', 'hidden', 'deleted'));

CREATE INDEX usersratings_moderation_created_idx
  ON usersratings (moderation_state, created_at DESC, id DESC);

CREATE INDEX usersratings_moderated_by_idx
  ON usersratings (moderated_by)
  WHERE moderated_by IS NOT NULL;

-- 3) Notificaciones de moderación.
-- Las notificaciones de contenido no nacen de una solicitud, así que
-- `request_id` pasa a ser opcional y se agrega la referencia a la calificación.
ALTER TABLE notifications
  ALTER COLUMN request_id DROP NOT NULL,
  ADD COLUMN rating_id integer;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_rating_id_fkey
    FOREIGN KEY (rating_id) REFERENCES usersratings (id) ON DELETE SET NULL;

ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check,
  DROP CONSTRAINT notifications_match_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'request_accepted',
      'request_cancelled',
      'match_cancelled',
      'content_hidden',
      'content_deleted'
    )),
  ADD CONSTRAINT notifications_content_check
    CHECK (
      (type IN ('request_accepted', 'request_cancelled') AND request_id IS NOT NULL)
      OR (type = 'match_cancelled' AND request_id IS NOT NULL AND match_id IS NOT NULL)
      OR (
        type IN ('content_hidden', 'content_deleted')
        AND request_id IS NULL
        AND (match_id IS NOT NULL OR rating_id IS NOT NULL)
      )
    );

CREATE INDEX notifications_rating_id_idx
  ON notifications (rating_id)
  WHERE rating_id IS NOT NULL;

-- 4) Escala de calificación configurable (RF-14).
-- El rango duro de la base queda en 1–10; la configuración global decide el
-- rango efectivo y la API valida contra ella.
ALTER TABLE usersratings
  DROP CONSTRAINT usersratings_score_check;

ALTER TABLE usersratings
  ADD CONSTRAINT usersratings_score_check CHECK (score BETWEEN 1 AND 10);

-- 5) Histórico de reportes (RF-13). Se guarda el CSV generado para que un
-- reporte histórico se pueda descargar exactamente como se generó.
CREATE TABLE generatedreports (
  id serial PRIMARY KEY,
  report_type text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  row_count integer NOT NULL,
  csv_data text NOT NULL,
  generated_by integer REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generatedreports_type_check
    CHECK (report_type IN ('users', 'matches', 'requests')),
  CONSTRAINT generatedreports_period_check
    CHECK (period_end > period_start),
  CONSTRAINT generatedreports_row_count_check
    CHECK (row_count >= 0)
);

CREATE INDEX generatedreports_created_idx
  ON generatedreports (created_at DESC, id DESC);

CREATE INDEX generatedreports_generated_by_idx
  ON generatedreports (generated_by)
  WHERE generated_by IS NOT NULL;

-- 6) Parámetros globales iniciales.
INSERT INTO systemsettings (key, value, description)
VALUES
  (
    'ratings.min_score',
    '1'::jsonb,
    'Calificación mínima configurable (1–10).'
  ),
  (
    'ratings.max_score',
    '5'::jsonb,
    'Calificación máxima configurable (1–10).'
  ),
  (
    'notifications.enabled',
    'true'::jsonb,
    'Si es false, se dejan de generar notificaciones nuevas.'
  )
ON CONFLICT (key) DO NOTHING;

-- 7) Catálogos únicos sin distinguir mayúsculas. Los datos actuales ya son
-- únicos; el índice solo evita duplicados futuros como "Suba" y "suba".
CREATE UNIQUE INDEX positions_title_lower_ux
  ON positions (lower(title));

CREATE UNIQUE INDEX localities_name_lower_ux
  ON localities (lower(name));
