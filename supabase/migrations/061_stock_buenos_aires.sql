-- Stock que está en el depósito de la proveedora en Buenos Aires.
--
-- No es el "depósito" de la migración 029: ese está en el mismo lugar que el
-- local y sus pares se pueden pasar al mostrador. Estos pares están lejos, se
-- venden solo por envío y no se mezclan con el stock del local ni de
-- modelo_talles. Por eso va en tablas propias.
--
-- El stock entra por los pedidos en PDF de la proveedora (ver
-- importar_pedido_ba): un pedido ya cargado no se vuelve a cargar, y un
-- código que ya existe en otro pedido suma sus pares al mismo modelo.

create table if not exists public.stock_ba_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  fecha date,
  proveedor text,
  unidades integer,
  total numeric,
  archivo text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_ba_modelos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  foto_url text,
  costo numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_ba_talles (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.stock_ba_modelos(id) on delete cascade,
  talle text not null,
  cantidad integer not null default 0 check (cantidad >= 0),
  unique (modelo_id, talle)
);

-- Cada cambio de stock queda anotado: entrada por pedido, venta o ajuste.
create table if not exists public.stock_ba_movimientos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.stock_ba_modelos(id) on delete cascade,
  talle text not null,
  delta integer not null,
  motivo text not null,
  pedido_id uuid references public.stock_ba_pedidos(id) on delete set null,
  empleado_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists stock_ba_mov_modelo_idx on public.stock_ba_movimientos (modelo_id, created_at desc);

alter table public.stock_ba_pedidos enable row level security;
alter table public.stock_ba_modelos enable row level security;
alter table public.stock_ba_talles enable row level security;
alter table public.stock_ba_movimientos enable row level security;
create policy stock_ba_pedidos_all on public.stock_ba_pedidos for all using (true) with check (true);
create policy stock_ba_modelos_all on public.stock_ba_modelos for all using (true) with check (true);
create policy stock_ba_talles_all on public.stock_ba_talles for all using (true) with check (true);
create policy stock_ba_movimientos_all on public.stock_ba_movimientos for all using (true) with check (true);

-- Carga un pedido entero de una sola vez. p_pedido:
--   { numero, fecha, proveedor, unidades, total, archivo,
--     items: [{ codigo, descripcion, costo, foto_url, talles: [{ talle, cantidad }] }] }
-- Si el número de pedido ya está cargado no hace nada y devuelve ya_estaba.
create or replace function public.importar_pedido_ba(p_pedido jsonb, p_empleado_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_item jsonb;
  v_talle jsonb;
  v_modelo_id uuid;
  v_nuevos integer := 0;
  v_existentes integer := 0;
  v_pares integer := 0;
  v_cant integer;
begin
  if coalesce(p_pedido->>'numero', '') = '' then
    raise exception 'El pedido no tiene número';
  end if;

  if exists (select 1 from stock_ba_pedidos where numero = p_pedido->>'numero') then
    return jsonb_build_object('ya_estaba', true, 'numero', p_pedido->>'numero');
  end if;

  insert into stock_ba_pedidos (numero, fecha, proveedor, unidades, total, archivo)
  values (
    p_pedido->>'numero',
    nullif(p_pedido->>'fecha', '')::date,
    p_pedido->>'proveedor',
    nullif(p_pedido->>'unidades', '')::integer,
    nullif(p_pedido->>'total', '')::numeric,
    p_pedido->>'archivo'
  )
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_pedido->'items', '[]'::jsonb)) loop
    select id into v_modelo_id from stock_ba_modelos where codigo = v_item->>'codigo';
    if v_modelo_id is null then
      insert into stock_ba_modelos (codigo, descripcion, foto_url, costo)
      values (v_item->>'codigo', v_item->>'descripcion', v_item->>'foto_url', nullif(v_item->>'costo', '')::numeric)
      returning id into v_modelo_id;
      v_nuevos := v_nuevos + 1;
    else
      -- El modelo ya existía: se le completa la foto si no tenía, y queda el último costo.
      update stock_ba_modelos
         set foto_url = coalesce(foto_url, v_item->>'foto_url'),
             costo = coalesce(nullif(v_item->>'costo', '')::numeric, costo)
       where id = v_modelo_id;
      v_existentes := v_existentes + 1;
    end if;

    for v_talle in select * from jsonb_array_elements(coalesce(v_item->'talles', '[]'::jsonb)) loop
      v_cant := (v_talle->>'cantidad')::integer;
      if v_cant > 0 then
        insert into stock_ba_talles (modelo_id, talle, cantidad)
        values (v_modelo_id, v_talle->>'talle', v_cant)
        on conflict (modelo_id, talle) do update set cantidad = stock_ba_talles.cantidad + excluded.cantidad;

        insert into stock_ba_movimientos (modelo_id, talle, delta, motivo, pedido_id, empleado_id)
        values (v_modelo_id, v_talle->>'talle', v_cant, 'Pedido ' || (p_pedido->>'numero'), v_pedido_id, p_empleado_id);
        v_pares := v_pares + v_cant;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'ya_estaba', false, 'numero', p_pedido->>'numero',
    'modelos_nuevos', v_nuevos, 'modelos_existentes', v_existentes, 'pares', v_pares
  );
end;
$$;

-- Suma o resta pares de un talle (venta, envío, ajuste). Nunca deja el stock
-- por debajo de cero.
create or replace function public.ajustar_stock_ba(
  p_talle_id uuid, p_delta integer, p_motivo text, p_empleado_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modelo_id uuid;
  v_talle text;
  v_nueva integer;
begin
  update stock_ba_talles
     set cantidad = cantidad + p_delta
   where id = p_talle_id and cantidad + p_delta >= 0
  returning modelo_id, talle, cantidad into v_modelo_id, v_talle, v_nueva;

  if v_modelo_id is null then
    raise exception 'No hay pares suficientes en ese talle';
  end if;

  insert into stock_ba_movimientos (modelo_id, talle, delta, motivo, empleado_id)
  values (v_modelo_id, v_talle, p_delta, p_motivo, p_empleado_id);
  return v_nueva;
end;
$$;
