-- LC Salva — La ubicación compartida tarde también llega a la familia.
-- Antes: tras un aviso sin GPS, el límite de 60 s descartaba el segundo envío con
-- el mapa (cuando quien escanea activa la ubicación después o toca "Compartir ubicación").
-- Ahora: dentro de esos 60 s se admite UN registro adicional solo si trae coordenadas
-- y aún no se había enviado ninguna. Sigue habiendo máximo 2 avisos por minuto por pieza.

create or replace function public.registrar_escaneo(
  p_codigo_qr text, p_latitud double precision default null,
  p_longitud double precision default null, p_precision real default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pulsera uuid;
begin
  select pu.id into v_pulsera
  from public.pulseras pu
  join public.portadores po on po.pulsera_id = pu.id
  where pu.codigo_qr = p_codigo_qr
  limit 1;

  if v_pulsera is null then return false; end if;

  if p_latitud is not null and (p_latitud not between -90 and 90 or p_longitud is null or p_longitud not between -180 and 180) then
    p_latitud := null; p_longitud := null;
  end if;

  if exists (select 1 from public.escaneos_ubicacion
             where pulsera_id = v_pulsera and created_at > now() - interval '60 seconds') then
    -- Única excepción: llega el GPS y en ese minuto solo hubo avisos sin ubicación
    if p_latitud is null or exists (select 1 from public.escaneos_ubicacion
                                     where pulsera_id = v_pulsera and created_at > now() - interval '60 seconds'
                                       and latitud is not null) then
      return false;
    end if;
  end if;

  insert into public.escaneos_ubicacion (pulsera_id, latitud, longitud, precision_metros)
  values (v_pulsera, p_latitud, p_longitud, p_precision);
  return true;
end $$;

revoke all on function public.registrar_escaneo(text, double precision, double precision, real) from public;
grant execute on function public.registrar_escaneo(text, double precision, double precision, real) to anon, authenticated;
