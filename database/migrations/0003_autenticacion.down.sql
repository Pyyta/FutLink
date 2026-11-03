-- 0003 · Down. Revierte la autenticación.
-- ADVERTENCIA: elimina refresh_tokens y password_reset_codes (datos efímeros: las
-- sesiones se cierran y los códigos pendientes dejan de servir). No elimina usuarios.
-- Intentar volver password a varchar(16) o name/locality a NOT NULL fallará si ya
-- existen hashes o cuentas sin perfil; la transacción aborta y no se pierde nada.

DROP TABLE IF EXISTS password_reset_codes;
DROP TABLE IF EXISTS refresh_tokens;

ALTER TABLE users DROP COLUMN IF EXISTS profile_completed_at;

ALTER TABLE users ALTER COLUMN name SET NOT NULL;
ALTER TABLE users ALTER COLUMN locality SET NOT NULL;
ALTER TABLE users ALTER COLUMN password TYPE varchar(16);
