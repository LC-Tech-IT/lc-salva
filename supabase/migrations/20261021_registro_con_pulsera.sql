-- Salva — Desarrollado y respaldado por LC Tech
-- Registro exclusivo con hardware: solo puede crear cuenta quien tenga el código
-- de una Salva Band / Salva Watch oficial en estado 'disponible'.
-- Excepción: la cuenta creadora lee.fesna@gmail.com.
-- Ejecutar en Supabase > SQL Editor. Es idempotente.

-- =========================================================
-- 1. Verificación pública del código (solo responde sí/no, no expone datos)
-- =========================================================
create or replace function public.verificar_codigo_pulsera(p_codigo_qr text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pulseras
    where codigo_qr = upper(trim(p_codigo_qr)) and estado = 'disponible'
  );
$$;
revoke all on function public.verificar_codigo_pulsera(text) from public;
grant execute on function public.verificar_codigo_pulsera(text) to anon, authenticated;

-- =========================================================
-- 2. Bloqueo en el servidor: ninguna cuenta nueva sin pulsera válida
--    (cubre también llamadas directas a la API de registro)
-- =========================================================
create or replace function public.exigir_pulsera_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(trim(coalesce(new.raw_user_meta_data ->> 'codigo_pulsera', '')));
begin
  if lower(coalesce(new.email, '')) = 'lee.fesna@gmail.com' then
    return new; -- cuenta creadora
  end if;

  if v_codigo = '' or not exists (
    select 1 from public.pulseras where codigo_qr = v_codigo and estado = 'disponible'
  ) then
    raise exception 'Para registrarte necesitas tener una pulsera o pasador Salva oficial.'
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists exigir_pulsera_al_registrarse on auth.users;
create trigger exigir_pulsera_al_registrarse
  before insert on auth.users
  for each row execute function public.exigir_pulsera_al_registrarse();

-- Nota: las cuentas que ya existen no se ven afectadas (el trigger solo actúa al crear).
-- Un registro NUEVO con Google no puede enviar el código, así que también se bloquea:
-- las personas nuevas deben usar "Crear Cuenta" con su código.
