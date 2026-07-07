-- Migration: cvr_labour_daily
-- View-ul pentru „Vedere cronologică": manopera pe FIECARE zi, pe task.
-- Ca și labour_today, citește acum stub-ul; când apare Pontaj se repunctează
-- doar acest view (aceeași funcție, sursa se schimbă).
create or replace view labour_daily
with (security_invoker = on) as
select
  project_id,
  task_id,
  work_date,
  sum(workers)::int as workers
from cvr_labour_stub
group by project_id, task_id, work_date;
