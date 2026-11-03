-- 0008 · Notificaciones (RF-08, RNF-02).
-- Entrega dentro de la app: las notificaciones se persisten para que el usuario
-- las reciba al iniciar sesión o al enfocar/recargar (polling ligero, sin
-- WebSockets). Cada notificación referencia la solicitud que la originó.
--
-- No modifica ni elimina datos existentes: solo crea una tabla nueva.

CREATE TABLE notifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  request_id integer NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  match_id integer REFERENCES matchs (id) ON DELETE CASCADE,
  actor_id integer REFERENCES users (id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check
    CHECK (type IN ('request_accepted', 'request_cancelled', 'match_cancelled')),
  CONSTRAINT notifications_match_check
    CHECK (type <> 'match_cancelled' OR match_id IS NOT NULL),
  CONSTRAINT notifications_no_self_check
    CHECK (actor_id IS NULL OR actor_id <> user_id)
);

-- Bandeja: pendientes primero por fecha; el id desempata.
CREATE INDEX notifications_user_unread_created_idx
  ON notifications (user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX notifications_user_created_idx
  ON notifications (user_id, created_at DESC, id DESC);

-- Apoyo para las FKs (borrado en cascada / SET NULL).
CREATE INDEX notifications_request_id_idx ON notifications (request_id);

CREATE INDEX notifications_match_id_idx
  ON notifications (match_id)
  WHERE match_id IS NOT NULL;

CREATE INDEX notifications_actor_id_idx
  ON notifications (actor_id)
  WHERE actor_id IS NOT NULL;
