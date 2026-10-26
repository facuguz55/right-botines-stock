-- Estado de entrega de los mensajes que se mandan desde el CRM: Meta avisa por
-- el webhook (statuses) si el mensaje salió, llegó al celular del cliente, lo
-- vio (tilde azul) o falló (y por qué). Hasta ahora se descartaban.
alter table public.wsp_mensajes
  add column if not exists wa_estado text check (wa_estado in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists wa_estado_at timestamptz,
  add column if not exists wa_error text;

comment on column public.wsp_mensajes.wa_estado is 'Último estado que informó Meta: sent, delivered, read o failed. Null = todavía no llegó ningún aviso.';
comment on column public.wsp_mensajes.wa_error is 'Si falló: "codigo: mensaje" que devolvió Meta.';
