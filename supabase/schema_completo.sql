-- =========================================================
-- LC SALVA (LC Tech) — ESQUEMA COMPLETO PARA SUPABASE
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query > RUN
-- =========================================================

-- Habilitar extensión UUID
create extension if not exists "uuid-ossp";

-- 1. TABLA: PULSERAS (Control de Lotes y Hardware)
create table if not exists public.pulseras (
  id uuid primary key default gen_random_uuid(),
  codigo_qr text unique not null,
  estado text not null default 'disponible' check (estado in ('disponible', 'vinculada')),
  tipo_plan text not null default 'basica' check (tipo_plan in ('basica', 'premium', 'pro')),
  created_at timestamptz not null default now()
);

-- Regla de validación de prefijos de lote
alter table public.pulseras drop constraint if exists pulseras_lote_plan_chk;
alter table public.pulseras add constraint pulseras_lote_plan_chk check (
  codigo_qr !~ '^SALVA-[VAP]-'
  or (codigo_qr ~ '^SALVA-V-' and tipo_plan = 'basica')
  or (codigo_qr ~ '^SALVA-A-' and tipo_plan = 'premium')
  or (codigo_qr ~ '^SALVA-P-' and tipo_plan = 'pro')
) not valid;

-- 2. TABLA: PORTADORES (Ficha Médica e Historia Clínica)
create table if not exists public.portadores (
  id uuid primary key default gen_random_uuid(),
  pulsera_id uuid references public.pulseras(id) on delete cascade unique,
  usuario_id uuid references auth.users(id) on delete cascade,
  nombre_completo text not null,
  fecha_nacimiento date,
  foto_url text,
  tipo_sangre text,
  eps_seguro text,
  alergias text,
  enfermedades_condiciones text,
  medicamentos text,
  contacto_emergencia_1_nombre text,
  contacto_emergencia_1_telefono text,
  contacto_emergencia_2_nombre text,
  contacto_emergencia_2_telefono text,
  notas_adicionales text,
  talla_manilla text default '20',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. TABLA: ESCANEOS_UBICACION (Telemetría al escanear QR/NFC)
create table if not exists public.escaneos_ubicacion (
  id bigint generated always as identity primary key,
  pulsera_id uuid references public.pulseras(id) on delete cascade not null,
  latitud double precision,
  longitud double precision,
  precision_metros real,
  created_at timestamptz not null default now()
);
create index if not exists escaneos_pulsera_idx on public.escaneos_ubicacion (pulsera_id, created_at desc);

-- 4. TABLA: TELEMETRIA_GPS (Rastreo activo para Active / Pro)
create table if not exists public.telemetria_gps (
  id bigint generated always as identity primary key,
  pulsera_id uuid references public.pulseras(id) on delete cascade not null,
  latitud double precision not null,
  longitud double precision not null,
  precision_metros real,
  velocidad_kmh real,
  bateria_pct real check (bateria_pct between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists telemetria_gps_pulsera_fecha_idx on public.telemetria_gps (pulsera_id, created_at desc);

-- 5. TABLA: EVENTOS_SOS (Botón de pánico de Salva Pro)
create table if not exists public.eventos_sos (
  id bigint generated always as identity primary key,
  pulsera_id uuid references public.pulseras(id) on delete cascade not null,
  latitud double precision,
  longitud double precision,
  atendido boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists eventos_sos_pulsera_fecha_idx on public.eventos_sos (pulsera_id, created_at desc);

-- 6. TABLA: PEDIDOS (Registro de checkout de la landing)
create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  codigo_pedido text unique not null,
  modelo text,
  diseno text,
  talla text,
  nombre_cliente text,
  telefono_cliente text,
  ciudad text,
  direccion_entrega text,
  metodo_pago text,
  total_cop integer,
  notas text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- SEGURIDAD RLS (Row Level Security)
-- =========================================================
alter table public.pulseras enable row level security;
alter table public.portadores enable row level security;
alter table public.escaneos_ubicacion enable row level security;
alter table public.telemetria_gps enable row level security;
alter table public.eventos_sos enable row level security;
alter table public.pedidos enable row level security;

-- Políticas Pulseras: Lectura pública (para poder escanear ficha y consultar disponibilidad)
drop policy if exists "pulseras_select_public" on public.pulseras;
create policy "pulseras_select_public" on public.pulseras for select using (true);

drop policy if exists "pulseras_update_auth" on public.pulseras;
create policy "pulseras_update_auth" on public.pulseras for update to authenticated using (true);

-- Políticas Portadores:
-- 1. Lectura pública de la ficha médica para emergencias (cualquiera que escanee el QR)
drop policy if exists "portadores_select_public" on public.portadores;
create policy "portadores_select_public" on public.portadores for select using (true);

-- 2. El tutor autenticado solo puede editar y crear sus propios portadores
drop policy if exists "portadores_insert_auth" on public.portadores;
create policy "portadores_insert_auth" on public.portadores for insert to authenticated with check (auth.uid() = usuario_id);

drop policy if exists "portadores_update_auth" on public.portadores;
create policy "portadores_update_auth" on public.portadores for update to authenticated using (auth.uid() = usuario_id);

drop policy if exists "portadores_delete_auth" on public.portadores;
create policy "portadores_delete_auth" on public.portadores for delete to authenticated using (auth.uid() = usuario_id);

-- Políticas Escaneos: Inserción pública (el teléfono del socorrista reporta GPS)
drop policy if exists "escaneos_insert_public" on public.escaneos_ubicacion;
create policy "escaneos_insert_public" on public.escaneos_ubicacion for insert with check (true);

drop policy if exists "escaneos_select_tutor" on public.escaneos_ubicacion;
create policy "escaneos_select_tutor" on public.escaneos_ubicacion for select to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = escaneos_ubicacion.pulsera_id and p.usuario_id = auth.uid()));

-- Políticas Telemetría GPS: Inserción pública/gateway y lectura solo por el tutor
drop policy if exists "telemetria_insert_public" on public.telemetria_gps;
create policy "telemetria_insert_public" on public.telemetria_gps for insert with check (true);

drop policy if exists "telemetria_select_tutor" on public.telemetria_gps;
create policy "telemetria_select_tutor" on public.telemetria_gps for select to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = telemetria_gps.pulsera_id and p.usuario_id = auth.uid()));

-- Políticas Eventos SOS:
drop policy if exists "sos_insert_public" on public.eventos_sos;
create policy "sos_insert_public" on public.eventos_sos for insert with check (true);

drop policy if exists "sos_select_tutor" on public.eventos_sos;
create policy "sos_select_tutor" on public.eventos_sos for select to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = eventos_sos.pulsera_id and p.usuario_id = auth.uid()));

drop policy if exists "sos_update_tutor" on public.eventos_sos;
create policy "sos_update_tutor" on public.eventos_sos for update to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = eventos_sos.pulsera_id and p.usuario_id = auth.uid()));

-- Políticas Pedidos: Inserción pública desde el checkout de la landing
drop policy if exists "pedidos_insert_public" on public.pedidos;
create policy "pedidos_insert_public" on public.pedidos for insert with check (true);

drop policy if exists "pedidos_select_auth" on public.pedidos;
create policy "pedidos_select_auth" on public.pedidos for select to authenticated using (true);

-- =========================================================
-- SUSCRIPCIONES REALTIME (Alertas en vivo en panel del tutor)
-- =========================================================
do $$
begin
  begin alter publication supabase_realtime add table public.escaneos_ubicacion; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.eventos_sos; exception when duplicate_object then null; end;
end $$;

-- =========================================================
-- STORAGE BUCKET: fotos_portadores (Fotos de perfil)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('fotos_portadores', 'fotos_portadores', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos_portadores_select_public" on storage.objects;
create policy "fotos_portadores_select_public" on storage.objects for select using (bucket_id = 'fotos_portadores');

drop policy if exists "fotos_portadores_insert_auth" on storage.objects;
create policy "fotos_portadores_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'fotos_portadores');

drop policy if exists "fotos_portadores_update_auth" on storage.objects;
create policy "fotos_portadores_update_auth" on storage.objects for update to authenticated using (bucket_id = 'fotos_portadores');

-- =========================================================
-- PULSERAS DEMO DE PRUEBA INICIAL (Lotes V, A y P)
-- =========================================================
insert into public.pulseras (codigo_qr, estado, tipo_plan)
values
  ('SALVA-V-1001', 'disponible', 'basica'),
  ('SALVA-A-2001', 'disponible', 'premium'),
  ('SALVA-P-3001', 'disponible', 'pro')
on conflict (codigo_qr) do nothing;
