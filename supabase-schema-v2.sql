-- 1. Agregamos la nueva columna que soporta mesas dinámicas infinitas
ALTER TABLE configuracion 
ADD COLUMN inventario jsonb NOT NULL DEFAULT '[{"capacidad": 2, "cantidad": 5}, {"capacidad": 4, "cantidad": 5}]'::jsonb;

-- 2. Borramos las columnas rígidas viejas
ALTER TABLE configuracion DROP COLUMN mesas_de_2;
ALTER TABLE configuracion DROP COLUMN mesas_de_4;
