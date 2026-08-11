-- Cierre automático de fichajes: hasta ahora solo se cerraban solos los de
-- días anteriores, nunca el de HOY (podía quedar abierto muchas horas por
-- un olvido sin que nada lo corrigiera hasta el día siguiente). Se agrega
-- un límite de horas de turno: un fichaje de hoy también se cierra solo si
-- ya pasó ese máximo desde la entrada.
ALTER TABLE configuracion_fichajes
  ADD COLUMN IF NOT EXISTS horas_maximas_turno numeric NOT NULL DEFAULT 12;
