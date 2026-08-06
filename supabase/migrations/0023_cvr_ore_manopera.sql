-- 0023 · Orele de manoperă: plan pe fiecare nivel + consum rulat din Pontaj
--
-- Regula cerută de Alex, pe scurt:
--   „Dacă repartizez oamenii doar pe proiect, orele se înregistrează pe proiect.
--    Dacă repartizez pe job, jobul adună orele lui plus ale taskurilor lui.
--    Totalul proiectului = tot ce s-a pontat pe el, indiferent cât de adânc a
--    fost repartizat." Nimic din asta nu depinde de livrabile sau de progres.
--
-- Două lucruri se rezolvă aici:
--   1. PLANUL de ore există acum ca număr de sine stătător pe proiect și pe job
--      (taskul îl avea deja, în oameni-zile). Nu mai e derivat din manopera în
--      lei — Alex îl stabilește la deschiderea proiectului.
--   2. CONSUMUL se agregă ÎN BAZĂ, nu în browser. Aplicația citea toate
--      pontajele și primea doar primele 1.000 (limita PostgREST), deci suma
--      afișată era o felie arbitrară. Vederile de mai jos întorc câteva zeci de
--      rânduri, deci limita nu mai poate falsifica nimic.
--
-- Strict aditiv: două coloane noi (nullable) și cinci vederi. Nu se șterge și
-- nu se modifică nicio dată existentă.

-- ── 1. Planul de ore ─────────────────────────────────────────────────────
alter table projects add column if not exists planned_hours numeric(12,2);
alter table jobs     add column if not exists planned_hours numeric(12,2);

comment on column projects.planned_hours is
  'Ore de manoperă alocate proiectului la deschidere. Gol = fără plan.';
comment on column jobs.planned_hours is
  'Ore alocate jobului. Gol = se însumează planul taskurilor lui.';

-- ── 2. Orele pontate, rând cu rând ───────────────────────────────────────
-- Sursa unică: pontajele nesterse. `job_id` / `task_id` sunt goale cât timp
-- repartiția s-a făcut doar pe proiect — și e în regulă, orele tot se numără.
create or replace view cvr_labour_raw
with (security_invoker = true) as
select ts.project_id,
       ts.job_id,
       ts.task_id,
       ts.date as work_date,
       coalesce(ts.regular_hours, 0) + coalesce(ts.overtime_hours, 0) as hours
  from pontaj_timesheets ts
 where ts.deleted_at is null;

-- ── 3. Total pe proiect, cu defalcarea pe nivelul repartiției ────────────
create or replace view cvr_labour_by_project
with (security_invoker = true) as
select p.id as project_id,
       coalesce(sum(h.hours), 0)                                              as hours,
       coalesce(sum(h.hours) filter (where h.task_id is not null), 0)         as hours_task,
       coalesce(sum(h.hours) filter (where h.task_id is null
                                       and h.job_id is not null), 0)          as hours_job,
       coalesce(sum(h.hours) filter (where h.job_id is null), 0)              as hours_project,
       min(h.work_date) as first_day,
       max(h.work_date) as last_day
  from projects p
  left join cvr_labour_raw h on h.project_id = p.id
 group by p.id;

-- ── 4. Total pe job = orele lui + orele taskurilor lui ───────────────────
create or replace view cvr_labour_by_job
with (security_invoker = true) as
select j.id as job_id,
       j.project_id,
       coalesce(sum(h.hours), 0)                                      as hours,
       coalesce(sum(h.hours) filter (where h.task_id is not null), 0) as hours_task,
       coalesce(sum(h.hours) filter (where h.task_id is null), 0)     as hours_job
  from jobs j
  left join cvr_labour_raw h on h.job_id = j.id
 group by j.id, j.project_id;

-- ── 5. Total pe task ─────────────────────────────────────────────────────
create or replace view cvr_labour_by_task
with (security_invoker = true) as
select t.id as task_id,
       j.project_id,
       coalesce(sum(h.hours), 0) as hours
  from tasks t
  join jobs j on j.id = t.job_id
  left join cvr_labour_raw h on h.task_id = t.id
 group by t.id, j.project_id;

-- ── 6. Zi de zi, pentru comparația plan vs consumat ──────────────────────
create or replace view cvr_labour_by_day
with (security_invoker = true) as
select project_id,
       work_date,
       sum(hours) as hours
  from cvr_labour_raw
 group by project_id, work_date;

grant select on cvr_labour_raw, cvr_labour_by_project, cvr_labour_by_job,
                cvr_labour_by_task, cvr_labour_by_day
   to authenticated;
