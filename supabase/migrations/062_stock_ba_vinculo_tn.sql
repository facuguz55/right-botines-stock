-- Vínculo entre un modelo del Stock Buenos Aires y un producto de Tienda Nube.
--
-- Cuando un modelo está vinculado, Tienda Nube y este stock son lo mismo: lo
-- que se vende en la tienda baja acá (llega por el webhook de producto) y lo
-- que se descuenta acá baja en la tienda (lo empuja la app). Ese producto deja
-- de entrar al stock del local.

alter table public.stock_ba_modelos add column if not exists tn_product_id bigint unique;
alter table public.stock_ba_talles add column if not exists tn_variant_id bigint;

-- Fija las cantidades de un modelo vinculado según el stock que tiene la
-- tienda. p_talles: [{ talle: "41", cantidad: 3, variant_id: 123 }].
-- Devuelve false si ese producto no está vinculado a ningún modelo.
create or replace function public.sincronizar_stock_ba_tn(p_tn_product_id bigint, p_talles jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modelo_id uuid;
  v_t jsonb;
  v_nueva integer;
  v_actual integer;
begin
  select id into v_modelo_id from stock_ba_modelos where tn_product_id = p_tn_product_id;
  if v_modelo_id is null then
    return false;
  end if;

  for v_t in select * from jsonb_array_elements(coalesce(p_talles, '[]'::jsonb)) loop
    v_nueva := greatest(0, coalesce((v_t->>'cantidad')::integer, 0));
    select cantidad into v_actual from stock_ba_talles
     where modelo_id = v_modelo_id and talle = v_t->>'talle';

    if v_actual is null then
      insert into stock_ba_talles (modelo_id, talle, cantidad, tn_variant_id)
      values (v_modelo_id, v_t->>'talle', v_nueva, nullif(v_t->>'variant_id', '')::bigint);
      if v_nueva > 0 then
        insert into stock_ba_movimientos (modelo_id, talle, delta, motivo)
        values (v_modelo_id, v_t->>'talle', v_nueva, 'Tienda Nube');
      end if;
    else
      update stock_ba_talles
         set cantidad = v_nueva,
             tn_variant_id = coalesce(nullif(v_t->>'variant_id', '')::bigint, tn_variant_id)
       where modelo_id = v_modelo_id and talle = v_t->>'talle';
      if v_nueva <> v_actual then
        insert into stock_ba_movimientos (modelo_id, talle, delta, motivo)
        values (v_modelo_id, v_t->>'talle', v_nueva - v_actual, 'Tienda Nube');
      end if;
    end if;
  end loop;
  return true;
end;
$$;
