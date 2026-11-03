-- 0001 · Línea base del esquema existente de FutLink.
-- Seguro sobre la base actual: solo crea lo que no existe (CREATE TABLE IF NOT EXISTS).
-- No modifica tablas ya presentes ni borra datos.
-- La extensión PostGIS es requisito del esquema y no se elimina en el down.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email varchar(128) NOT NULL UNIQUE,
  phone varchar(24) UNIQUE,
  password varchar(16) NOT NULL,
  location geography(Point, 4326),
  role varchar(20) NOT NULL DEFAULT 'user',
  matchs_played integer NOT NULL DEFAULT 0,
  birthdate timestamptz NOT NULL,
  register_date timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locality text NOT NULL,
  state text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS positions (
  id integer NOT NULL UNIQUE,
  title varchar(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS userspositions (
  id_users integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_positions integer NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  PRIMARY KEY (id_users, id_positions)
);

CREATE TABLE IF NOT EXISTS usersratings (
  id serial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score integer NOT NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  comment varchar(240)
);

CREATE TABLE IF NOT EXISTS matchs (
  id serial PRIMARY KEY,
  creator_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_date timestamptz NOT NULL,
  locality text NOT NULL,
  location geography(Point, 4326),
  state text NOT NULL DEFAULT 'confirmed'
);

CREATE TABLE IF NOT EXISTS matchvacants (
  id serial PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matchs(id) ON DELETE CASCADE,
  position text NOT NULL,
  occupied boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS matchrequests (
  id serial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES users(id),
  matchvacant_id integer NOT NULL REFERENCES matchvacants(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id serial PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matchs(id) ON DELETE CASCADE,
  reported_player_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason varchar(240) NOT NULL,
  report_date timestamptz DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_no_self_report CHECK (reporter_id <> reported_player_id)
);
