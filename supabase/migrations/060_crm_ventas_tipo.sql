-- Ventas del CRM ('chat': se cerró por WhatsApp) separadas de los pedidos de la
-- web que solo mandan el comprobante por WhatsApp ('web'): esos no cuentan como
-- ventas del CRM, se muestran aparte.
alter table public.crm_ventas add column if not exists tipo text not null default 'chat' check (tipo in ('chat', 'web'));
