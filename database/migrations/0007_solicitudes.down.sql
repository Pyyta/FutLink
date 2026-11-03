-- 0007 · Down.
-- Revierte el modelo de solicitudes al esquema de la Fase 5.
--
-- ADVERTENCIA: si existen solicitudes entre jugadores no se pueden representar
-- en `matchrequests` (su columna matchvacant_id es obligatoria). En ese caso la
-- migración aborta y no borra nada: habría pérdida de datos.

DO $$
BEGIN
  IF to_regclass('public.requests') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM requests
       WHERE request_type = 'player'
     ) THEN
    RAISE EXCEPTION
      'No se puede revertir 0007: existen solicitudes entre jugadores. Expórtalas o cancélalas antes de revertir.';
  END IF;
END
$$;

DROP INDEX IF EXISTS requests_active_match_ux;
DROP INDEX IF EXISTS requests_active_player_ux;
DROP INDEX IF EXISTS requests_receiver_state_created_idx;
DROP INDEX IF EXISTS requests_type_state_created_idx;
DROP INDEX IF EXISTS requests_match_id_idx;
DROP INDEX IF EXISTS requests_target_user_id_idx;
DROP INDEX IF EXISTS requests_cancelled_by_idx;

ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_match_receiver_fkey,
  DROP CONSTRAINT IF EXISTS requests_vacancy_match_fkey,
  DROP CONSTRAINT IF EXISTS requests_no_self_check,
  DROP CONSTRAINT IF EXISTS requests_target_check,
  DROP CONSTRAINT IF EXISTS requests_type_check,
  DROP CONSTRAINT IF EXISTS requests_state_check,
  DROP CONSTRAINT IF EXISTS requests_cancelled_by_fkey,
  DROP CONSTRAINT IF EXISTS requests_target_user_id_fkey,
  DROP CONSTRAINT IF EXISTS requests_receiver_id_fkey,
  DROP CONSTRAINT IF EXISTS requests_sender_id_fkey;

ALTER TABLE matchvacants
  DROP CONSTRAINT IF EXISTS matchvacants_id_match_key;

ALTER TABLE matchs
  DROP CONSTRAINT IF EXISTS matchs_id_creator_key;

UPDATE requests SET state = 'declined' WHERE state = 'rejected';

ALTER TABLE requests
  ALTER COLUMN matchvacant_id SET NOT NULL;

ALTER TABLE requests
  ADD CONSTRAINT matchrequests_state_check
  CHECK (state IN ('pending', 'accepted', 'declined', 'cancelled'));

ALTER TABLE requests
  ADD CONSTRAINT matchrequests_matchvacant_id_fkey
  FOREIGN KEY (matchvacant_id) REFERENCES matchvacants (id) ON DELETE CASCADE;

ALTER TABLE requests
  DROP COLUMN IF EXISTS request_type,
  DROP COLUMN IF EXISTS match_id,
  DROP COLUMN IF EXISTS target_user_id,
  DROP COLUMN IF EXISTS receiver_id,
  DROP COLUMN IF EXISTS responded_at,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancelled_by,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE requests RENAME COLUMN sender_id TO player_id;
ALTER TABLE requests RENAME CONSTRAINT requests_pkey TO matchrequests_pkey;
ALTER TABLE requests RENAME TO matchrequests;

ALTER INDEX IF EXISTS requests_sender_id_idx
  RENAME TO matchrequests_player_id_idx;
ALTER INDEX IF EXISTS requests_matchvacant_id_idx
  RENAME TO matchrequests_matchvacant_id_idx;

ALTER TABLE matchrequests
  ADD CONSTRAINT matchrequests_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES users (id);
