-- Stock Buenos Aires, segunda tanda: precio de venta, vínculo con el modelo
-- del local, alta a mano y talles nuevos.
--
-- modelo_local_id enlaza un modelo de Buenos Aires con el mismo modelo del
-- local (ej: el Phantom rosado que acá tiene 40 y 41 y allá 43 y 44), para que
-- en Stock se vea cuáles talles están en el local y cuáles solo por envío.

alter table public.stock_ba_modelos
  add column if not exists precio_venta numeric,
  add column if not exists modelo_local_id uuid references public.modelos(id) on delete set null;

create index if not exists stock_ba_modelos_local_idx on public.stock_ba_modelos (modelo_local_id);

-- Alta de un modelo a mano (sin PDF). p_talles: [{ talle, cantidad }].
create or replace function public.crear_modelo_ba(
  p_codigo text, p_descripcion text, p_costo numeric, p_precio_venta numeric,
  p_foto_url text, p_talles jsonb, p_empleado_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_talle jsonb;
  v_cant integer;
begin
  if coalesce(trim(p_codigo), '') = '' then raise exception 'Falta el código'; end if;
  if coalesce(trim(p_descripcion), '') = '' then raise exception 'Falta el nombre'; end if;
  if exists (select 1 from stock_ba_modelos where codigo = trim(p_codigo)) then
    raise exception 'Ya hay un modelo con el código %', trim(p_codigo);
  end if;

  insert into stock_ba_modelos (codigo, descripcion, costo, precio_venta, foto_url)
  values (trim(p_codigo), trim(p_descripcion), p_costo, p_precio_venta, nullif(p_foto_url, ''))
  returning id into v_id;

  for v_talle in select * from jsonb_array_elements(coalesce(p_talles, '[]'::jsonb)) loop
    v_cant := coalesce((v_talle->>'cantidad')::integer, 0);
    if v_cant > 0 and coalesce(v_talle->>'talle', '') <> '' then
      insert into stock_ba_talles (modelo_id, talle, cantidad)
      values (v_id, v_talle->>'talle', v_cant)
      on conflict (modelo_id, talle) do update set cantidad = stock_ba_talles.cantidad + excluded.cantidad;
      insert into stock_ba_movimientos (modelo_id, talle, delta, motivo, empleado_id)
      values (v_id, v_talle->>'talle', v_cant, 'Alta a mano', p_empleado_id);
    end if;
  end loop;
  return v_id;
end;
$$;

-- Suma pares a un talle de un modelo; si el talle no existe lo crea.
create or replace function public.sumar_talle_ba(
  p_modelo_id uuid, p_talle text, p_cantidad integer, p_motivo text default 'Ingreso',
  p_empleado_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nueva integer;
begin
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad tiene que ser mayor a 0'; end if;
  if coalesce(trim(p_talle), '') = '' then raise exception 'Falta el talle'; end if;

  insert into stock_ba_talles (modelo_id, talle, cantidad)
  values (p_modelo_id, trim(p_talle), p_cantidad)
  on conflict (modelo_id, talle) do update set cantidad = stock_ba_talles.cantidad + excluded.cantidad
  returning cantidad into v_nueva;

  insert into stock_ba_movimientos (modelo_id, talle, delta, motivo, empleado_id)
  values (p_modelo_id, trim(p_talle), p_cantidad, coalesce(nullif(trim(p_motivo), ''), 'Ingreso'), p_empleado_id);
  return v_nueva;
end;
$$;
