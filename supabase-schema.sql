-- 1. Crear tabla de configuración de mesas
CREATE TABLE configuracion (
  id integer PRIMARY KEY DEFAULT 1,
  mesas_de_2 integer NOT NULL DEFAULT 5,
  mesas_de_4 integer NOT NULL DEFAULT 5
);

-- Insertar la fila única por defecto (ejemplo: 5 mesas de 2 y 5 mesas de 4)
INSERT INTO configuracion (id, mesas_de_2, mesas_de_4) VALUES (1, 5, 5);

-- 2. Crear tabla de reservas
CREATE TABLE reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  fecha date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  personas integer NOT NULL,
  telefono text,
  fecha_creacion timestamp with time zone DEFAULT now()
);

-- 3. Habilitar y relajar temporalmente el Row Level Security (RLS) para el MVP
-- Esto permite que nuestro bot y la futura web lean y escriban sin problemas de permisos
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Config" ON configuracion FOR ALL USING (true);

ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access Reservas" ON reservas FOR ALL USING (true);
