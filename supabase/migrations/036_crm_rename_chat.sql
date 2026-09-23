-- Permite renombrar un chat SOLO dentro del CRM, sin que el webhook lo pise
-- con el nombre de perfil de WhatsApp del contacto en cada mensaje nuevo
-- (eso sigue actualizando `nombre`, este campo aparte nunca lo toca).
alter table wsp_conversaciones add column if not exists nombre_personalizado text;
