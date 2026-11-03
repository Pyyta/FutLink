-- Posiciones de juego usadas en el registro y el perfil (RF-02).
-- Idempotente: se puede ejecutar varias veces sin duplicar.
INSERT INTO positions (title)
VALUES
  ('portero'),
  ('defensa'),
  ('mediocampista'),
  ('delantero')
ON CONFLICT (title) DO NOTHING;
