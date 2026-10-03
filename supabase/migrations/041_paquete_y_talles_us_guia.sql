-- 1) Medidas del paquete por modelo, para publicarlas en cada variante de
--    TiendaNube (weight en kg; width/height/depth en cm). Sin esto la web no
--    puede calcular el costo del envío de los productos dados de alta desde
--    la app.
alter table modelos add column if not exists peso_kg numeric;
alter table modelos add column if not exists alto_cm numeric;
alter table modelos add column if not exists ancho_cm numeric;
alter table modelos add column if not exists profundidad_cm numeric;

-- 2) Talle US de los talles ya cargados, según la guía de talles de
--    right.com.ar (src/lib/talles.ts). La app usaba tablas que no coincidían
--    (ej. ARG 40 → US 9; la guía dice 8). Para ARG sin US en la guía (35–38,
--    45+) queda 0 = sin US. Esto corrige SOLO la app: no toca TiendaNube.
update modelo_talles set talle_us = case talle_arg
  when 39 then 7
  when 40 then 8
  when 41 then 8.5
  when 42 then 9.5
  when 43 then 10
  when 44 then 11
  else 0
end
where talle_us is distinct from (case talle_arg
  when 39 then 7 when 40 then 8 when 41 then 8.5 when 42 then 9.5 when 43 then 10 when 44 then 11 else 0 end);
