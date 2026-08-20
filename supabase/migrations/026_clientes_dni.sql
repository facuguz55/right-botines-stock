-- DNI opcional del cliente, para poder identificarlo si hace falta
-- (ej. facturación, cambios/devoluciones) sin que sea un dato obligatorio.
ALTER TABLE clientes_locales ADD COLUMN IF NOT EXISTS dni TEXT;
