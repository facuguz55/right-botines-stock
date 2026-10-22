-- El bot aprende solo de todo lo que Right contesta desde el CRM (Facu, 21/10):
-- no hace falta aprobar. Lo que ya estaba "para revisar" pasa a aprendido,
-- salvo los casos sin texto del cliente (solo foto o audio), que no sirven
-- para buscar casos parecidos.

update crm_aprendizajes
   set estado = 'descartado', revisado_en = now()
 where estado = 'pendiente' and pregunta !~* '[[:alnum:]]{4,}';

update crm_aprendizajes
   set estado = 'aprobado',
       respuesta_aprobada = respuesta_humano,
       mensajes_aprobados = coalesce(mensajes_humano, jsonb_build_array(respuesta_humano)),
       revisado_en = coalesce(revisado_en, created_at)
 where estado = 'pendiente' and respuesta_humano is not null;
