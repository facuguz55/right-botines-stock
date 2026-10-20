-- Mensajes automáticos del CRM: bienvenida (cliente nuevo o que vuelve a escribir
-- después de un rato) y ausencia (fuera del horario del local). Empiezan apagados;
-- se prenden poniendo activo = true. Solo los lee el webhook con la clave de servicio.
create table if not exists public.crm_mensajes_auto (
  clave text primary key check (clave in ('bienvenida', 'ausencia')),
  activo boolean not null default false,
  texto text not null,
  updated_at timestamptz not null default now()
);
alter table public.crm_mensajes_auto enable row level security;

insert into public.crm_mensajes_auto (clave, activo, texto) values
  ('bienvenida', false, 'Hola buenas! Gracias por escribirnos a Right Botines. En un momento te respondemos. Si ya sabés qué buscás, contanos el talle y para qué cancha (fútbol 11, fútbol 5 o futsal) y vamos adelantando.'),
  ('ausencia', false, 'Hola buenas! Ahora no estamos atendiendo. Nuestro horario es de lunes a viernes de 9 a 13 y de 16 a 20 hs, y sábados de 9 a 13 hs. Dejanos tu consulta y apenas volvemos te respondemos.')
on conflict (clave) do nothing;

alter table public.wsp_mensajes add column if not exists automatico text;
comment on column public.wsp_mensajes.automatico is 'bienvenida o ausencia cuando el mensaje lo mandó el CRM solo';
