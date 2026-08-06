-- Migration: pnl_costs_overhead_wages
--
-- Salariile de pe proiectele de REGIE (is_overhead: paza) nu mai sunt împărțite
-- pe lucrări după ore, ci intră la overheads, ca orice alt cost permanent.
-- Decizia lui Alex (2026-08-06): „Paza e overhead, deci du-o la overhead. Se
-- calculează ca un cost total, nu în ore. Salariul paznicului se adaugă la
-- overheads."
--
-- Ce se schimbă față de 0013:
--   - numitorul manoperei = orele de pe proiectele REALE (fără regie), deci
--     lucrările nu mai apar mai ieftine decât sunt;
--   - partea de salarii care revine regiei se mută în oala de overheads și se
--     împarte după valoarea contractului, ca celelalte cheltuieli generale.
--
-- Astăzi efectul e zero (în P&L nu există încă rânduri „Salarii și contribuții"),
-- dar regula e pusă la loc înainte să apară.

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
  total_hours numeric;        -- toate orele, inclusiv regia
  overhead_hours numeric;     -- orele de pe proiectele de regie
  project_hours numeric;      -- orele de pe lucrările reale
  overhead_wages numeric;     -- salariile care revin regiei → overheads
  project_wages numeric;      -- salariile care se împart pe lucrări
begin
  if public.cvr_role() not in ('admin','finance') then
    raise exception 'Doar biroul poate vedea costurile din P&L';
  end if;

  select coalesce(sum(contract_value),0) into total_contract
  from projects where active and contract_value > 0 and not is_overhead;

  select coalesce(sum(suma_neta),0) into total_wages
  from plati where categorie = 'Salarii și contribuții';

  select coalesce(sum(regular_hours + overtime_hours),0) into total_hours
  from pontaj_timesheets where deleted_at is null;

  select coalesce(sum(ts.regular_hours + ts.overtime_hours),0) into overhead_hours
  from pontaj_timesheets ts
  join projects p on p.id = ts.project_id
  where ts.deleted_at is null and p.is_overhead;

  project_hours := total_hours - overhead_hours;

  -- salariile se despart proporțional cu orele, o singură dată
  overhead_wages := case when total_hours > 0
                         then total_wages * overhead_hours / total_hours
                         else 0 end;
  project_wages := total_wages - overhead_wages;

  return query
  with hours_by_project as (
    select ts.project_id, sum(ts.regular_hours + ts.overtime_hours) as hours
    from pontaj_timesheets ts
    join projects p on p.id = ts.project_id
    where ts.deleted_at is null and not p.is_overhead
    group by ts.project_id
  ),
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
    -- manoperă: cota de ore DIN LUCRĂRILE REALE × salariile rămase pe lucrări
    case when project_hours > 0 and not pr.is_overhead
      then round(coalesce(h.hours,0) / project_hours * project_wages)
      else 0 end,
    round(d.materiale     + case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.materiale else 0 end),
    round(d.subcontractori+ case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.subcontractori else 0 end),
    round(d.combustibil   + case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.combustibil else 0 end),
    round(d.echipamente   + case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.echipamente else 0 end),
    -- overheads: cheltuielile generale + salariile de regie (paza), tot după contract
    round(case when total_contract > 0 and pr.active and not pr.is_overhead
               then pr.contract_value/total_contract * (cp.overheads + overhead_wages)
               else 0 end)
  from projects pr
  cross join company_pot cp
  left join direct d on d.pid = pr.id
  left join hours_by_project h on h.project_id = pr.id;
end $$;

revoke execute on function public.cvr_project_pnl_costs() from public, anon;
grant execute on function public.cvr_project_pnl_costs() to authenticated;
