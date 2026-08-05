-- Structura proiectelor în lucru, exact cum a dictat-o Alex (2026-08-05).
-- Doar INSERT-uri + reactivarea unui proiect. Nu se șterge și nu se
-- redenumește nimic. Numele proiectelor legate de P&L rămân neatinse.
--
-- Datele joburilor sunt PLACEHOLDER (jobs.start_date / end_date sunt NOT NULL
-- în schemă): 5 aug. 2026 – 31 dec. 2026. Alex le pune pe cele reale.

do $$
declare
  v_proj uuid;
  v_job uuid;
  v_task uuid;
  d_start date := date '2026-08-05';
  d_end   date := date '2026-12-31';
begin
  -- ── 1. Susita — proiect nou, fără structură dictată ───────────────────
  if not exists (select 1 from projects where name = 'Susita') then
    insert into projects (name, active, sort_order) values ('Susita', true, 3);
  end if;

  -- ── 2. Termoficare Bucuresti — proiectul REAL (cel legat de P&L) ──────
  select id into v_proj from projects
   where name = 'Termoficare Bucuresti' and pnl_proiect_id is not null;
  if v_proj is null then
    raise exception 'Nu găsesc proiectul real Termoficare Bucuresti';
  end if;

  update projects set active = true where id = v_proj and active = false;

  -- Job: PT2-PT3
  if not exists (select 1 from jobs where project_id = v_proj and name = 'PT2-PT3') then
    insert into jobs (project_id, name, start_date, end_date, sort_order)
    values (v_proj, 'PT2-PT3', d_start, d_end, 1)
    returning id into v_job;

    insert into tasks (job_id, name, sort_order) values
      (v_job, 'Provizorat', 1),
      (v_job, 'Fir nou', 2),
      (v_job, 'Conectări', 3),
      (v_job, 'Refaceri', 4),
      (v_job, 'Demontare provizorat', 5);

    -- Livrabilele provizoratului, din anexa de subcontractare semnată
    -- („Livrabile_Provizorat_PT2_PT3.xlsx"): singurele cantități care există
    -- azi pe hârtie pentru acest job.
    select id into v_task from tasks where job_id = v_job and name = 'Provizorat';
    insert into deliverables (task_id, name, um, qty_total, weight, sort_order) values
      (v_task, 'Sudat țeavă',                 'ml',  700, 40, 1),
      (v_task, 'Traversări pietonale',        'buc',  12, 30, 2),
      (v_task, 'Traversări de stradă',        'buc',   6, 30, 3);
  end if;

  -- Job: PT10
  if not exists (select 1 from jobs where project_id = v_proj and name = 'PT10') then
    insert into jobs (project_id, name, start_date, end_date, sort_order)
    values (v_proj, 'PT10', d_start, d_end, 2)
    returning id into v_job;

    insert into tasks (job_id, name, sort_order) values
      (v_job, 'Conectări', 1),
      (v_job, 'Refaceri', 2),
      (v_job, 'Demontare provizorat', 3);
  end if;

  -- ── 3. Camin C2 - Mihai Bravu — Pereți și Placă ───────────────────────
  select id into v_proj from projects where name = 'Camin C2 - Mihai Bravu';
  if v_proj is null then
    raise exception 'Nu găsesc proiectul Camin C2 - Mihai Bravu';
  end if;

  if not exists (select 1 from jobs where project_id = v_proj and name = 'Pereți') then
    insert into jobs (project_id, name, start_date, end_date, sort_order)
    values (v_proj, 'Pereți', d_start, d_end, 1)
    returning id into v_job;
    insert into tasks (job_id, name, sort_order) values
      (v_job, 'Armătură', 1), (v_job, 'Cofraj', 2), (v_job, 'Turnare', 3);
  end if;

  if not exists (select 1 from jobs where project_id = v_proj and name = 'Placă') then
    insert into jobs (project_id, name, start_date, end_date, sort_order)
    values (v_proj, 'Placă', d_start, d_end, 2)
    returning id into v_job;
    insert into tasks (job_id, name, sort_order) values
      (v_job, 'Armătură', 1), (v_job, 'Cofraj', 2), (v_job, 'Turnare', 3);
  end if;
end $$;
