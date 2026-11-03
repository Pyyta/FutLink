-- 0010 · DOWN.
-- ADVERTENCIA: elimina la moderación (todo lo oculto o marcado como eliminado
-- vuelve a ser visible), borra el histórico de reportes y las claves nuevas de
-- configuración (escala y notificaciones). No borra partidos, cuentas,
-- calificaciones ni solicitudes.
--
-- El DOWN aborta si hay datos que no caben en el esquema anterior:
--   * calificaciones fuera de 1–5 (por haber ampliado la escala),
--   * notificaciones de contenido o sin solicitud asociada.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM usersratings WHERE score < 1 OR score > 5
  ) THEN
    RAISE EXCEPTION
      'Hay calificaciones fuera del rango 1–5. Ajusta la escala o corrige los datos antes de revertir 0010.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM notifications
    WHERE request_id IS NULL
       OR rating_id IS NOT NULL
       OR type IN ('content_hidden', 'content_deleted')
  ) THEN
    RAISE EXCEPTION
      'Hay notificaciones de moderación o sin solicitud. Elimínalas antes de revertir 0010.';
  END IF;
END
$$;

-- 1) Catálogos: se retiran los índices sin distinguir mayúsculas.
DROP INDEX IF EXISTS localities_name_lower_ux;
DROP INDEX IF EXISTS positions_title_lower_ux;

-- 2) Configuración nueva.
DELETE FROM systemsettings
WHERE key IN (
  'ratings.min_score',
  'ratings.max_score',
  'notifications.enabled'
);

-- 3) Histórico de reportes (se pierde por completo).
DROP TABLE IF EXISTS generatedreports;

-- 4) Escala de calificación original.
ALTER TABLE usersratings
  DROP CONSTRAINT IF EXISTS usersratings_score_check;

ALTER TABLE usersratings
  ADD CONSTRAINT usersratings_score_check CHECK (score BETWEEN 1 AND 5);

-- 5) Notificaciones: vuelve a exigir solicitud y rechaza tipos de contenido.
DROP INDEX IF EXISTS notifications_rating_id_idx;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_content_check,
  DROP CONSTRAINT IF EXISTS notifications_type_check,
  DROP CONSTRAINT IF EXISTS notifications_rating_id_fkey;

ALTER TABLE notifications
  ALTER COLUMN request_id SET NOT NULL;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('request_accepted', 'request_cancelled', 'match_cancelled')),
  ADD CONSTRAINT notifications_match_check
    CHECK (type <> 'match_cancelled' OR match_id IS NOT NULL);

ALTER TABLE notifications
  DROP COLUMN IF EXISTS rating_id;

-- 6) Moderación de calificaciones.
DROP INDEX IF EXISTS usersratings_moderated_by_idx;
DROP INDEX IF EXISTS usersratings_moderation_created_idx;

ALTER TABLE usersratings
  DROP CONSTRAINT IF EXISTS usersratings_moderation_state_check,
  DROP CONSTRAINT IF EXISTS usersratings_moderated_by_fkey;

ALTER TABLE usersratings
  DROP COLUMN IF EXISTS moderated_by,
  DROP COLUMN IF EXISTS moderated_at,
  DROP COLUMN IF EXISTS moderation_state;

-- 7) Moderación de partidos.
DROP INDEX IF EXISTS matchs_moderated_by_idx;
DROP INDEX IF EXISTS matchs_moderation_created_idx;

ALTER TABLE matchs
  DROP CONSTRAINT IF EXISTS matchs_moderation_state_check,
  DROP CONSTRAINT IF EXISTS matchs_moderated_by_fkey;

ALTER TABLE matchs
  DROP COLUMN IF EXISTS moderated_by,
  DROP COLUMN IF EXISTS moderated_at,
  DROP COLUMN IF EXISTS moderation_state;
