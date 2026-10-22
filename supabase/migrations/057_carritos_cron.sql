-- Cron de carritos: enviar cada 2 h (min 15) y conversiones cada 6 h (min 45).
create or replace function privado.carritos_llamar(p_accion text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://xpzkotmxetyofbrizvny.supabase.co/functions/v1/carritos?accion=' || p_accion,
    headers := jsonb_build_object('Authorization', 'Bearer ' || privado.secreto('carritos_cron'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb, timeout_milliseconds := 120000) into v_id;
  return v_id;
end $$;
revoke all on function privado.carritos_llamar(text) from public, anon, authenticated;
select cron.schedule('carritos-enviar', '15 */2 * * *', $$select privado.carritos_llamar('enviar')$$);
select cron.schedule('carritos-conversiones', '45 */6 * * *', $$select privado.carritos_llamar('conversiones')$$);
