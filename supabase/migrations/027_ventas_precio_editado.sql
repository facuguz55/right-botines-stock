-- Marca si el precio de venta fue editado a mano al vender (en vez de usar
-- el precio de lista/promocional/con recargo calculado normalmente), para
-- que quede auditable en el historial sin frenar la venta en el momento.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS precio_editado boolean NOT NULL DEFAULT false;
