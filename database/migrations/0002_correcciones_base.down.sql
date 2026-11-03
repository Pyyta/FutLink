-- 0002 · Down. Revierte las correcciones fundacionales.
-- ADVERTENCIA: elimina la tabla localities y, con ella, las localidades sembradas.
-- También intenta volver password a varchar(16) y birthdate a NOT NULL: si ya hay
-- hashes o fechas nulas, PostgreSQL aborta y la transacción no pierde datos.

DROP TABLE IF EXISTS localities;

DROP INDEX IF EXISTS positions_title_key;

ALTER TABLE userspositions
  DROP CONSTRAINT IF EXISTS userspositions_id_positions_fkey;
ALTER TABLE positions
  DROP CONSTRAINT IF EXISTS positions_pkey;
ALTER TABLE positions
  ALTER COLUMN id DROP IDENTITY IF EXISTS;
ALTER TABLE positions
  ADD CONSTRAINT positions_id_key UNIQUE (id);
ALTER TABLE userspositions
  ADD CONSTRAINT userspositions_id_positions_fkey
  FOREIGN KEY (id_positions) REFERENCES positions(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS users_email_lower_key;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_state_check;

ALTER TABLE users DROP COLUMN IF EXISTS updated_at;
ALTER TABLE users DROP COLUMN IF EXISTS profile_pic;

ALTER TABLE users ALTER COLUMN birthdate SET NOT NULL;
ALTER TABLE users ALTER COLUMN password TYPE varchar(16);
