-- CRM: archivos y fotos que el equipo manda desde el chat (rótulos de cambio,
-- comprobantes de devolución). Se suben desde la app a crm-media/salida/ y
-- Meta los baja por URL pública. Mismo esquema que fotos-botines: INSERT para
-- anon, pero solo dentro de la carpeta salida/ (el webhook usa service role
-- para lo que entra de los clientes).
create policy "crm_media_salida_upload"
  on storage.objects for insert to anon
  with check (bucket_id = 'crm-media' and name like 'salida/%');
