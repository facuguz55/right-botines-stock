-- Menú de cada chat en la lista (mantener apretado / clic derecho), como en WhatsApp:
-- archivar, silenciar y bloquear. Todo es del CRM (no toca la cuenta de WhatsApp).
--  archivada: sale de la lista principal (se ve en "Archivados"); vuelve sola si el cliente escribe.
--  silenciada_hasta: sin notificación push ni sonido hasta esa fecha ("siempre" = año 2100).
--  bloqueada: se guardan sus mensajes pero no avisa, no sugiere ni contesta; se ve en "Bloqueados".
alter table wsp_conversaciones
  add column if not exists archivada boolean not null default false,
  add column if not exists silenciada_hasta timestamptz,
  add column if not exists bloqueada boolean not null default false;

-- Eliminar un chat no tiene que borrar lo que el bot aprendió de él.
alter table crm_aprendizajes alter column conversacion_id drop not null;
alter table crm_aprendizajes drop constraint if exists crm_aprendizajes_conversacion_id_fkey;
alter table crm_aprendizajes
  add constraint crm_aprendizajes_conversacion_id_fkey
  foreign key (conversacion_id) references wsp_conversaciones(id) on delete set null;
