-- =========================================================
-- LC SALVA — BLINDAJE DE ACTIVACIÓN DE HARDWARE POR COMPRA
-- Migración: 20261110_activacion_hardware_por_compra.sql
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query > RUN
--
-- OBJETIVO:
-- 1. Elimina la vulnerabilidad de vinculación gratuita de hardware (QR / NFC).
-- 2. Exige obligatoriamente una compra aprobada (Wompi) en la tabla 'pedidos'
--    para poder activar cualquier Salva Band o Salva Watch.
-- 3. Valida compatibilidad de producto (Watch vs Band vs Pack Dúo) y cupo de unidades.
-- 4. Permite activación automática por correo o mediante el Código de Pedido.
-- 5. Mantiene bypass para la cuenta creadora (lee.fesna@gmail.com).
-- =========================================================

-- 1. ESTRUCTURA EN TABLA PEDIDOS
alter table public.pedidos add column if not exists email_cliente text;
alter table public.pedidos add column if not exists estado text not null default 'pendiente';
alter table public.pedidos add column if not exists cupo_dispositivos int not null default 1;
alter table public.pedidos add column if not exists codigo_activacion text;

create index if not exists pedidos_email_idx on public.pedidos (lower(email_cliente));
create index if not exists pedidos_codigo_idx on public.pedidos (codigo_pedido);
create index if not exists pedidos_estado_idx on public.pedidos (estado);

-- Actualizar cupo según modelo en pedidos existentes
update public.pedidos
set cupo_dispositivos = 2
where (modelo ilike '%duo%' or modelo ilike '%dúo%') and cupo_dispositivos < 2;

-- 2. ESTRUCTURA EN TABLA PULSERAS
alter table public.pulseras add column if not exists pedido_id bigint references public.pedidos(id) on delete set null;
alter table public.pulseras add column if not exists fecha_vinculacion timestamptz;
alter table public.pulseras add column if not exists activado_por_email text;

create index if not exists pulseras_pedido_id_idx on public.pulseras (pedido_id);

-- 3. FUNCIÓN RPC: VINCULAR PULSERA BLINDADA (CON VALIDACIÓN DE PAGO)
create or replace function public.vincular_pulsera(
  p_codigo_qr text,
  p_codigo_pedido text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_pulsera public.pulseras%rowtype;
  v_portador public.portadores%rowtype;
  v_pedido public.pedidos%rowtype;
  v_activadas int := 0;
  v_es_creador boolean := false;
  v_ref_pedido text := upper(trim(coalesce(p_codigo_pedido, '')));
  v_codigo_limpio text := upper(trim(p_codigo_qr));
begin
  if v_caller_id is null then
    raise exception 'Debes iniciar sesión para activar o vincular un dispositivo.';
  end if;

  -- Privilegio Creador / Master Admin
  if v_caller_email = 'lee.fesna@gmail.com' then
    v_es_creador := true;
  end if;

  -- A. Buscar y bloquear la pulsera
  select * into v_pulsera
  from public.pulseras
  where codigo_qr = v_codigo_limpio
  for update;

  if not found then
    raise exception 'El código % no corresponde a un dispositivo Salva oficial registrado.', v_codigo_limpio;
  end if;

  if v_pulsera.estado is distinct from 'disponible' then
    raise exception 'Este dispositivo ya se encuentra vinculado a una cuenta activa.';
  end if;

  -- B. Validación estricta de pago previo (para todos los usuarios regulares)
  if not v_es_creador then
    if v_ref_pedido <> '' then
      select * into v_pedido
      from public.pedidos
      where (
        codigo_pedido = v_ref_pedido
        or codigo_pedido = replace(v_ref_pedido, '-P1', '')
        or coalesce(codigo_activacion, '') = v_ref_pedido
      )
      and estado = 'pagado'
      order by created_at desc
      limit 1;
    else
      -- Búsqueda automática por correo del usuario autenticado
      select * into v_pedido
      from public.pedidos
      where lower(coalesce(email_cliente, '')) = v_caller_email
        and estado = 'pagado'
      order by created_at desc
      limit 1;
    end if;

    if not found or v_pedido.id is null then
      raise exception 'No encontramos un pago aprobado para este dispositivo. Ingresa el código de pedido de tu compra o comunícate con soporte si compraste con otro correo.';
    end if;

    -- C. Validación de compatibilidad hardware vs producto comprado
    if v_pulsera.codigo_qr ~ '^SALVA-W-' and not (v_pedido.modelo ilike '%watch%' or v_pedido.modelo ilike '%duo%' or v_pedido.modelo ilike '%dúo%') then
      raise exception 'Este código corresponde a una lámina Salva Watch, pero tu compra (%s) es para Salva Band.', v_pedido.modelo;
    end if;

    if v_pulsera.codigo_qr ~ '^SALVA-B-' and not (v_pedido.modelo ilike '%band%' or v_pedido.modelo ilike '%duo%' or v_pedido.modelo ilike '%dúo%') then
      raise exception 'Este código corresponde a una pulsera Salva Band, pero tu compra (%s) es para Salva Watch.', v_pedido.modelo;
    end if;

    -- D. Validación de cupo disponible del pedido
    select count(*) into v_activadas
    from public.pulseras
    where pedido_id = v_pedido.id;

    if v_activadas >= v_pedido.cupo_dispositivos then
      raise exception 'Este pedido (%) ya activó todos los dispositivos incluidos (% de %). Cada dispositivo físico requiere su propia compra oficial.', v_pedido.codigo_pedido, v_activadas, v_pedido.cupo_dispositivos;
    end if;
  end if;

  -- E. Crear el portador y vincular el hardware
  insert into public.portadores (
    pulsera_id, usuario_id, nombre_completo, contacto_emergencia_1_nombre, contacto_emergencia_1_telefono
  )
  values (
    v_pulsera.id, v_caller_id, 'Nuevo Portador', 'Contacto Principal', '0000000000'
  )
  returning * into v_portador;

  update public.pulseras
  set estado = 'vinculada',
      usuario_id = v_caller_id,
      pedido_id = case when v_es_creador and v_pedido.id is null then null else v_pedido.id end,
      activado_por_email = v_caller_email,
      fecha_vinculacion = now()
  where id = v_pulsera.id;

  return json_build_object(
    'portador', row_to_json(v_portador),
    'pulsera', json_build_object(
      'id', v_pulsera.id,
      'codigo_qr', v_pulsera.codigo_qr,
      'estado', 'vinculada',
      'tipo_plan', v_pulsera.tipo_plan
    )
  );
end $$;

revoke all on function public.vincular_pulsera(text, text) from public, anon;
grant execute on function public.vincular_pulsera(text, text) to authenticated;

-- 4. TRIGGER EN AUTH.USERS: REGISTRO BLINDADO
create or replace function public.exigir_pulsera_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo_pulsera text := upper(trim(coalesce(new.raw_user_meta_data ->> 'codigo_pulsera', '')));
  v_codigo_pedido text := upper(trim(coalesce(new.raw_user_meta_data ->> 'codigo_pedido', '')));
  v_user_email text := lower(coalesce(new.email, ''));
  v_pedido_id bigint;
  v_activadas int := 0;
  v_cupo int := 1;
begin
  if v_user_email = 'lee.fesna@gmail.com' then
    return new; -- Cuenta creadora exenta
  end if;

  -- A. Verificar existencia del código de hardware
  if v_codigo_pulsera = '' or not exists (
    select 1 from public.pulseras where codigo_qr = v_codigo_pulsera and estado = 'disponible'
  ) then
    raise exception 'Para registrarte necesitas el código de un dispositivo Salva oficial disponible.'
      using errcode = 'P0001';
  end if;

  -- B. Verificar compra aprobada
  if v_codigo_pedido <> '' then
    select id, cupo_dispositivos into v_pedido_id, v_cupo
    from public.pedidos
    where (
      codigo_pedido = v_codigo_pedido
      or codigo_pedido = replace(v_codigo_pedido, '-P1', '')
      or coalesce(codigo_activacion, '') = v_codigo_pedido
    )
    and estado = 'pagado'
    order by created_at desc
    limit 1;
  else
    select id, cupo_dispositivos into v_pedido_id, v_cupo
    from public.pedidos
    where lower(coalesce(email_cliente, '')) = v_user_email
      and estado = 'pagado'
    order by created_at desc
    limit 1;
  end if;

  if v_pedido_id is null then
    raise exception 'No encontramos una compra pagada asociada a este correo o código de pedido. Adquiere tu Salva en salva.lcsynctech.com antes de registrarte.'
      using errcode = 'P0002';
  end if;

  -- C. Verificar cupo disponible
  select count(*) into v_activadas
  from public.pulseras
  where pedido_id = v_pedido_id;

  if v_activadas >= v_cupo then
    raise exception 'Este pedido ya activó todos sus dispositivos comprados.'
      using errcode = 'P0003';
  end if;

  return new;
end $$;

drop trigger if exists exigir_pulsera_al_registrarse on auth.users;
create trigger exigir_pulsera_al_registrarse
  before insert on auth.users
  for each row execute function public.exigir_pulsera_al_registrarse();

-- 5. DESVINCULAR (libera el hardware y restaura su disponibilidad)
create or replace function public.desvincular_pulsera(p_pulsera_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  delete from public.portadores where pulsera_id = p_pulsera_id and usuario_id = auth.uid();
  if not found and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'lee.fesna@gmail.com' then
    raise exception 'Este dispositivo no está vinculado a tu cuenta.';
  end if;
  update public.pulseras set estado = 'disponible', usuario_id = null, pedido_id = null where id = p_pulsera_id;
  return true;
end $$;

revoke all on function public.desvincular_pulsera(uuid) from public, anon;
grant execute on function public.desvincular_pulsera(uuid) to authenticated;
