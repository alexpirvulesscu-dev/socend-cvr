-- Migration: cvr_labour_view
-- View-ul labour_today este SINGURUL loc din care CVR citește manopera.
-- Acum citește stub-ul cvr_labour_stub; când apare Pontaj, se repunctează
-- doar acest view, fără nicio schimbare în aplicație.
-- security_invoker = on → view-ul respectă RLS-ul tabelului de dedesubt.

create or replace view labour_today
with (security_invoker = on) as
select
  project_id,
  task_id,
  sum(workers)::int as workers
from cvr_labour_stub
where work_date = current_date
group by project_id, task_id;
