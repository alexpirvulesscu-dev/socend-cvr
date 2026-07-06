-- Migration: cvr_core
-- Aditiv 100%: creează scheletul partajat (projects, jobs, tasks, deliverables)
-- doar dacă nu există, plus tabelele proprii CVR (prefix cvr_).
-- NU atinge tabelele P&L (proiecte, plati, incasari, categorii, vehicule).

-- ── Enums ────────────────────────────────────────────────────────────────
-- Statusul unui task. Valorile sunt slug-uri ASCII; diacriticele apar doar în UI.
do $$ begin
  create type cvr_status as enum ('neinceput', 'in_lucru', 'finalizat');
exception when duplicate_object then null; end $$;

-- Cele 5 categorii de cost (Manoperă, Utilaje, Materiale, Subcontractori, Organizare)
do $$ begin
  create type cvr_cost_category as enum
    ('manopera', 'utilaje', 'materiale', 'subcontractori', 'organizare');
exception when duplicate_object then null; end $$;

-- ── Schelet partajat (folosit mai târziu și de Pontaj) ───────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  -- 'stadii_fizice' (facturare pe stadii) sau 'lunara' (facturare lunară)
  billing_mode text not null default 'stadii_fizice',
  contract_value numeric(14,2) not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  -- datele de plan ale jobului; plan_pct se calculează din ele
  start_date date not null,
  end_date date not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  -- valoarea contractată a taskului, în lei
  value numeric(14,2) not null default 0,
  status cvr_status not null default 'neinceput',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists deliverables (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  name text not null,
  um text not null default 'buc', -- unitate de măsură: m, m2, m3, buc, suduri...
  qty_total numeric(14,2) not null default 0,
  qty_done numeric(14,2) not null default 0,
  -- pondere în task; ponderile unui task trebuie să însumeze 100
  weight numeric(6,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Tabele proprii CVR ───────────────────────────────────────────────────
-- Bugetul de cost al unui job, pe fiecare din cele 5 categorii
create table if not exists cvr_job_budgets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  category cvr_cost_category not null,
  amount numeric(14,2) not null default 0,
  unique (job_id, category)
);

-- Costuri reale înregistrate din birou (formularul „Adaugă cost")
create table if not exists cvr_cost_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  category cvr_cost_category not null,
  amount numeric(14,2) not null,
  description text,
  entry_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Cantitățile raportate zilnic de pe șantier (închiderea zilei)
create table if not exists cvr_daily_entries (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  entry_date date not null default current_date,
  qty numeric(14,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Fluxul de facturare al proiectului: Depus → Certificat → Facturat → Încasat
create table if not exists cvr_billing (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects(id) on delete cascade,
  depus numeric(14,2) not null default 0,
  certificat numeric(14,2) not null default 0,
  facturat numeric(14,2) not null default 0,
  incasat numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Stub pentru manoperă: va fi înlocuit de tabelele Pontaj mai târziu.
-- CVR citește DOAR prin view-ul labour_today, ca repunctarea să fie într-un singur loc.
create table if not exists cvr_labour_stub (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  workers int not null default 0,
  work_date date not null default current_date
);

-- ── Indexuri pe cheile străine folosite la interogări ────────────────────
create index if not exists idx_jobs_project on jobs(project_id);
create index if not exists idx_tasks_job on tasks(job_id);
create index if not exists idx_deliverables_task on deliverables(task_id);
create index if not exists idx_cvr_job_budgets_job on cvr_job_budgets(job_id);
create index if not exists idx_cvr_cost_entries_job on cvr_cost_entries(job_id);
create index if not exists idx_cvr_daily_entries_deliverable on cvr_daily_entries(deliverable_id, entry_date);
create index if not exists idx_cvr_labour_stub_date on cvr_labour_stub(work_date, task_id);
