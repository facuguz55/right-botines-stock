-- Tabla de precio tarjeta -> efectivo, relevada a mano contra la web pública
-- de TiendaNube. Vive en la base (no hardcodeada en el bundle de JS) para que
-- una pestaña con una versión vieja de la app nunca pueda pisar estos valores
-- con una fórmula desactualizada en un resync.
CREATE TABLE IF NOT EXISTS precio_tiers_tarjeta (
  precio_tarjeta numeric PRIMARY KEY,
  precio_efectivo numeric NOT NULL,
  notas text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE precio_tiers_tarjeta ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all ON precio_tiers_tarjeta FOR ALL TO anon USING (true) WITH CHECK (true);

INSERT INTO precio_tiers_tarjeta (precio_tarjeta, precio_efectivo, notas) VALUES
  (77500, 60000, 'Gama Media'),
  (135500, 105000, 'F5 / Futsal'),
  (137380, 106000, 'F5 / Futsal (variante)'),
  (166500, 129000, 'F11 gama alta'),
  (174300, 135000, 'F11 estándar (variante)'),
  (174340, 135000, 'F11 estándar'),
  (186300, 144000, 'Mixtos')
ON CONFLICT (precio_tarjeta) DO NOTHING;
