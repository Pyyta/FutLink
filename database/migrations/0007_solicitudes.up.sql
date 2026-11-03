-- 0007 · Solicitudes (RF-06, RF-07, RNF-08).
-- Modelo aprobado en Fase 0 (Opción A): una sola tabla `requests` con
-- discriminador `request_type` ('match' | 'player').
--
-- ATENCIÓN: esta migración RENOMBRA `matchrequests` a `requests` y
-- `player_id` a `sender_id`. No elimina filas: las solicitudes existentes se
-- conservan como solicitudes de partido, con su partido y organizador
-- rellenados. Los estados 'declined' pasan a 'rejected' para alinear el
-- vocabulario con RF-06 ("rechazar").
--
-- Es segura sobre la base actual (0 filas), pero aborta si encuentra datos que
-- no puede representar (estados desconocidos o solicitudes activas duplicadas).

-- 1) Guardas previas: no reescribir estados ni crear índices que fallen.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM matchrequests
    WHERE state NOT IN ('pending', 'accepted', 'declined', 'cancelled')
  ) THEN
    RAISE EXCEPTION
      'Hay solicitudes con estados no reconocidos. Normalízalas antes de aplicar 0007.';
  END IF;
END
$$;

-- 2) Renombrado de tabla y columna; se retiran las FKs para recrearlas con
-- políticas explícitas de borrado.
ALTER TABLE matchrequests DROP CONSTRAINT IF EXISTS matchrequests_state_check;
ALTER TABLE matchrequests DROP CONSTRAINT IF EXISTS matchrequests_player_id_fkey;
ALTER TABLE matchrequests DROP CONSTRAINT IF EXISTS matchrequests_matchvacant_id_fkey;

ALTER TABLE matchrequests RENAME TO requests;
ALTER TABLE requests RENAME COLUMN player_id TO sender_id;
ALTER TABLE requests RENAME CONSTRAINT matchrequests_pkey TO requests_pkey;

-- 3) Columnas del modelo polimórfico.
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS request_type text,
  ADD COLUMN IF NOT EXISTS match_id integer,
  ADD COLUMN IF NOT EXISTS target_user_id integer,
  ADD COLUMN IF NOT EXISTS receiver_id integer,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 4) Backfill de las filas existentes: todas son solicitudes jugador→vacante.
UPDATE requests r
SET request_type = 'match',
    match_id = mv.match_id,
    receiver_id = m.creator_id
FROM matchvacants mv
JOIN matchs m ON m.id = mv.match_id
WHERE r.matchvacant_id = mv.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM requests
    WHERE request_type IS NULL
       OR match_id IS NULL
       OR receiver_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Hay solicitudes sin partido u organizador resoluble. Revisa matchvacants antes de aplicar 0007.';
  END IF;
END
$$;

ALTER TABLE requests
  ALTER COLUMN request_type SET NOT NULL,
  ALTER COLUMN receiver_id SET NOT NULL,
  ALTER COLUMN matchvacant_id DROP NOT NULL;

-- 5) Vocabulario de estados: 'declined' → 'rejected'.
UPDATE requests SET state = 'rejected' WHERE state = 'declined';

-- 6) Claves foráneas compuestas que hacen imposible cruzar partido/vacante o
-- partido/organizador (RNF-08).
ALTER TABLE matchvacants
  ADD CONSTRAINT matchvacants_id_match_key UNIQUE (id, match_id);

ALTER TABLE matchs
  ADD CONSTRAINT matchs_id_creator_key UNIQUE (id, creator_id);

ALTER TABLE requests
  ADD CONSTRAINT requests_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
  ADD CONSTRAINT requests_receiver_id_fkey
    FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE,
  ADD CONSTRAINT requests_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE CASCADE,
  ADD CONSTRAINT requests_cancelled_by_fkey
    FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT requests_vacancy_match_fkey
    FOREIGN KEY (matchvacant_id, match_id)
    REFERENCES matchvacants (id, match_id) ON DELETE CASCADE,
  ADD CONSTRAINT requests_match_receiver_fkey
    FOREIGN KEY (match_id, receiver_id)
    REFERENCES matchs (id, creator_id) ON DELETE CASCADE;

-- 7) Reglas de integridad del discriminador.
ALTER TABLE requests
  ADD CONSTRAINT requests_state_check
    CHECK (state IN ('pending', 'accepted', 'rejected', 'cancelled')),
  ADD CONSTRAINT requests_type_check
    CHECK (request_type IN ('match', 'player')),
  ADD CONSTRAINT requests_target_check
    CHECK (
      (
        request_type = 'match'
        AND match_id IS NOT NULL
        AND matchvacant_id IS NOT NULL
        AND target_user_id IS NULL
      )
      OR
      (
        request_type = 'player'
        AND match_id IS NULL
        AND matchvacant_id IS NULL
        AND target_user_id IS NOT NULL
        AND receiver_id = target_user_id
      )
    ),
  ADD CONSTRAINT requests_no_self_check
    CHECK (sender_id <> receiver_id);

-- 8) Sin duplicados activos: la restricción vive en la base, no solo en el
-- servicio. Un jugador no puede tener dos solicitudes activas al mismo partido
-- ni dos solicitudes activas a la misma persona.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM requests
    WHERE request_type = 'match'
      AND state IN ('pending', 'accepted')
    GROUP BY sender_id, match_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay solicitudes activas duplicadas para el mismo jugador y partido. Resuélvelas antes de aplicar 0007.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM requests
    WHERE request_type = 'player'
      AND state IN ('pending', 'accepted')
    GROUP BY sender_id, target_user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Hay solicitudes activas duplicadas entre los mismos jugadores. Resuélvelas antes de aplicar 0007.';
  END IF;
END
$$;

CREATE UNIQUE INDEX requests_active_match_ux
  ON requests (sender_id, match_id)
  WHERE request_type = 'match' AND state IN ('pending', 'accepted');

CREATE UNIQUE INDEX requests_active_player_ux
  ON requests (sender_id, target_user_id)
  WHERE request_type = 'player' AND state IN ('pending', 'accepted');

-- 9) Índices de apoyo para las bandejas y las FKs.
ALTER INDEX IF EXISTS matchrequests_player_id_idx
  RENAME TO requests_sender_id_idx;
ALTER INDEX IF EXISTS matchrequests_matchvacant_id_idx
  RENAME TO requests_matchvacant_id_idx;

CREATE INDEX requests_receiver_state_created_idx
  ON requests (receiver_id, state, created_at DESC);

CREATE INDEX requests_type_state_created_idx
  ON requests (request_type, state, created_at DESC);

CREATE INDEX requests_match_id_idx
  ON requests (match_id)
  WHERE match_id IS NOT NULL;

CREATE INDEX requests_target_user_id_idx
  ON requests (target_user_id)
  WHERE target_user_id IS NOT NULL;

CREATE INDEX requests_cancelled_by_idx
  ON requests (cancelled_by)
  WHERE cancelled_by IS NOT NULL;
