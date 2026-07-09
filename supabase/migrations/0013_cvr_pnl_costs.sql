-- Migration: cvr_pnl_costs
-- Costul real al fiecărui proiect CVR, dedus din plățile P&L, cu regulile lui Alex:
--
--  1. Manoperă (Salarii și contribuții) — repartizată după oameni-zile: cota de
--     ore-pontaj a proiectului × totalul salariilor din P&L.
--  2. Materiale, 3. Subcontractori, 4. Combustibil, 5. Echipamente (Echipamente +
--     Scule și unelte + Utilaje, arătate ca una) — costul DIRECT tag-uit pe proiect
--     în P&L, PLUS cota-parte (după valoarea contractului) din cheltuielile
--     company-wide (proiect gol / „Toate").
--  6. Overheads (alte cheltuieli, asigurări, birou, instructaje, marketing, PPE,
--     servicii bancare, servicii profesionale, taxe) — 100% company-wide,
--     repartizate după valoarea contractului.
--
-- Legătura cu P&L se face prin numele proiectului P&L (pnl_proiect_id → proiecte.nume),
-- pentru că `plati.proiect` referențiază proiectele prin TEXT.
-- security definer: rulează cu drepturi de owner (citește plati + pontaj_timesheets);
-- doar admin/finance o pot apela (site nu vede bani — vezi grant-ul de la final).

create or replace function public.cvr_project_pnl_costs()
returns table (
  project_id uuid,
  manopera numeric,
  materiale numeric,
  subcontractori numeric,
  combustibil numeric,
  echipamente numeric,
  overheads numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  total_contract numeric;
  total_wages numeric;
  total_hours numeric;
begin
  if public.cvr_role() not in ('admin','finance') then
    raise exception 'Doar biroul poate vedea costurile din P&L';
  end if;

  -- denominatoare globale (doar proiectele active contează la repartizare)
  select coalesce(sum(contract_value),0) into total_contract
  from projects where active and contract_value > 0;

  select coalesce(sum(suma_neta),0) into total_wages
  from plati where categorie = 'Salarii și contribuții';

  select coalesce(sum(regular_hours + overtime_hours),0) into total_hours
  from pontaj_timesheets where deleted_at is null;

  return query
  with cats as (
    select
      'Materiale și consumabile'::text as materiale,
      'Subcontractori'::text as subcontractori,
      'Combustibil și transport'::text as combustibil
  ),
  -- ore-pontaj pe proiect (cheia = projects.id, pe care le referențiază timesheets)
  hours_by_project as (
    select ts.project_id, sum(ts.regular_hours + ts.overtime_hours) as hours
    from pontaj_timesheets ts
    where ts.deleted_at is null
    group by ts.project_id
  ),
  -- suma cheltuielilor DIRECTE (tag-uite pe numele proiectului), pe categorie logică
  direct as (
    select
      pr.id as pid,
      coalesce(sum(pl.suma_neta) filter (where pl.categorie = 'Materiale și consumabile'),0) as materiale,
      coalesce(sum(pl.suma_neta) filter (where pl.categorie = 'Subcontractori'),0) as subcontractori,
      coalesce(sum(pl.suma_neta) filter (where pl.categorie = 'Combustibil și transport'),0) as combustibil,
      coalesce(sum(pl.suma_neta) filter (where pl.categorie in ('Echipamente','Scule și unelte','Utilaje')),0) as echipamente
    from projects pr
    left join proiecte pn on pn.id = pr.pnl_proiect_id
    left join plati pl on pl.proiect = pn.nume and pn.nume is not null and pn.nume <> ''
    group by pr.id
  ),
  -- pot company-wide (proiect gol sau „Toate"), pe categorie logică
  company_pot as (
    select
      coalesce(sum(suma_neta) filter (where categorie = 'Materiale și consumabile'),0) as materiale,
      coalesce(sum(suma_neta) filter (where categorie = 'Subcontractori'),0) as subcontractori,
      coalesce(sum(suma_neta) filter (where categorie = 'Combustibil și transport'),0) as combustibil,
      coalesce(sum(suma_neta) filter (where categorie in ('Echipamente','Scule și unelte','Utilaje')),0) as echipamente,
      coalesce(sum(suma_neta) filter (where categorie in (
        'Alte cheltuieli','Asigurări și autorizații','Birou și administrativ',
        'Instructaje (traininguri)','Marketing și vânzări','PPE',
        'Servicii bancare și financiare',
        'Servicii profesionale (contabilitate, juridic, consultanță)','Taxe și impozite'
      )),0) as overheads
    from plati
    where proiect is null or proiect = '' or proiect = 'Toate'
  )
  select
    pr.id,
    -- 1. manoperă = cota de ore × total salarii
    case when total_hours > 0
      then round(coalesce(h.hours,0) / total_hours * total_wages)
      else 0 end,
    -- 2–5. direct + cota company-wide (după valoarea contractului)
    round(d.materiale     + case when total_contract > 0 and pr.active then pr.contract_value/total_contract * cp.materiale else 0 end),
    round(d.subcontractori+ case when total_contract > 0 and pr.active then pr.contract_value/total_contract * cp.subcontractori else 0 end),
    round(d.combustibil   + case when total_contract > 0 and pr.active then pr.contract_value/total_contract * cp.combustibil else 0 end),
    round(d.echipamente   + case when total_contract > 0 and pr.active then pr.contract_value/total_contract * cp.echipamente else 0 end),
    -- 6. overheads = pur cotă după valoarea contractului
    round(case when total_contract > 0 and pr.active then pr.contract_value/total_contract * cp.overheads else 0 end)
  from projects pr
  cross join company_pot cp
  left join direct d on d.pid = pr.id
  left join hours_by_project h on h.project_id = pr.id;
end $$;

revoke execute on function public.cvr_project_pnl_costs() from public, anon;
grant execute on function public.cvr_project_pnl_costs() to authenticated;
