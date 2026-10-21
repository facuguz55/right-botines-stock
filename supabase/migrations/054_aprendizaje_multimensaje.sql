-- Aprendizaje del bot en varios mensajes (como contesta Cami: 2 a 4 mensajes
-- cortos seguidos) y lo que se manda tal cual lo que sugirió el bot no pasa por
-- la cola de revisión: ya cuenta como aprobado.

alter table wsp_ia_sugerencias add column if not exists mensajes_sugeridos jsonb;

alter table crm_aprendizajes
  add column if not exists mensajes_bot jsonb,
  add column if not exists mensajes_humano jsonb,
  add column if not exists mensajes_aprobados jsonb;

update crm_aprendizajes
   set estado = 'aprobado',
       respuesta_aprobada = respuesta_humano,
       mensajes_aprobados = jsonb_build_array(respuesta_humano),
       revisado_en = now()
 where origen = 'usada' and estado = 'pendiente' and respuesta_humano is not null;
