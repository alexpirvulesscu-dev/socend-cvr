-- 0022 · Vidraru: transportul iese din „organizare" și stă pe linia lui
--
-- La importul ofertei, coloana „PU Transport" a fost adunată în „organizare"
-- (organizare = 15% indirecte + transport). Sumele erau corecte la total, dar
-- eticheta era greșită: 17.810,84 lei de transport treceau drept organizare de
-- șantier. Migrarea mută exact acei bani pe categoria nouă `transport`.
--
-- Totalul bugetului fiecărui job NU se schimbă — doar felia. Prin urmare nici
-- un KPI (cost planificat, profit, marjă, variație de cost) nu se mișcă.
--
-- Sumele vin din oferta „Calcul Oferta.xlsx", foaia „Calcul V1", coloana
-- „PU Transport (Lei)" × cantitate, însumată pe capitol. Jobul 8 = CAP VIII +
-- CAP IX, cum au fost grupate la import.
--
-- Atinge un singur proiect, numai tabele create de CVR. Se poate rula de mai
-- multe ori: a doua rulare nu mai găsește nimic de mutat.

do $$
declare
  v_project uuid;
  v_job uuid;
  r record;
begin
  select id into v_project from projects where name = 'Canal Cabluri — Vidraru';
  if v_project is null then
    raise notice 'Proiectul Vidraru nu există aici — nu e nimic de mutat.';
    return;
  end if;

  for r in
    select * from (values
      (1, 7269.17::numeric),
      (3,  756.00::numeric),
      (5, 3466.97::numeric),
      (7,  211.80::numeric),
      (8, 6106.90::numeric)
    ) as t(sort_order, transport)
  loop
    select id into v_job
      from jobs
     where project_id = v_project and sort_order = r.sort_order;
    if v_job is null then
      continue;
    end if;

    -- se mută doar dacă „organizare" chiar mai conține transportul; dacă
    -- migrarea a mai rulat, suma e deja scăzută și nu se atinge nimic
    if exists (
      select 1 from cvr_job_budgets
       where job_id = v_job and category = 'organizare' and amount >= r.transport
    ) and not exists (
      select 1 from cvr_job_budgets where job_id = v_job and category = 'transport'
    ) then
      update cvr_job_budgets
         set amount = amount - r.transport
       where job_id = v_job and category = 'organizare';

      insert into cvr_job_budgets (job_id, category, amount)
      values (v_job, 'transport', r.transport)
      on conflict (job_id, category) do update set amount = excluded.amount;
    end if;
  end loop;
end $$;
