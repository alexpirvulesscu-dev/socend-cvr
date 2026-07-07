-- Migration: pontaj_tables
-- Tabelele aplicației Pontaj, create în proiectul Supabase PARTAJAT, cu schema
-- identică celei din vechiul proiect "Pontaj Socend Construct" (aqsctetggdghzqnvuxca),
-- cu O EXCEPȚIE deliberată: vechiul `projects` al Pontaj NU se recreează —
-- proiectele Pontaj intră în scheletul partajat `projects` (planul din CLAUDE.md),
-- iar FK-urile arată către el.
-- Securitate: vechiul Pontaj avea „allow all" pentru PUBLIC (era un proiect izolat).
-- Aici asta ar expune datele oricui are cheia publică (aplicația CVR e pe internet),
-- așa că politicile sunt DOAR pentru authenticated. Aplicația Pontaj va trebui să
-- se autentifice când e repunctată (vezi SYNC-AUDIT.md).

create table if not exists workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  type text not null check (type = any (array['TESA','Muncitor','Paznic','Subcontractor'])),
  can_drive boolean not null default false,
  hire_date date,
  end_date date,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  worker_id uuid not null references workers(id),
  project_id uuid references projects(id),
  leave_type text check (leave_type = any (array['CO','CM','CFS'])),
  notes text,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists timesheets (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  worker_id uuid not null references workers(id),
  project_id uuid not null references projects(id),
  regular_hours numeric default 8,
  overtime_hours numeric default 0,
  confirmed_at timestamptz default now(),
  worker_confirmed_at timestamptz,
  deleted_at timestamptz
);

create table if not exists bank_holidays (
  date date primary key,
  name text default 'Sarbatoare'
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license_plate text not null,
  active boolean not null default true,
  created_at timestamp default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamp default now()
);

create table if not exists distances (
  location_a uuid not null references locations(id),
  location_b uuid not null references locations(id),
  km integer not null check (km > 0),
  primary key (location_a, location_b)
);

create table if not exists fleet_assignments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  vehicle_id uuid not null references vehicles(id),
  driver_id uuid references workers(id),
  trip_type text check (trip_type = any (array['route','local'])),
  start_location_id uuid references locations(id),
  end_location_id uuid references locations(id),
  total_km integer,
  stops jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status = any (array['active','out_of_service','idle'])),
  notes text,
  created_at timestamp default now()
);

-- Indexuri pe cheile folosite intens de Pontaj
create index if not exists idx_assignments_date on assignments(date);
create index if not exists idx_assignments_worker on assignments(worker_id);
create index if not exists idx_timesheets_date on timesheets(date);
create index if not exists idx_timesheets_worker on timesheets(worker_id);
create index if not exists idx_timesheets_project on timesheets(project_id);

-- RLS: pornit peste tot, acces complet DOAR pentru utilizatori autentificați
alter table workers enable row level security;
alter table assignments enable row level security;
alter table timesheets enable row level security;
alter table bank_holidays enable row level security;
alter table vehicles enable row level security;
alter table locations enable row level security;
alter table distances enable row level security;
alter table fleet_assignments enable row level security;

create policy "pontaj_auth_all" on workers for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on assignments for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on timesheets for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on bank_holidays for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on vehicles for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on locations for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on distances for all to authenticated using (true) with check (true);
create policy "pontaj_auth_all" on fleet_assignments for all to authenticated using (true) with check (true);
