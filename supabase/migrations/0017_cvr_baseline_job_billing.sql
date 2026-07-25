-- Migration: cvr_baseline_job_billing
--
-- 1) PLANUL INIȚIAL (baseline) pe job: datele promise la început, ÎNGHEȚATE.
--    Fără ele, o tragere de bară în Gantt rescrie planul și „întârzierea" dispare
--    în tăcere — nu mai poți răspunde la „suntem mai târziu decât am promis?".
--    Se completează din datele curente și NU se mai ating de nicăieri din aplicație.
--
-- 2) FACTURAREA PE JOB (situații de lucrări per punct termic), în loc de o
--    singură găleată pe proiect. Așa vezi CARE job stă nefacturat, iar totalul
--    proiectului devine suma joburilor. Valorile existente de pe proiect se
--    împart pro-rata după valoarea joburilor, ca să nu se piardă nimic.
--    `cvr_billing` (pe proiect) NU se șterge — rămâne ca istoric/plasă de siguranță.
--
-- Totul aditiv. Nu atinge tabelele P&L (proiecte/plati/incasari) sau pontaj_*.

-- ── 1) Baseline pe job ───────────────────────────────────────────────────
alter table jobs add column if not exists baseline_start_date date;
alter table jobs add column if not exists baseline_end_date date;

-- îngheață planul curent ca plan inițial (doar acolo unde nu e deja setat)
update jobs
set baseline_start_date = coalesce(baseline_start_date, start_date),
    baseline_end_date   = coalesce(baseline_end_date, end_date)
where baseline_start_date is null or baseline_end_date is null;

-- ── 2) Facturarea pe job ─────────────────────────────────────────────────
create table if not exists cvr_job_billing (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id) on delete cascade,
  depus numeric(14,2) not null default 0,       -- situație probată
  certificat numeric(14,2) not null default 0,
  facturat numeric(14,2) not null default 0,
  incasat numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table cvr_job_billing enable row level security;

-- bani: DOAR admin/finance (site nu vede bani), identic cu cvr_billing
drop policy if exists "money_all_job_billing" on cvr_job_billing;
create policy "money_all_job_billing" on cvr_job_billing for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

drop trigger if exists trg_touch_job_billing on cvr_job_billing;
create trigger trg_touch_job_billing
  before update on cvr_job_billing
  for each row execute function public.cvr_touch_updated_at();

-- un rând gol pentru fiecare job existent
insert into cvr_job_billing (job_id)
select j.id from jobs j
on conflict (job_id) do nothing;

-- seed pro-rata: valorile de pe proiect se împart după valoarea joburilor
-- (valoarea unui job = suma valorilor taskurilor lui)
with job_value as (
  select j.id as job_id, j.project_id,
         coalesce((select sum(t.value) from tasks t where t.job_id = j.id), 0) as val
  from jobs j
),
project_total as (
  select project_id, sum(val) as total from job_value group by project_id
)
update cvr_job_billing b
set depus      = round(cb.depus      * jv.val / pt.total, 2),
    certificat = round(cb.certificat * jv.val / pt.total, 2),
    facturat   = round(cb.facturat   * jv.val / pt.total, 2),
    incasat    = round(cb.incasat    * jv.val / pt.total, 2)
from job_value jv
join project_total pt on pt.project_id = jv.project_id
join cvr_billing cb on cb.project_id = jv.project_id
where b.job_id = jv.job_id
  and pt.total > 0
  and (cb.depus + cb.certificat + cb.facturat + cb.incasat) > 0;
