-- PIN del dueño: cerrar dos agujeros.
--
-- 1) set_owner_pin(new_pin) cambiaba el PIN sin pedir el actual, y se puede
--    llamar con la clave pública de la app (anon): cualquiera podía quedarse
--    con el acceso de dueño (borrar ventas, bloquear la app, habilitar
--    dispositivos para el proxy de TiendaNube). Ahora pide el PIN actual y
--    usa el mismo control con límite de intentos que habilitar_dispositivo
--    (046): 5 fallidos en 15 minutos bloquean.
-- 2) verify_owner_pin no tenía límite: un PIN de 4 dígitos se adivina
--    probando. Ahora, con 5 intentos fallidos en 15 minutos devuelve false
--    aunque el PIN sea correcto (el dueño espera 15 minutos). Cada fallo se
--    anota en intentos_acceso_fallidos (la campanita del dueño).

create or replace function verify_owner_pin(pin_input text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return verificar_pin_dueno_con_limite(pin_input) is null;
end;
$$;

drop function if exists set_owner_pin(text);

-- Devuelve { ok } o { ok: false, error }. No tira excepción ante un PIN
-- incorrecto a propósito (ver verificar_pin_dueno_con_limite).
create or replace function set_owner_pin(current_pin text, new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_error text := verificar_pin_dueno_con_limite(current_pin);
begin
  if v_error is not null then
    return jsonb_build_object('ok', false, 'error', v_error);
  end if;
  if new_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'El PIN debe tener exactamente 4 dígitos');
  end if;
  update app_settings set owner_pin = new_pin, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;
