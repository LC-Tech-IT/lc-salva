-- Salva — Desarrollado y respaldado por LC Tech
-- Salva Cloud Familiar: membresías, paywall en servidor, Red Multi-Tutor,
-- Bóveda Médica (bucket privado) y Geocercas.
-- Ejecutar en Supabase > SQL Editor. Es idempotente: se puede correr más de una vez.

-- =========================================================
-- 1. MEMBRESÍAS (solo el backend / service_role las escribe)
-- =========================================================
create table if not exists public.membresias_cloud (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  activa boolean not null default false,
  plan text check (plan in ('mensual', 'anual', 'checkout_anual', 'cortesia')),
  vence_en timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.membresias_cloud enable row level security;
drop policy if exists "usuario lee su membresia" on public.membresias_cloud;
create policy "usuario lee su membresia" on public.membresias_cloud
  for select to authenticated using (usuario_id = auth.uid());
-- Sin políticas de insert/update/delete: un cliente no puede auto-activarse la membresía.

-- =========================================================
-- 2. FUNCIÓN CENTRAL DEL PAYWALL
--    Creador vitalicio (correo VERIFICADO) o membresía vigente.
-- =========================================================
create or replace function public.tiene_salva_cloud()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'lee.fesna@gmail.com'
  ) or exists (
    select 1 from public.membresias_cloud m
    where m.usuario_id = auth.uid()
      and m.activa
      and (m.vence_en is null or m.vence_en > now())
  );
$$;
revoke all on function public.tiene_salva_cloud() from public, anon;
grant execute on function public.tiene_salva_cloud() to authenticated;

-- =========================================================
-- 3. RED MULTI-TUTOR (máximo 5 por cuenta)
-- =========================================================
create table if not exists public.red_tutores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 120),
  parentesco text,
  telefono text not null check (telefono ~ '^\+[0-9]{8,15}$'),
  email text,
  notificar_whatsapp boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists red_tutores_usuario_idx on public.red_tutores (usuario_id);

create or replace function public.limitar_red_tutores()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.red_tutores where usuario_id = new.usuario_id) >= 5 then
    raise exception 'La Red Multi-Tutor admite máximo 5 tutores por cuenta.';
  end if;
  return new;
end $$;
drop trigger if exists red_tutores_maximo on public.red_tutores;
create trigger red_tutores_maximo before insert on public.red_tutores
  for each row execute function public.limitar_red_tutores();

alter table public.red_tutores enable row level security;
drop policy if exists "dueño gestiona su red" on public.red_tutores;
create policy "dueño gestiona su red" on public.red_tutores
  for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- =========================================================
-- 4. BÓVEDA MÉDICA (tabla existente) + bucket privado
-- =========================================================
alter table public.boveda_medica enable row level security;
drop policy if exists "dueño gestiona su boveda" on public.boveda_medica;
create policy "dueño gestiona su boveda" on public.boveda_medica
  for all to authenticated
  using (exists (select 1 from public.portadores p where p.id = boveda_medica.portador_id and p.usuario_id = auth.uid()))
  with check (exists (select 1 from public.portadores p where p.id = boveda_medica.portador_id and p.usuario_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boveda_medica', 'boveda_medica', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Archivos en <usuario_id>/<portador_id>/<archivo>; solo el dueño con Salva Cloud
drop policy if exists "boveda: dueño con salva cloud" on storage.objects;
create policy "boveda: dueño con salva cloud" on storage.objects
  for all to authenticated
  using (bucket_id = 'boveda_medica' and (storage.foldername(name))[1] = auth.uid()::text and public.tiene_salva_cloud())
  with check (bucket_id = 'boveda_medica' and (storage.foldername(name))[1] = auth.uid()::text and public.tiene_salva_cloud());

-- =========================================================
-- 5. GEOCERCAS (tabla existente)
-- =========================================================
alter table public.geocercas drop constraint if exists geocercas_radio_chk;
alter table public.geocercas add constraint geocercas_radio_chk
  check (radio_metros between 100 and 1000) not valid;

alter table public.geocercas enable row level security;
drop policy if exists "dueño gestiona sus geocercas" on public.geocercas;
create policy "dueño gestiona sus geocercas" on public.geocercas
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and exists (select 1 from public.portadores p where p.pulsera_id = geocercas.pulsera_id and p.usuario_id = auth.uid())
  );

-- =========================================================
-- 6. PAYWALL ESTRICTO EN SERVIDOR
--    Políticas RESTRICTIVE: se suman (AND) a cualquier política existente,
--    así ningún cliente sin membresía puede leer ni escribir estos módulos.
-- =========================================================
drop policy if exists "paywall salva cloud" on public.red_tutores;
create policy "paywall salva cloud" on public.red_tutores as restrictive
  for all to authenticated using (public.tiene_salva_cloud()) with check (public.tiene_salva_cloud());

drop policy if exists "paywall salva cloud" on public.boveda_medica;
create policy "paywall salva cloud" on public.boveda_medica as restrictive
  for all to authenticated using (public.tiene_salva_cloud()) with check (public.tiene_salva_cloud());

drop policy if exists "paywall salva cloud" on public.geocercas;
create policy "paywall salva cloud" on public.geocercas as restrictive
  for all to authenticated using (public.tiene_salva_cloud()) with check (public.tiene_salva_cloud());

-- Anónimos: sin acceso a ninguno de los tres módulos
revoke all on public.red_tutores, public.boveda_medica, public.geocercas, public.membresias_cloud from anon;
