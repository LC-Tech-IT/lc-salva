-- =========================================================
-- LC SALVA — ACTIVACIÓN DE HARDWARE SOLO POR COMPRA (v2, revisada)
-- Ejecutar en: Supabase > SQL Editor > New Query > RUN. Es idempotente.
--
-- Regla de negocio:
--   Un dispositivo (SALVA-B-xxxx / SALVA-W-xxxx) solo se activa si
--   1. fue ASIGNADO a un pedido al despacharlo (el QR queda atado a esa compra),
--   2. ese pedido está PAGADO (lo marca el webhook firmado de Wompi o tú a mano), y
--   3. quien activa escribe el CÓDIGO DE ACTIVACIÓN secreto que recibió el comprador.
--
-- Corrige la versión anterior de esta migración (nunca se ejecutó en producción):
--   * quedaba viva vincular_pulsera(text) de un argumento -> activación sin pago;
--   * cualquiera podía crear un pedido ya "pagado" desde la API pública;
--   * el correo sin verificar (autoconfirmación activa) bastaba para reclamar la compra de otro;
--   * el "código" era la referencia de pago, visible en el recibo de Wompi y en WhatsApp;
--   * cualquier compra podía activar cualquier pulsera (el QR no quedaba atado a la compra);
--   * desvincular devolvía el cupo y permitía activar pulseras ajenas en cadena;
--   * un pedido de Watch ($45.000) podía declararse "Pack Dúo" y activar 2 piezas.
-- =========================================================

-- 1. COLUMNAS ---------------------------------------------------------------
alter table public.pedidos add column if not exists email_cliente text;
alter table public.pedidos add column if not exists estado text not null default 'pendiente';
alter table public.pedidos add column if not exists producto_pagado text;          -- band | watch | pack (lo fija el monto cobrado)
alter table public.pedidos add column if not exists cupo_dispositivos int not null default 0;
alter table public.pedidos add column if not exists codigo_activacion text;        -- secreto, se genera al pagar

create unique index if not exists pedidos_codigo_activacion_uidx on public.pedidos (codigo_activacion) where codigo_activacion is not null;
create index if not exists pedidos_estado_idx on public.pedidos (estado);

alter table public.pulseras drop column if exists pedido_id cascade;
alter table public.pulseras add column if not exists pedido_id uuid references public.pedidos(id) on delete set null;
alter table public.pulseras add column if not exists fecha_vinculacion timestamptz;
alter table public.pulseras add column if not exists activado_por_email text;
create index if not exists pulseras_pedido_id_idx on public.pulseras (pedido_id);

-- Registro de intentos para frenar adivinanzas de códigos
create table if not exists public.intentos_activacion (
  id bigint generated always as identity primary key,
  usuario_id uuid not null,
  codigo_qr text,
  exito boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists intentos_activacion_usuario_idx on public.intentos_activacion (usuario_id, created_at desc);
alter table public.intentos_activacion enable row level security;
revoke all on public.intentos_activacion from anon, authenticated;

-- 2. PEDIDOS CREADOS DESDE LA WEB: nunca nacen pagados ---------------------
create or replace function public.pedidos_blindar_insercion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Lo que el navegador envíe en estos campos se ignora: solo el servidor los decide
  new.estado := 'pendiente';
  new.producto_pagado := null;
  new.cupo_dispositivos := 0;
  new.codigo_activacion := null;
  new.email_cliente := nullif(lower(trim(coalesce(new.email_cliente, ''))), '');
  return new;
end $$;

drop trigger if exists pedidos_blindar_insercion on public.pedidos;
create trigger pedidos_blindar_insercion
  before insert on public.pedidos
  for each row execute function public.pedidos_blindar_insercion();

-- 3. AL PASAR A "pagado": producto y cupo según el MONTO, y código secreto ----
create or replace function public.pedidos_al_pagar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin 0/O/1/I/L para dictarlo sin errores
  v_bytes bytea;
  v_codigo text;
  i int;
begin
  if new.estado = 'pagado' and coalesce(old.estado, '') <> 'pagado' then
    -- Si nadie fijó el producto (pago manual), se deduce del total
    if new.producto_pagado is null then
      new.producto_pagado := case
        when new.total_cop in (45000, 94000) then 'watch'
        when new.total_cop in (59000, 108000) then 'band'
        when new.total_cop in (89000, 138000) then 'pack'
        else null end;
    end if;
    new.cupo_dispositivos := case new.producto_pagado when 'pack' then 2 when 'band' then 1 when 'watch' then 1 else 0 end;

    if new.codigo_activacion is null then
      loop
        v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
        v_codigo := '';
        for i in 0..9 loop
          v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % length(v_alfabeto)) + 1, 1);
        end loop;
        v_codigo := substr(v_codigo, 1, 5) || '-' || substr(v_codigo, 6, 5); -- ej: K7Q2M-9XMPA
        exit when not exists (select 1 from public.pedidos where codigo_activacion = v_codigo);
      end loop;
      new.codigo_activacion := v_codigo;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists pedidos_al_pagar on public.pedidos;
create trigger pedidos_al_pagar
  before update on public.pedidos
  for each row execute function public.pedidos_al_pagar();

-- 4. ASIGNAR LOS QR FÍSICOS A UNA COMPRA (se usa al despachar, desde el SQL Editor)
--    select public.asignar_dispositivos('SALVA-MW5IXE901D26', array['SALVA-W-T005']);
create or replace function public.asignar_dispositivos(p_codigo_pedido text, p_codigos_qr text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_qr text;
  v_pulsera public.pulseras%rowtype;
  v_ya int;
  v_band int := 0;
  v_watch int := 0;
begin
  select * into v_pedido from public.pedidos
  where codigo_pedido = upper(trim(regexp_replace(p_codigo_pedido, '-P\d+$', ''))) for update;
  if not found then raise exception 'No existe el pedido %.', p_codigo_pedido; end if;
  if v_pedido.estado <> 'pagado' then raise exception 'El pedido % no está pagado (estado: %).', v_pedido.codigo_pedido, v_pedido.estado; end if;

  select count(*) into v_ya from public.pulseras where pedido_id = v_pedido.id;
  if v_ya + coalesce(array_length(p_codigos_qr, 1), 0) > v_pedido.cupo_dispositivos then
    raise exception 'El pedido % permite % dispositivo(s) y ya tiene %.', v_pedido.codigo_pedido, v_pedido.cupo_dispositivos, v_ya;
  end if;

  foreach v_qr in array p_codigos_qr loop
    select * into v_pulsera from public.pulseras where codigo_qr = upper(trim(v_qr)) for update;
    if not found then raise exception 'El código % no existe.', v_qr; end if;
    if v_pulsera.estado <> 'disponible' or v_pulsera.pedido_id is not null then
      raise exception 'El código % ya está asignado o activado.', v_pulsera.codigo_qr;
    end if;
    if v_pulsera.codigo_qr like 'SALVA-W-%' then v_watch := v_watch + 1; else v_band := v_band + 1; end if;
    update public.pulseras set pedido_id = v_pedido.id where id = v_pulsera.id;
  end loop;

  -- El tipo físico debe coincidir con lo pagado
  if (v_pedido.producto_pagado = 'watch' and v_band > 0)
     or (v_pedido.producto_pagado = 'band' and v_watch > 0)
     or (v_pedido.producto_pagado = 'pack' and (v_band > 1 or v_watch > 1)) then
    raise exception 'Los códigos no coinciden con lo comprado (%).', v_pedido.producto_pagado;
  end if;

  return 'Asignados a ' || v_pedido.codigo_pedido || '. Código de activación del cliente: ' || v_pedido.codigo_activacion;
end $$;
revoke all on function public.asignar_dispositivos(text, text[]) from public, anon, authenticated;

-- 5. ACTIVAR (vincular) -------------------------------------------------------
-- Se elimina la versión de un argumento: era la puerta de activación sin pago.
drop function if exists public.vincular_pulsera(text);
drop function if exists public.vincular_pulsera(text, text);

create or replace function public.es_cuenta_creadora()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid() and lower(email) = 'lee.fesna@gmail.com' and email_confirmed_at is not null
  );
$$;
revoke all on function public.es_cuenta_creadora() from public, anon;
grant execute on function public.es_cuenta_creadora() to authenticated;

-- Devuelve {error: "..."} en vez de lanzar excepción para que el intento fallido quede registrado
create or replace function public.vincular_pulsera(p_codigo_qr text, p_codigo_activacion text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creador boolean := public.es_cuenta_creadora();
  v_qr text := upper(trim(coalesce(p_codigo_qr, '')));
  v_clave text := upper(regexp_replace(coalesce(p_codigo_activacion, ''), '[^A-Za-z0-9]', '', 'g'));
  v_pulsera public.pulseras%rowtype;
  v_pedido public.pedidos%rowtype;
  v_portador public.portadores%rowtype;
  v_fallos int;
begin
  if v_uid is null then return json_build_object('error', 'Debes iniciar sesión para activar tu dispositivo.'); end if;

  select count(*) into v_fallos from public.intentos_activacion
  where usuario_id = v_uid and not exito and created_at > now() - interval '1 hour';
  if v_fallos >= 8 and not v_creador then
    return json_build_object('error', 'Demasiados intentos fallidos. Espera una hora o escríbenos para ayudarte.');
  end if;

  select * into v_pulsera from public.pulseras where codigo_qr = v_qr for update;
  if not found then
    insert into public.intentos_activacion (usuario_id, codigo_qr) values (v_uid, left(v_qr, 40));
    return json_build_object('error', 'Ese código no corresponde a un dispositivo Salva oficial.');
  end if;
  if v_pulsera.estado is distinct from 'disponible' then
    return json_build_object('error', 'Este dispositivo ya está activado en una cuenta.');
  end if;

  if not v_creador then
    select * into v_pedido from public.pedidos where id = v_pulsera.pedido_id;
    if v_pulsera.pedido_id is null or not found or v_pedido.estado <> 'pagado' then
      insert into public.intentos_activacion (usuario_id, codigo_qr) values (v_uid, v_qr);
      return json_build_object('error', 'Este dispositivo no está asociado a una compra pagada. Si lo compraste, escríbenos con tu número de pedido.');
    end if;
    if v_clave = '' or v_clave <> replace(v_pedido.codigo_activacion, '-', '') then
      insert into public.intentos_activacion (usuario_id, codigo_qr) values (v_uid, v_qr);
      return json_build_object('error', 'El código de activación no es correcto. Lo encuentras en el correo de confirmación de tu compra.');
    end if;
  end if;

  insert into public.portadores (pulsera_id, usuario_id, nombre_completo, contacto_emergencia_1_nombre, contacto_emergencia_1_telefono)
  values (v_pulsera.id, v_uid, 'Nuevo Portador', 'Contacto Principal', '0000000000')
  returning * into v_portador;

  update public.pulseras
  set estado = 'vinculada', usuario_id = v_uid, fecha_vinculacion = now(),
      activado_por_email = (select lower(email) from auth.users where id = v_uid)
  where id = v_pulsera.id;

  insert into public.intentos_activacion (usuario_id, codigo_qr, exito) values (v_uid, v_qr, true);

  return json_build_object(
    'portador', row_to_json(v_portador),
    'pulsera', json_build_object('id', v_pulsera.id, 'codigo_qr', v_pulsera.codigo_qr, 'estado', 'vinculada', 'tipo_plan', v_pulsera.tipo_plan)
  );
end $$;
revoke all on function public.vincular_pulsera(text, text) from public, anon;
grant execute on function public.vincular_pulsera(text, text) to authenticated;

-- 6. DESVINCULAR: la pieza sigue atada a SU compra (no libera cupo ni queda libre para otros)
create or replace function public.desvincular_pulsera(p_pulsera_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  delete from public.portadores where pulsera_id = p_pulsera_id and (usuario_id = auth.uid() or public.es_cuenta_creadora());
  if not found then raise exception 'Este dispositivo no está vinculado a tu cuenta.'; end if;
  -- pedido_id se conserva: para reactivarla se necesita de nuevo el código de activación de esa compra
  update public.pulseras set estado = 'disponible', usuario_id = null, fecha_vinculacion = null where id = p_pulsera_id;
  return true;
end $$;
revoke all on function public.desvincular_pulsera(uuid) from public, anon;
grant execute on function public.desvincular_pulsera(uuid) to authenticated;

-- 7. PORTADORES: nadie crea ni mueve una ficha hacia una pulsera que no activó.
--    (Antes, con una cuenta cualquiera, se podía insertar un portador para cualquier pulsera
--     directamente por la API, sin pasar por la activación: la ficha pública lo mostraba
--     y los escaneos disparaban alertas a los contactos del atacante.)
drop policy if exists "dueño gestiona sus portadores" on public.portadores;
create policy "dueño gestiona sus portadores" on public.portadores
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.pulseras p where p.id = pulsera_id and p.usuario_id = auth.uid() and p.estado = 'vinculada')
  );

-- Revisión (no borra nada): fichas cuya pulsera no está activada a nombre de su dueño.
-- Ejecuta este SELECT aparte; si aparece algo, revísalo antes de decidir.
--   select po.id, po.nombre_completo, p.codigo_qr, p.estado, p.usuario_id = po.usuario_id as mismo_duenio
--   from public.portadores po left join public.pulseras p on p.id = po.pulsera_id
--   where p.id is null or p.estado <> 'vinculada' or p.usuario_id is distinct from po.usuario_id;

-- 8. REGISTRO: solo con una pieza vendida (asignada a una compra pagada) y sin activar
create or replace function public.verificar_codigo_pulsera(p_codigo_qr text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pulseras pu join public.pedidos pe on pe.id = pu.pedido_id
    where pu.codigo_qr = upper(trim(p_codigo_qr)) and pu.estado = 'disponible' and pe.estado = 'pagado'
  );
$$;
revoke all on function public.verificar_codigo_pulsera(text) from public;
grant execute on function public.verificar_codigo_pulsera(text) to anon, authenticated;

create or replace function public.exigir_pulsera_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.email, '')) = 'lee.fesna@gmail.com' then return new; end if;
  if not public.verificar_codigo_pulsera(coalesce(new.raw_user_meta_data ->> 'codigo_pulsera', '')) then
    raise exception 'Para registrarte necesitas una pulsera o pasador Salva comprado y aún sin activar.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists exigir_pulsera_al_registrarse on auth.users;
create trigger exigir_pulsera_al_registrarse
  before insert on auth.users
  for each row execute function public.exigir_pulsera_al_registrarse();
