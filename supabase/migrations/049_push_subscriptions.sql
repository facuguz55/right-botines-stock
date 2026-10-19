-- Dispositivos que reciben notificaciones push del CRM (mensajes nuevos de WhatsApp).
-- Solo accede la clave de servicio desde las funciones de Vercel: RLS activo sin políticas.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  nombre text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
