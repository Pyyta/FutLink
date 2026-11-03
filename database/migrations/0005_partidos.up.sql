-- 0005 · Partidos y búsqueda (RF-04 + Publicar partido).
-- Amplía matchs y matchvacants y habilita el estado 'cancelled' en solicitudes.
-- No elimina columnas ni filas. Si hubiera partidos con estados desconocidos,
-- la migración aborta en lugar de reescribirlos.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM matchs
    WHERE state NOT IN ('available', 'confirmed', 'cancelled')
  ) THEN
    RAISE EXCEPTION
      'Hay partidos con estados no reconocidos. Normalízalos antes de aplicar 0005.';
  END IF;
END
$$;

ALTER TABLE matchs ADD COLUMN IF NOT EXISTS modality varchar(20);
ALTER TABLE matchs ADD COLUMN IF NOT EXISTS description varchar(500);
ALTER TABLE matchs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE matchs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE matchs ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE matchs ALTER COLUMN state SET DEFAULT 'available';
ALTER TABLE matchs
  ADD CONSTRAINT matchs_state_check
  CHECK (state IN ('available', 'confirmed', 'cancelled'));

-- Búsqueda por fecha y por zona (RF-04). Solo indexa partidos disponibles.
CREATE INDEX IF NOT EXISTS matchs_available_date_idx
  ON matchs (match_date)
  WHERE state = 'available';

CREATE INDEX IF NOT EXISTS matchs_locality_date_idx
  ON matchs (locality, match_date)
  WHERE state = 'available';

-- Orden por cercanía con PostGIS cuando el partido tiene ubicación.
CREATE INDEX IF NOT EXISTS matchs_location_gist_idx
  ON matchs USING GIST (location);

-- Plazas libres por posición dentro de un partido.
CREATE INDEX IF NOT EXISTS matchvacants_free_position_idx
  ON matchvacants (match_id, position)
  WHERE NOT occupied;

-- Cancelar un partido también cancela sus solicitudes activas (RF-07, RNF-08).
-- Se conserva 'declined' para no tocar los datos existentes de la Fase 2.
ALTER TABLE matchrequests DROP CONSTRAINT IF EXISTS matchrequests_state_check;
ALTER TABLE matchrequests
  ADD CONSTRAINT matchrequests_state_check
  CHECK (state IN ('pending', 'accepted', 'declined', 'cancelled'));
