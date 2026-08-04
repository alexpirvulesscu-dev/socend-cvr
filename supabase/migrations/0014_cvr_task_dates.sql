-- Migration: cvr_task_dates (CVR v3 — Gantt interactiv)
-- Datele de plan la nivel de TASK, pentru barele editabile din Gantt.
-- Totul e ADITIV: coloane noi + CHECK-uri + updated_at, doar pe tabelele-schelet
-- create de acest proiect (projects/jobs/tasks/deliverables). NU se ating
-- tabelele P&L (proiecte/plati/incasari) și nici pontaj_*.
--
-- Strategia de backfill (ca KPI-urile să NU sară în ziua migrării):
--   a) start = prima zi cu activitate reală din raportările zilnice
--   b) end   = ultima zi cu activitate, DOAR pentru taskurile finalizate
--      (pentru cele în lucru, "ultima zi lucrată" nu e un plan de final)
--   c) restul moștenesc fereastra jobului părinte — numeric identic cu
--      comportamentul de azi al plan_pct (care folosea fereastra jobului)
-- Livrabilele NU primesc date: sunt cantități, nu programări.

-- 1) Coloane noi pe tasks (nullable — un task nou fără plan nu forțează date false)
alter table tasks add column if not exists start_date date;
alter table tasks add column if not exists end_date date;

-- 2a) start = prima zi cu activitate reală
update tasks t
set start_date = a.first_day
from (
  select d.task_id, min(e.entry_date) as first_day
  from cvr_daily_entries e
  join deliverables d on d.id = e.deliverable_id
  group by d.task_id
) a
where a.task_id = t.id and t.start_date is null;

-- 2b) end = ultima zi cu activitate, doar pentru taskurile deja finalizate
update tasks t
set end_date = a.last_day
from (
  select d.task_id, max(e.entry_date) as last_day
  from cvr_daily_entries e
  join deliverables d on d.id = e.deliverable_id
  group by d.task_id
) a
where a.task_id = t.id and t.end_date is null and t.status = 'finalizat';

-- 2c) restul moștenesc fereastra jobului părinte (jobs.start/end sunt NOT NULL)
update tasks t
set start_date = coalesce(t.start_date, j.start_date),
    end_date   = coalesce(t.end_date,   j.end_date)
from jobs j
where j.id = t.job_id and (t.start_date is null or t.end_date is null);

-- 2d) plasă de siguranță înainte de CHECK: end nu poate fi înaintea lui start
update tasks set end_date = start_date where end_date < start_date;

-- 3) CHECK-uri de ordine a datelor (după backfill; verificat: 0 rânduri inversate)
do $$ begin
  alter table tasks add constraint tasks_dates_order
    check (start_date is null or end_date is null or end_date >= start_date);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table jobs add constraint jobs_dates_order
    check (end_date >= start_date);
exception when duplicate_object then null; end $$;

-- 4) updated_at + trigger comun pe cele 4 tabele-schelet (pentru o aplicație
--    editată continuu: "cine a mișcat ultima dată" + bază pentru sincronizări)
alter table projects     add column if not exists updated_at timestamptz not null default now();
alter table jobs         add column if not exists updated_at timestamptz not null default now();
alter table tasks        add column if not exists updated_at timestamptz not null default now();
alter table deliverables add column if not exists updated_at timestamptz not null default now();

create or replace function public.cvr_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_projects on projects;
create trigger trg_touch_projects
  before update on projects
  for each row execute function public.cvr_touch_updated_at();

drop trigger if exists trg_touch_jobs on jobs;
create trigger trg_touch_jobs
  before update on jobs
  for each row execute function public.cvr_touch_updated_at();

drop trigger if exists trg_touch_tasks on tasks;
create trigger trg_touch_tasks
  before update on tasks
  for each row execute function public.cvr_touch_updated_at();

drop trigger if exists trg_touch_deliverables on deliverables;
create trigger trg_touch_deliverables
  before update on deliverables
  for each row execute function public.cvr_touch_updated_at();
