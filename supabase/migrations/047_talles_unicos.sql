-- Talles duplicados en un mismo botín (ej. dos filas "40" en el mismo modelo).
--
-- Causa: al crear/editar un producto en TiendaNube llegan varios webhooks casi
-- juntos; cada uno veía que el talle no existía y lo insertaba, y no había
-- nada en la base que lo impidiera. Después los sincronizadores solo
-- actualizaban la primera fila y nunca limpiaban las otras.
--
-- 1) Deja UNA fila por (modelo, talle): la de mayor stock (desempata por id).
--    El stock final lo corrige la próxima sincronización con TiendaNube.
--    Ninguna otra tabla referencia modelo_talles.id (verificado), así que
--    borrar las sobrantes no deja nada colgado.
-- 2) Índice único para que la base rechace duplicados de ahora en más.

delete from modelo_talles
where id in (
  select id from (
    select id,
           row_number() over (partition by modelo_id, talle_arg order by cantidad desc, id) as rn
    from modelo_talles
  ) x
  where rn > 1
);

create unique index if not exists uq_modelo_talles_modelo_talle
  on modelo_talles (modelo_id, talle_arg);
