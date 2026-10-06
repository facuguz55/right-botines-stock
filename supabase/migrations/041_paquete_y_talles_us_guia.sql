-- 1) Medidas del paquete por modelo, para publicarlas en cada variante de
--    TiendaNube (weight en kg; width/height/depth en cm). Sin esto la web no
--    puede calcular el costo del envío de los productos dados de alta desde
--    la app.
alter table modelos add column if not exists peso_kg numeric;
alter table modelos add column if not exists alto_cm numeric;
alter table modelos add column if not exists ancho_cm numeric;
alter table modelos add column if not exists profundidad_cm numeric;

-- 2) Talle US de los talles ya cargados en la app, con la tabla que usa Right
--    en la web (src/lib/talles.ts; relevada en los 144 productos publicados el
--    06/10/2026). Solo toca ARG 35–44; el resto queda como está. No toca
--    TiendaNube. Se puede correr más de una vez.
update modelo_talles set talle_us = case talle_arg
  when 35 then 5 when 36 then 5 when 37 then 5.5 when 38 then 6.5
  when 39 then 7 when 40 then 8 when 41 then 8.5 when 42 then 9.5
  when 43 then 10 when 44 then 11
end
where talle_arg in (35, 36, 37, 38, 39, 40, 41, 42, 43, 44)
  and talle_us is distinct from (case talle_arg
    when 35 then 5 when 36 then 5 when 37 then 5.5 when 38 then 6.5
    when 39 then 7 when 40 then 8 when 41 then 8.5 when 42 then 9.5
    when 43 then 10 when 44 then 11 end);
