-- 1. Añadir la columna estado a las reservas para poder medir analíticas de cierre/pérdida
ALTER TABLE reservas 
ADD COLUMN estado text NOT NULL DEFAULT 'confirmada';

-- Nota: Solo necesitamos este campo para que la IA sepa qué reservas descontar del gráfico y del Salón.
