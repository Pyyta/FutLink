-- Localidades de Bogotá D.C. usadas en el registro, la búsqueda y la configuración (RF-02, RF-04, RF-14).
-- Idempotente: se puede ejecutar varias veces sin duplicar.
INSERT INTO localities (name)
VALUES
  ('Usaquén'),
  ('Chapinero'),
  ('Santa Fe'),
  ('San Cristóbal'),
  ('Usme'),
  ('Tunjuelito'),
  ('Bosa'),
  ('Kennedy'),
  ('Fontibón'),
  ('Engativá'),
  ('Suba'),
  ('Barrios Unidos'),
  ('Teusaquillo'),
  ('Los Mártires'),
  ('Antonio Nariño'),
  ('Puente Aranda'),
  ('La Candelaria'),
  ('Rafael Uribe Uribe'),
  ('Ciudad Bolívar'),
  ('Sumapaz')
ON CONFLICT (name) DO NOTHING;
