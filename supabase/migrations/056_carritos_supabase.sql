-- Carritos abandonados de Right en Supabase (reemplaza los 3 flujos de n8n).
-- Usa las mismas tablas que ya lee la app (emails_enviados, clicks_tracking, conversiones).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- Configuración (solo la lee la función con la service role; sin políticas = nadie más).
create table if not exists public.carritos_config (clave text primary key, valor text not null);
alter table public.carritos_config enable row level security;
insert into public.carritos_config (clave, valor) values
  ('modo', 'prueba'),                                   -- apagado | prueba | real
  ('prueba_a', 'facundoiguzman1@gmail.com'),            -- en prueba todos los mails van acá y no se anotan
  ('remitente', 'Right Botines <hola@right.com.ar>'),
  ('responder_a', 'rightcontacto@gmail.com'),
  ('horas_min', '1'),                                   -- no escribir antes de 1 h (puede estar comprando)
  ('horas_max', '72'),                                  -- carritos de hasta 3 días
  ('tope_por_vuelta', '20')
on conflict (clave) do nothing;

-- Los envíos que n8n anotó desde el 9/10 nunca llegaron (el destinatario estaba fijo a Facu):
-- se marcan para que no bloqueen un mail real.
alter table public.emails_enviados add column if not exists llego boolean not null default true;
update public.emails_enviados set llego = false where fecha >= '2026-10-09' and client_id = 'right-botines';

-- Secretos en el vault (token de Tiendanube, Resend y la clave del cron); la función los pide por acá.
create or replace function privado.secreto(p_nombre text) returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nombre
$$;
revoke all on function privado.secreto(text) from public, anon, authenticated;
grant usage on schema privado to service_role;
grant execute on function privado.secreto(text) to service_role;

create or replace function public.carritos_secreto(p_nombre text) returns text
language sql security definer set search_path = '' as $$ select privado.secreto(p_nombre) $$;
revoke all on function public.carritos_secreto(text) from public, anon, authenticated;
grant execute on function public.carritos_secreto(text) to service_role;

-- Lo que anote n8n mientras siga prendido (sin la columna) no bloquea un mail real.
alter table public.emails_enviados alter column llego set default false;
