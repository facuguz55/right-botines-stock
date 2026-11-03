-- Qué muestra cada foto que manda un cliente (la describe la IA al llegar: "botín
-- Nike Mercurial naranja", "comprobante de transferencia", "captura de chat"...).
-- Sirve para que el bot sepa de qué foto se habla cuando después el cliente dice
-- "ese modelo", "esos", "quiero este", sin tener que volver a mirar la imagen.
alter table public.wsp_mensajes
  add column if not exists imagen_descripcion text;

comment on column public.wsp_mensajes.imagen_descripcion is 'Descripción corta de la foto del cliente, armada por la IA al recibirla.';
