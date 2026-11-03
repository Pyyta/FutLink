-- 0005 · Down.
-- ADVERTENCIA: elimina las columnas modality, description, created_at, updated_at
-- y cancelled_at de matchs, junto con sus datos. Aborta si existen solicitudes
-- canceladas, porque volver al CHECK anterior perdería ese estado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM matchrequests WHERE state = 'cancelled') THEN
    RAISE EXCEPTION
      'Existen solicitudes canceladas; revertir 0005 descartaría ese estado.';
  END IF;
END
$$;

DROP INDEX IF EXISTS matchvacants_free_position_idx;
DROP INDEX IF EXISTS matchs_location_gist_idx;
DROP INDEX IF EXISTS matchs_locality_date_idx;
DROP INDEX IF EXISTS matchs_available_date_idx;

ALTER TABLE matchrequests DROP CONSTRAINT IF EXISTS matchrequests_state_check;
ALTER TABLE matchrequests
  ADD CONSTRAINT matchrequests_state_check
  CHECK (state IN ('pending', 'accepted', 'declined'));

ALTER TABLE matchs DROP CONSTRAINT IF EXISTS matchs_state_check;
ALTER TABLE matchs ALTER COLUMN state SET DEFAULT 'confirmed';

ALTER TABLE matchs DROP COLUMN IF EXISTS cancelled_at;
ALTER TABLE matchs DROP COLUMN IF EXISTS updated_at;
ALTER TABLE matchs DROP COLUMN IF EXISTS created_at;
ALTER TABLE matchs DROP COLUMN IF EXISTS description;
ALTER TABLE matchs DROP COLUMN IF EXISTS modality;
