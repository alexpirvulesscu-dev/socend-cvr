-- Migration: seed_demo_daily
-- Istoric demo pentru „Vedere cronologică": raportările zilnice din trecut
-- (cvr_daily_entries) și manopera pe zilele respective (cvr_labour_stub).
-- Sumele zilnice pe fiecare livrabil dau EXACT qty_done existent, deci nu
-- schimbă niciun KPI. Ștergere într-un singur pas:
--   delete from cvr_daily_entries where entry_date < current_date;
--   delete from cvr_labour_stub where work_date < current_date;
do $$
declare
  d record;
  days date[];
  n int;
  base numeric;
  rem int;
  i int;
  qty numeric;
begin
  for d in
    select dl.id, dl.qty_done, j.start_date
    from deliverables dl
    join tasks t on t.id = dl.task_id
    join jobs j on j.id = t.job_id
    where dl.qty_done > 0
  loop
    -- zilele lucrătoare (fără duminici) de la max(1 iunie, startul jobului) până ieri
    select array_agg(dd::date order by dd) into days
    from generate_series(greatest(date '2026-06-01', d.start_date), current_date - 1, interval '1 day') dd
    where extract(dow from dd) <> 0;
    n := coalesce(array_length(days, 1), 0);
    if n = 0 then continue; end if;

    base := floor(d.qty_done / n);
    rem := (d.qty_done - base * n)::int;
    for i in 1..n loop
      qty := base + case when i <= rem then 1 else 0 end;
      if qty > 0 then
        insert into cvr_daily_entries (deliverable_id, entry_date, qty)
        values (d.id, days[i], qty);
      end if;
    end loop;
  end loop;

  -- manoperă istorică: oameni pe taskurile care au raportat cantități în acea zi
  -- (numărul e derivat determinist din task+zi, între 2 și 7)
  insert into cvr_labour_stub (project_id, task_id, workers, work_date)
  select distinct
    j.project_id,
    t.id,
    2 + (abs(hashtext(t.id::text || e.entry_date::text)) % 6),
    e.entry_date
  from cvr_daily_entries e
  join deliverables dl on dl.id = e.deliverable_id
  join tasks t on t.id = dl.task_id
  join jobs j on j.id = t.job_id
  where e.entry_date < current_date;
end $$;
