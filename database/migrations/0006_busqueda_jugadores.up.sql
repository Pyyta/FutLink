-- 0006 · Búsqueda de jugadores (RF-05).
-- Solo agrega índices de apoyo; no modifica columnas ni datos.
-- La lista filtra por localidad y posición sobre cuentas activas con perfil
-- completo; el índice parcial evita indexar cuentas a medio registrar.

CREATE INDEX IF NOT EXISTS users_locality_active_idx
  ON users (locality)
  WHERE profile_completed_at IS NOT NULL
    AND state = 'active';

-- La PK de userspositions es (id_users, id_positions); este índice cubre el
-- sentido inverso que usa el filtro "positionId" (EXISTS por posición).
CREATE INDEX IF NOT EXISTS userspositions_position_user_idx
  ON userspositions (id_positions, id_users);
