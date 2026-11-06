-- Salva — Desarrollado y respaldado por LC Tech
-- Cierre de seguridad para el lanzamiento (Ley 1581 de 2012).
-- Hallazgos de la auditoría del 2026-11-06:
--   1. Cualquiera, sin iniciar sesión, podía LEER la tabla pedidos (nombre, celular y dirección de cada cliente).
--   2. Cualquier cuenta registrada podía MODIFICAR cualquier pulsera (política "pulseras_update_auth" using true).
--   3. telemetria_gps y eventos_sos (tablas heredadas) se podían leer sin iniciar sesión.
-- Ejecutar en Supabase > SQL Editor. Es idempotente y no borra datos.
-- El checkout sigue pudiendo CREAR pedidos; el panel y la ficha usan funciones RPC que no cambian.

-- =========================================================
-- 1. PEDIDOS: solo se pueden crear desde la landing; nadie los lee por la API pública.
--    Los pedidos se consultan en Supabase > Table Editor (rol de servicio).
-- =========================================================
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pedidos' and cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on public.pedidos', r.policyname);
  end loop;
end $$;

alter table public.pedidos enable row level security;
revoke select, update, delete on public.pedidos from anon, authenticated;
grant insert on public.pedidos to anon, authenticated;

drop policy if exists "pedidos_insert_public" on public.pedidos;
create policy "pedidos_insert_public" on public.pedidos for insert to anon, authenticated with check (true);

-- =========================================================
-- 2. PULSERAS: solo las funciones vincular_pulsera / desvincular_pulsera (security definer) cambian su estado.
-- =========================================================
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pulseras' and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy %I on public.pulseras', r.policyname);
  end loop;
end $$;

revoke insert, update, delete on public.pulseras from anon, authenticated;

-- =========================================================
-- 3. TABLAS HEREDADAS (hardware con batería retirado): sin lectura anónima.
-- =========================================================
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('telemetria_gps', 'eventos_sos')
      and cmd in ('SELECT', 'ALL', 'UPDATE')
      and (qual is null or btrim(qual) in ('true', '(true)'))
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke select, update, delete on public.telemetria_gps, public.eventos_sos from anon;

-- =========================================================
-- 4. Limpieza: pedido de prueba creado durante las pruebas de Gemini
-- =========================================================
delete from public.pedidos where codigo_pedido like 'SALVA-TEST-%';
