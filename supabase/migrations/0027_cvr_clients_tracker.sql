-- Migration 0027: cvr_clients_tracker (23 nov. 2026)
-- 1. Clienți: o grupare DOAR pe ecran, peste proiectele și joburile existente.
--    Un rând din cvr_client_items arată fie un proiect întreg (job_id gol),
--    fie un job dintr-un proiect. P&L și Pontaj nu sunt atinse (rămân pe proiect).
-- 2. Trackerul de execuție pe traseu (primul: Peștișani VJ36-VJ80):
--    porțiuni (segmente), lucrări separate (cămine etc.) și jurnalul zilnic.
--    Starea de azi se calculează din jurnal, nu se ține separat.
-- Totul aditiv: tabele noi cvr_*, plus un job nou pe CHE Vidraru.

-- ── 1. Clienți ───────────────────────────────────────────────────────────
create table if not exists cvr_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists cvr_client_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references cvr_clients(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  label text,                       -- numele afișat; gol = numele proiectului / jobului
  sort_order int not null default 0
);
create index if not exists idx_cvr_client_items_client on cvr_client_items(client_id);

-- ── 2. Tracker ───────────────────────────────────────────────────────────
create table if not exists cvr_trackers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  kind text not null default 'traseu',
  name text not null,
  subtitle text,
  -- tipurile de porțiuni și etapele fiecărui tip (diferă de la proiect la proiect)
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_cvr_trackers_project on cvr_trackers(project_id);

create table if not exists cvr_tracker_segments (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  code text not null,               -- ex. s38a
  from_pt text not null,            -- ex. VJ38
  to_pt text not null,              -- ex. VJ39
  part int not null default 0,      -- 0 = prima parte a porțiunii VJ38-VJ39
  parts int not null default 1,
  length_m numeric not null check (length_m > 0),
  kind text not null,               -- tipul de lucrare (cheie din config.types)
  note text,
  sort_order int not null,
  unique (tracker_id, code)
);

create table if not exists cvr_tracker_points (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  code text not null,
  name text not null,
  location text,
  at_pt text,                       -- reper pe traseu (ex. VJ36) dacă apare pe hartă
  status text not null default 'ns' check (status in ('ns','ip','done')),
  note text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (tracker_id, code)
);

create table if not exists cvr_tracker_entries (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  work_date date not null,
  stage text not null,              -- cheie din config.stages
  from_pt text not null,            -- frontul de lucru pornește de aici
  to_pt text not null,              -- și merge spre acest reper
  qty numeric not null check (qty > 0),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_cvr_tracker_entries_tracker on cvr_tracker_entries(tracker_id, work_date);

drop trigger if exists trg_touch_tracker_points on cvr_tracker_points;
create trigger trg_touch_tracker_points
  before update on cvr_tracker_points
  for each row execute function public.cvr_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Fără bani aici: toate rolurile CVR citesc; doar biroul (admin, finance) scrie.
alter table cvr_clients enable row level security;
alter table cvr_client_items enable row level security;
alter table cvr_trackers enable row level security;
alter table cvr_tracker_segments enable row level security;
alter table cvr_tracker_points enable row level security;
alter table cvr_tracker_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cvr_clients','cvr_client_items','cvr_trackers',
                           'cvr_tracker_segments','cvr_tracker_points','cvr_tracker_entries']
  loop
    execute format('drop policy if exists "read_%1$s" on %1$I', t);
    execute format($p$create policy "read_%1$s" on %1$I for select to authenticated
                      using (public.cvr_role() in ('admin','finance','site'))$p$, t);
    execute format('drop policy if exists "office_write_%1$s" on %1$I', t);
    execute format($p$create policy "office_write_%1$s" on %1$I for all to authenticated
                      using (public.cvr_role() in ('admin','finance'))
                      with check (public.cvr_role() in ('admin','finance'))$p$, t);
  end loop;
end $$;

-- ── Date: job nou pe CHE Vidraru + cei 3 clienți ─────────────────────────
-- „Betonare CS - Etapa 1" nu există încă; primește intervalul jobului Canal de Cabluri.
insert into jobs (project_id, name, start_date, end_date, sort_order)
select j.project_id, 'Betonare CS - Etapa 1', j.start_date, j.end_date,
       (select coalesce(max(sort_order), 0) + 1 from jobs where project_id = j.project_id)
  from jobs j
 where j.id = '8b9b357b-f920-4018-a169-9c6321a5e49e'
   and not exists (select 1 from jobs x where x.project_id = j.project_id and x.name = 'Betonare CS - Etapa 1');

insert into cvr_clients (id, name, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', 'Elsaco - Alimentare cu apă Tg Jiu', 1),
  ('c1000000-0000-4000-8000-000000000002', 'Elsaco - Termoficare București', 2),
  ('c1000000-0000-4000-8000-000000000003', 'EM Grup - CHE Vidraru', 3)
on conflict (id) do nothing;

insert into cvr_client_items (client_id, project_id, job_id, label, sort_order)
select v.client_id::uuid, v.project_id::uuid, v.job_id::uuid, v.label, v.ord
  from (values
    -- Elsaco - Alimentare cu apă Tg Jiu: două proiecte întregi
    ('c1000000-0000-4000-8000-000000000001', '2b68da1e-7f39-4252-9ddf-b235a30c09da', null, 'Alimentare cu apă Peștișani', 1),
    ('c1000000-0000-4000-8000-000000000001', 'ec3b21ee-89ac-4cdb-9f31-ba8baad6f95d', null, 'Susita', 2),
    -- Elsaco - Termoficare București: joburi din proiectul Termoficare (PT10 e finalizat, nu apare)
    ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'ca9d74a7-d6b9-49a3-8849-c8f3e1a583e9', 'PT Tudor Vladimirescu', 1),
    ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'c0dcbb0e-2021-4063-b50e-9def118fb296', 'PT2 + PT3', 2),
    -- EM Grup - CHE Vidraru: joburi din proiectul CHE Vidraru
    ('c1000000-0000-4000-8000-000000000003', '9652c56b-2637-40ed-9f94-ea6cd38fe343', '8b9b357b-f920-4018-a169-9c6321a5e49e', 'Canal de cabluri', 1),
    ('c1000000-0000-4000-8000-000000000003', '9652c56b-2637-40ed-9f94-ea6cd38fe343', '72e8c828-2ffe-44db-8280-2ed9c740250f', 'Stația de 10,5 kV', 2),
    ('c1000000-0000-4000-8000-000000000003', '9652c56b-2637-40ed-9f94-ea6cd38fe343', null, 'Betonare CS - Etapa 1', 3),
    ('c1000000-0000-4000-8000-000000000003', '9652c56b-2637-40ed-9f94-ea6cd38fe343', '0a6bcb13-a458-4744-a31c-ecb8338786d2', 'Fundațiile GF2 și Casa Vane Priza Apă', 4)
  ) as v(client_id, project_id, job_id, label, ord)
 where not exists (select 1 from cvr_client_items i where i.client_id = v.client_id::uuid and i.label = v.label);

-- rândul „Betonare CS" trebuie să arate jobul nou creat mai sus
update cvr_client_items i
   set job_id = j.id
  from jobs j
 where i.label = 'Betonare CS - Etapa 1'
   and i.job_id is null
   and j.project_id = i.project_id
   and j.name = 'Betonare CS - Etapa 1';
