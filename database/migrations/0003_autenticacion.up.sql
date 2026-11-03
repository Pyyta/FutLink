-- 0003 · Autenticación (RF-01, RF-02, RNF-04, RNF-05).
-- Compatible con datos existentes: solo amplía columnas y agrega tablas nuevas.

-- 1) RNF-04: bcrypt con coste 12 produce hashes de 60 caracteres; se deja margen
-- para futuros cambios de algoritmo sin volver a migrar.
ALTER TABLE users ALTER COLUMN password TYPE varchar(255);

-- 2) Registro en dos pasos: el correo y la contraseña se capturan primero; nombre,
-- teléfono, localidad y posiciones se completan en RF-02. Por eso name y locality
-- dejan de ser obligatorios a nivel de fila; la regla de perfil completo se aplica
-- en el backend (users.profile_completed_at).
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN locality DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- 3) Refresh tokens opacos: solo se guarda su SHA-256, nunca el valor en claro.
-- La rotación enlaza el token reemplazado con replaced_by_id para detectar reuso.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL,
  user_agent varchar(255),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_id bigint REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_idx
  ON refresh_tokens (expires_at);

-- 4) Códigos de recuperación (RNF-05): se guarda un HMAC-SHA-256 con pepper del
-- servidor, nunca el código de 6 dígitos. Un solo uso, expiración e intentos.
CREATE TABLE IF NOT EXISTS password_reset_codes (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash char(64) NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_codes_user_id_idx
  ON password_reset_codes (user_id, created_at DESC);

-- Solo puede haber un código vigente por usuario; los anteriores se invalidan al
-- emitir uno nuevo.
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_codes_one_active_idx
  ON password_reset_codes (user_id)
  WHERE used_at IS NULL;
