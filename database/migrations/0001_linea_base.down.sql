-- 0001 · Down de la línea base.
-- Se niega a ejecutarse si alguna tabla de negocio tiene filas: borrar el esquema
-- con datos sería destructivo e irreversible. Solo sirve para entornos vacíos.

DO $$
DECLARE
  tabla text;
  filas bigint;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'users',
    'positions',
    'userspositions',
    'usersratings',
    'matchs',
    'matchvacants',
    'matchrequests',
    'reports'
  ]
  LOOP
    IF to_regclass('public.' || tabla) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', tabla) INTO filas;
      IF filas > 0 THEN
        RAISE EXCEPTION
          'No se revierte la línea base: la tabla % tiene % fila(s). Migra hacia adelante en lugar de borrar datos.',
          tabla, filas;
      END IF;
    END IF;
  END LOOP;
END
$$;

DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS matchrequests CASCADE;
DROP TABLE IF EXISTS matchvacants CASCADE;
DROP TABLE IF EXISTS matchs CASCADE;
DROP TABLE IF EXISTS usersratings CASCADE;
DROP TABLE IF EXISTS userspositions CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
