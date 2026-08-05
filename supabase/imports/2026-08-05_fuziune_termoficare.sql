-- Fuziunea celor două „Termoficare" + mutarea orelor de pe „Provizorat PT2-PT3".
--
-- Decizia lui Alex: contează orele de pontaj, nu legătura cu P&L („All I've
-- added there was test entries anyway"). Deci SUPRAVIEȚUIEȘTE rândul pe care
-- stau orele — „Termoficare București" — iar „Termoficare Bucuresti" (cel legat
-- de P&L, fără nicio oră) dispare, după ce joburile lui trec dincolo.
--
-- Pontajul citește ACEEAȘI tabelă `projects` ca CVR (nu are una proprie), deci
-- ștergerea de aici rezolvă dublura și în aplicația de pontaj — o singură
-- operație, nu două.
--
-- Ce NU se atinge: tabela `proiecte` a P&L-ului și plățile/încasările hrănite
-- de n8n. Ștergerea unui rând din `projects` doar rupe legătura; rândul din
-- `proiecte` rămâne exact cum era.

do $$
declare
  v_keep uuid; v_drop uuid; v_prov uuid; v_job_pt23 uuid;
begin
  select id into v_keep from projects where name = 'Termoficare București';
  select id into v_drop from projects where name = 'Termoficare Bucuresti';
  select id into v_prov from projects where name = 'Provizorat PT2-PT3';
  if v_keep is null or v_drop is null or v_prov is null then
    raise notice 'Fuziunea s-a făcut deja.'; return;
  end if;

  if exists (select 1 from pontaj_timesheets where project_id = v_drop) then
    raise exception 'Termoficare Bucuresti are pontaje — opresc';
  end if;

  update jobs set project_id = v_keep where project_id = v_drop;
  select id into v_job_pt23 from jobs where project_id = v_keep and name = 'PT2-PT3';

  -- inclusiv rândurile șterse logic: altfel rămân agățate de un proiect care dispare
  update pontaj_timesheets  set project_id = v_keep, job_id = coalesce(job_id, v_job_pt23) where project_id = v_prov;
  update pontaj_assignments set project_id = v_keep, job_id = coalesce(job_id, v_job_pt23) where project_id = v_prov;

  delete from projects where id = v_drop;
  delete from projects where id = v_prov;

  -- „CMTEB" și intervalul 6 apr. – 30 nov. 2026 veneau tot din seed-ul demo
  update projects set client = null, start_date = null, end_date = null, retentie_pct = 0
   where id = v_keep;
end $$;
