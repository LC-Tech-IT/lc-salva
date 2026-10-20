-- Salva — Desarrollado y respaldado por LC Tech
-- Telemetría GPS (Active/Pro) y eventos del botón SOS (Pro).
-- Ejecutar en Supabase > SQL Editor. Los dispositivos/gateway escriben con la service_role key;
-- los tutores solo pueden LEER los datos de las pulseras vinculadas a su cuenta.

-- 1. Convención de lotes de fabricación: el prefijo del código define el plan
alter table public.pulseras
  drop constraint if exists pulseras_lote_plan_chk;
alter table public.pulseras
  add constraint pulseras_lote_plan_chk check (
    codigo_qr !~ '^SALVA-[VAP]-'
    or (codigo_qr ~ '^SALVA-V-' and tipo_plan = 'basica')
    or (codigo_qr ~ '^SALVA-A-' and tipo_plan = 'premium')
    or (codigo_qr ~ '^SALVA-P-' and tipo_plan = 'pro')
  ) not valid; -- not valid: no bloquea códigos antiguos (SALVA-1001…)

-- 2. Telemetría
create table if not exists public.telemetria_gps (
  id bigint generated always as identity primary key,
  pulsera_id uuid not null references public.pulseras(id) on delete cascade,
  latitud double precision not null,
  longitud double precision not null,
  precision_metros real,
  velocidad_kmh real,
  bateria_pct real check (bateria_pct between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists telemetria_gps_pulsera_fecha_idx on public.telemetria_gps (pulsera_id, created_at desc);

-- 3. Eventos del botón físico SOS
create table if not exists public.eventos_sos (
  id bigint generated always as identity primary key,
  pulsera_id uuid not null references public.pulseras(id) on delete cascade,
  latitud double precision,
  longitud double precision,
  atendido boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists eventos_sos_pulsera_fecha_idx on public.eventos_sos (pulsera_id, created_at desc);

-- 4. Seguridad: el tutor solo ve las pulseras que tiene vinculadas
alter table public.telemetria_gps enable row level security;
alter table public.eventos_sos enable row level security;

drop policy if exists "tutor lee telemetria" on public.telemetria_gps;
create policy "tutor lee telemetria" on public.telemetria_gps
  for select to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = telemetria_gps.pulsera_id and p.usuario_id = auth.uid()));

drop policy if exists "tutor lee sos" on public.eventos_sos;
create policy "tutor lee sos" on public.eventos_sos
  for select to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = eventos_sos.pulsera_id and p.usuario_id = auth.uid()));

-- 5. Avisos en tiempo real para el panel del tutor
do $$
begin
  begin alter publication supabase_realtime add table public.escaneos_ubicacion; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.eventos_sos; exception when duplicate_object then null; end;
end $$;
