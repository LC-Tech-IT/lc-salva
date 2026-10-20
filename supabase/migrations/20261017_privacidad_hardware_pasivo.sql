-- Salva — Desarrollado y respaldado por LC Tech
-- Reorientación a hardware 100% pasivo (Salva Band / Salva Watch) y blindaje de privacidad (Ley 1581 de 2012).
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 20261016_salva_cloud.sql. Es idempotente.

-- =========================================================
-- 1. FICHA PÚBLICA: solo la pulsera cuyo QR exacto se consulta
-- =========================================================
create or replace function public.obtener_ficha_publica(p_codigo_qr text, p_id uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resultado json;
begin
  select json_build_object(
    'id', pu.id,
    'codigo_qr', pu.codigo_qr,
    'tipo_plan', pu.tipo_plan,
    'estado', pu.estado,
    'portador', case when po.id is null then null else json_build_object(
      'nombre_completo', po.nombre_completo,
      'tipo_sangre', po.tipo_sangre,
      'alergias', po.alergias,
      'enfermedades_condiciones', po.enfermedades_condiciones,
      'medicamentos', po.medicamentos,
      'eps_seguro', po.eps_seguro,
      'foto_url', po.foto_url,
      'contacto_1_nombre', po.contacto_emergencia_1_nombre,
      'contacto_1_telefono', po.contacto_emergencia_1_telefono,
      'contacto_2_nombre', po.contacto_emergencia_2_nombre,
      'contacto_2_telefono', po.contacto_emergencia_2_telefono,
      'notas_adicionales', po.notas_adicionales
    ) end
  ) into v_resultado
  from public.pulseras pu
  left join public.portadores po on po.pulsera_id = pu.id
  where (p_codigo_qr is not null and pu.codigo_qr = p_codigo_qr)
     or (p_codigo_qr is null and p_id is not null and pu.id = p_id)
  limit 1;

  return v_resultado;
end $$;
revoke all on function public.obtener_ficha_publica(text, uuid) from public;
grant execute on function public.obtener_ficha_publica(text, uuid) to anon, authenticated;

-- =========================================================
-- 2. REGISTRO DE ESCANEO (anónimo, validado y con freno anti-spam)
-- =========================================================
alter table public.escaneos_ubicacion alter column latitud drop not null;
alter table public.escaneos_ubicacion alter column longitud drop not null;

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

  -- Máximo un registro por pulsera cada 60 s (evita inundar a la familia de alertas)
  if exists (select 1 from public.escaneos_ubicacion
             where pulsera_id = v_pulsera and created_at > now() - interval '60 seconds') then
    return false;
  end if;

  if p_latitud is not null and (p_latitud not between -90 and 90 or p_longitud not between -180 and 180) then
    p_latitud := null; p_longitud := null;
  end if;

  insert into public.escaneos_ubicacion (pulsera_id, latitud, longitud, precision_metros)
  values (v_pulsera, p_latitud, p_longitud, p_precision);
  return true;
end $$;
revoke all on function public.registrar_escaneo(text, double precision, double precision, real) from public;
grant execute on function public.registrar_escaneo(text, double precision, double precision, real) to anon, authenticated;

-- =========================================================
-- 3. VINCULAR PULSERA (el tutor ya no necesita leer la tabla completa)
-- =========================================================
create or replace function public.vincular_pulsera(p_codigo_qr text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pulsera public.pulseras%rowtype;
  v_portador public.portadores%rowtype;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;

  select * into v_pulsera from public.pulseras where codigo_qr = upper(trim(p_codigo_qr)) for update;
  if not found then raise exception 'No encontramos una pulsera con ese código.'; end if;
  if v_pulsera.estado is distinct from 'disponible' then raise exception 'Esta pulsera ya está vinculada a una cuenta.'; end if;

  insert into public.portadores (pulsera_id, usuario_id, nombre_completo, contacto_emergencia_1_nombre, contacto_emergencia_1_telefono)
  values (v_pulsera.id, auth.uid(), 'Nuevo Portador', 'Contacto Principal', '0000000000')
  returning * into v_portador;

  update public.pulseras set estado = 'vinculada', usuario_id = auth.uid() where id = v_pulsera.id;

  return json_build_object(
    'portador', row_to_json(v_portador),
    'pulsera', json_build_object('id', v_pulsera.id, 'codigo_qr', v_pulsera.codigo_qr, 'estado', 'vinculada', 'tipo_plan', v_pulsera.tipo_plan)
  );
end $$;
revoke all on function public.vincular_pulsera(text) from public, anon;
grant execute on function public.vincular_pulsera(text) to authenticated;

-- Desvincular: borra el portador del dueño y libera la pulsera para volver a vincularla
create or replace function public.desvincular_pulsera(p_pulsera_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  delete from public.portadores where pulsera_id = p_pulsera_id and usuario_id = auth.uid();
  if not found then raise exception 'Esta pulsera no está vinculada a tu cuenta.'; end if;
  update public.pulseras set estado = 'disponible', usuario_id = null where id = p_pulsera_id;
  return true;
end $$;
revoke all on function public.desvincular_pulsera(uuid) from public, anon;
grant execute on function public.desvincular_pulsera(uuid) to authenticated;

-- =========================================================
-- 4. CERRAR LECTURAS ANÓNIMAS / ABIERTAS (datos sensibles, Ley 1581)
--    Se eliminan las políticas SELECT/ALL que no filtran por usuario (using true o vacío).
-- =========================================================
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('portadores', 'pulseras', 'escaneos_ubicacion')
      and cmd in ('SELECT', 'ALL', 'INSERT')
      and (qual is null or btrim(qual) in ('true', '(true)'))
      and (with_check is null or btrim(with_check) in ('true', '(true)'))
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke select, insert, update, delete on public.portadores, public.pulseras, public.escaneos_ubicacion from anon;

alter table public.portadores enable row level security;
alter table public.pulseras enable row level security;
alter table public.escaneos_ubicacion enable row level security;

drop policy if exists "dueño gestiona sus portadores" on public.portadores;
create policy "dueño gestiona sus portadores" on public.portadores
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists "dueño lee sus pulseras" on public.pulseras;
create policy "dueño lee sus pulseras" on public.pulseras
  for select to authenticated
  using (usuario_id = auth.uid()
         or exists (select 1 from public.portadores p where p.pulsera_id = pulseras.id and p.usuario_id = auth.uid()));

drop policy if exists "dueño lee sus escaneos" on public.escaneos_ubicacion;
create policy "dueño lee sus escaneos" on public.escaneos_ubicacion
  for select to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = escaneos_ubicacion.pulsera_id and p.usuario_id = auth.uid()));

-- =========================================================
-- 5. LOTES: la convención anterior (V/A/P por plan activo) ya no aplica.
--    Nuevos lotes: SALVA-B-xxxx (Salva Band) y SALVA-W-xxxx (Salva Watch).
-- =========================================================
alter table public.pulseras drop constraint if exists pulseras_lote_plan_chk;

-- =========================================================
-- 6. AVISO AUTOMÁTICO POR WHATSAPP
--    En Supabase > Database > Webhooks crea uno sobre INSERT en public.escaneos_ubicacion
--    que llame a la Edge Function "alerta-escaneo" con el header x-webhook-secret.
-- =========================================================
