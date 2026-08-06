-- Migration: labour_from_pontaj
--
-- Repunctează labour_today / labour_daily de pe stub-ul demo (cvr_labour_stub,
-- acum GOL — de aceea Șantierul nu mai arată pe nimeni) pe repartiția REALĂ din
-- Pontaj (pontaj_assignments). Contractul view-urilor rămâne același, așa că
-- aplicația citește mai departe prin aceleași funcții.
--
-- REGULA DE REPARTIZARE (Pontaj alocă la trei niveluri: proiect / job / task)
--   - alocare pe TASK    → omul contează exact pe acel task;
--   - alocare pe JOB     → omul contează pe taskurile NEFINALIZATE ale jobului;
--   - alocare pe PROIECT → omul contează pe taskurile NEFINALIZATE ale proiectului.
--
-- Cele două view-uri răspund însă la întrebări diferite, deci agregă diferit:
--
--   labour_today  = „cine e azi pe șantier, pe ce taskuri poate fi întrebat".
--     E un SEMNAL DE PREZENȚĂ, nu o măsură: un om alocat pe proiect apare la
--     numărătoare pe FIECARE task nefinalizat al proiectului. Suma pe taskuri
--     poate depăși numărul de oameni — normal, nu știm încă pe care task a stat.
--     `level` spune la ce nivel a fost alocat, ca interfața să poată scrie
--     „3 oameni pe proiect" în loc să sugereze că sunt fix pe acel task.
--
--   labour_daily  = „cât efort s-a consumat" (oameni-zile pe task, pe zi).
--     E o MĂSURĂ, deci un om alocat mai sus se ÎMPARTE egal la taskurile
--     candidate (1/n), niciodată duplicat. Totalul pe zi = numărul real de
--     oameni. Valorile devin exacte pe măsură ce Pontajul alocă pe task.
--
-- Concediile (leave_type) și rândurile șterse (deleted_at) sunt excluse peste tot.
--
-- PROIECTELE FĂRĂ JOBURI ȘI TASKURI sunt un caz NORMAL, nu o lipsă (decizia lui
-- Alex, 2026-08-06): „vor exista proiecte fără joburi și taskuri; acolo orele
-- rămân pe proiect și atât — spune-mi câte ore am consumat". Pentru ele:
--   labour_project_today = oamenii de azi care rămân la nivel de proiect;
--   labour_project_hours = orele consumate pe proiect (din pontaj_timesheets),
--                          răspunsul direct la „câte ore am pus în proiect".

-- ── sursa comună: repartiția validă, cu nivelul la care a fost făcută ──────
create or replace view labour_alloc
with (security_invoker = on) as
select
  a.date        as work_date,
  a.worker_id,
  a.project_id,
  a.job_id,
  a.task_id
from pontaj_assignments a
where a.deleted_at is null
  and a.leave_type is null      -- CO/CM/CFS: omul nu e pe șantier
  and a.project_id is not null; -- nealocat

-- taskurile pe care poate cădea o alocare mai generală (nefinalizate)
create or replace view labour_candidate_tasks
with (security_invoker = on) as
select t.id as task_id, t.job_id, j.project_id
from tasks t
join jobs j on j.id = t.job_id
where t.status <> 'finalizat';

-- ── alocările rezolvate până la task, cu nivelul și ponderea de efort ──────
-- weight = cât dintr-un om-zi cade pe acest task (1 pentru alocare directă,
-- 1/n când un om alocat pe job/proiect se împarte la n taskuri candidate).
create or replace view labour_resolved
with (security_invoker = on) as
-- nivel task: direct
select al.work_date, al.worker_id, al.project_id, al.task_id,
       'task'::text as level, 1::numeric as weight
from labour_alloc al
where al.task_id is not null
union all
-- nivel job: pe taskurile nefinalizate ale jobului
select al.work_date, al.worker_id, al.project_id, ct.task_id,
       'job'::text,
       1::numeric / count(*) over (partition by al.worker_id, al.work_date, al.job_id)
from labour_alloc al
join labour_candidate_tasks ct on ct.job_id = al.job_id
where al.task_id is null and al.job_id is not null
union all
-- nivel proiect: pe taskurile nefinalizate ale proiectului
select al.work_date, al.worker_id, al.project_id, ct.task_id,
       'project'::text,
       1::numeric / count(*) over (partition by al.worker_id, al.work_date, al.project_id)
from labour_alloc al
join labour_candidate_tasks ct on ct.project_id = al.project_id
where al.task_id is null and al.job_id is null;

-- ── labour_today: semnal de prezență, un singur rând per task ──────────────
-- (aplicația face Map(task_id → workers), deci un al doilea rând pe același
--  task s-ar pierde în tăcere — de aceea agregăm aici.)
create or replace view labour_today
with (security_invoker = on) as
select
  project_id,
  task_id,
  count(distinct worker_id)::int as workers,
  case
    when bool_or(level = 'task')    then 'task'
    when bool_or(level = 'job')     then 'job'
    else 'project'
  end as level
from labour_resolved
where work_date = current_date
group by project_id, task_id;

-- ── labour_daily: măsură de efort, oameni-zile împărțite, nu duplicate ─────
create or replace view labour_daily
with (security_invoker = on) as
select
  project_id,
  task_id,
  work_date,
  round(sum(weight), 2) as workers
from labour_resolved
group by project_id, task_id, work_date;

-- ── oamenii de azi care rămân la nivel de PROIECT ──────────────────────────
-- `has_tasks` spune dacă proiectul are totuși taskuri active: dacă are, oamenii
-- aceștia apar deja pe cardurile de task (prin labour_today) și interfața nu
-- trebuie să-i mai numere o dată; dacă nu are, aceasta e singura lor apariție —
-- proiectul se raportează ca întreg, exact cum e cerut.
create or replace view labour_project_today
with (security_invoker = on) as
select
  al.project_id,
  count(distinct al.worker_id)::int as workers,
  exists (
    select 1 from labour_candidate_tasks ct where ct.project_id = al.project_id
  ) as has_tasks
from labour_alloc al
where al.work_date = current_date
  and al.task_id is null
  and al.job_id is null
group by al.project_id;

-- ── orele consumate pe proiect, de la început ──────────────────────────────
-- „Dacă avem 1.000 de ore pe un proiect, spune-mi câte ore am consumat."
-- Sursa sunt orele CONFIRMATE din pontaj (regular + overtime), nu repartiția.
create or replace view labour_project_hours
with (security_invoker = on) as
select
  ts.project_id,
  sum(ts.regular_hours + ts.overtime_hours)          as hours,
  sum(ts.regular_hours)                              as regular_hours,
  sum(ts.overtime_hours)                             as overtime_hours,
  round(sum(ts.regular_hours + ts.overtime_hours) / 8, 1) as man_days,
  count(distinct ts.date)                            as days_worked,
  min(ts.date)                                       as first_day,
  max(ts.date)                                       as last_day
from pontaj_timesheets ts
where ts.deleted_at is null
group by ts.project_id;

-- Stub-ul demo rămâne în bază (gol) ca istoric, dar nu-l mai citește nimeni.
comment on table cvr_labour_stub is
  'Depreciat 2026-08-06: manopera vine din pontaj_assignments prin labour_resolved. Tabelul se păstrează gol, doar ca urmă a etapei demo.';
