-- Migration 0026: cvr_reads_pnl (brief 59, 12 Nov 2026). NOT applied yet: waits for Ana's yes.
-- Same statements as ~/projects/all-pnl-apps/briefs/59-cvr-reads-pnl.sql (begin/commit left out: a migration runs in one transaction).
-- Undo: ~/projects/all-pnl-apps/briefs/59-cvr-reads-pnl-undo.sql

-- Brief 59 (Ana, 12 Nov 2026): the CVR reads its costs from the P&L, and deleting a site keeps CVR, P&L and HR linked.
-- Socend Supabase project only (rvqsjxgybqbphrnhhyfz). Undo: 59-cvr-reads-pnl-undo.sql
-- A copy of this file lives in the CVR repo as supabase/migrations/0026_cvr_reads_pnl.sql.
--
-- What it does, in plain English:
--   1. Every P&L category gets a "CVR group" (categorii.grup_cvr): materiale, subcontractori, combustibil, echipamente,
--      regie (overheads), salarii, or nu (not a site cost). The P&L owns it (Admin > Categorii); the CVR only reads it.
--   2. One view of cost lines, pnl_cost_lines: one row per expense, or one row per part of a split expense, using exactly
--      the P&L's own split maths (costsplit.jsx splitAmounts). Planned rows ('Planificat') are left out.
--   3. The CVR cost screen (cvr_project_pnl_costs) reads only that view and the groups. Its own way of spreading
--      company-wide costs over active sites by contract value is unchanged (Ana: the two apps looking at costs from
--      different angles is fine). Its output columns are unchanged.
--   4. cvr_project_usage(site): counts what a site has before it is deleted (P&L rows incl. split parts, HR days and
--      assignments). Counts only, never amounts or names.
--   5. A deleted CVR site's P&L entry is DELETED when nothing in the P&L uses its name, otherwise closed (as before).
--   6. Deletes the closed leftover P&L entry "Petrachioaia - ADC" (10 Nov double-create), only if still unused.


-- ---------------------------------------------------------------------------------------------------------------
-- 1. categorii.grup_cvr
-- ---------------------------------------------------------------------------------------------------------------
alter table public.categorii add column if not exists grup_cvr text;

-- Seed. The list is the CVR's own hard-coded lists as they were (migration 0025), plus Ana's answers of 12 Nov 2026
-- for the names the CVR did not know. Names are matched ignoring capitals and Romanian accents (pnl_name_key), so
-- "ş" vs "ș" spellings cannot slip through.
update public.categorii c
   set grup_cvr = m.grup
  from (values
    -- what the CVR already counted as materials / subcontractors / transport
    ('Materiale și consumabile', 'materiale'),
    ('Subcontractori', 'subcontractori'),
    ('Combustibil și transport', 'combustibil'),
    ('Reparații auto', 'combustibil'),                 -- Ana, 12 Nov 2026: car repairs = transport
    -- equipment: the CVR's old names no longer exist; these are today's names
    ('Închiriere utilaje', 'echipamente'),
    ('Scule & Echipamente Mici', 'echipamente'),
    ('Unelte', 'echipamente'),
    ('Utilaje (Mijloace Fixe)', 'echipamente'),
    -- overheads: the CVR's old overheads list, with "Alte cheltuieli" now called "Alte cheltuieli (indirecte)"
    ('Alte cheltuieli (indirecte)', 'regie'),
    ('Asigurări și autorizații', 'regie'),
    ('Birou și administrativ', 'regie'),
    ('Instructaje (traininguri)', 'regie'),
    ('Marketing și vânzări', 'regie'),
    ('Echipamente protecție', 'regie'),
    ('Servicii bancare și financiare', 'regie'),
    ('Servicii profesionale (contabilitate, juridic, consultanță)', 'regie'),
    ('Taxe și impozite', 'regie'),
    ('Chirii (sediu, depozit)', 'regie'),
    ('Utilități', 'regie'),
    ('Întreținere / reparații', 'regie'),
    -- wages: spread by Pontaj hours, as before
    ('Salarii și contribuții', 'salarii'),
    -- not a site cost
    ('Investiții', 'nu'),                               -- Ana, 12 Nov 2026
    ('Rată împrumut', 'nu'),
    ('TVA de plată', 'nu')
  ) as m(nume, grup)
 where public.pnl_name_key(c.name) = public.pnl_name_key(m.nume)
   and c.grup_cvr is null;

-- Anything not in the list above: "not a cost" categories are 'nu'; every other one goes to 'regie', so a cost is
-- never silently dropped from the CVR (it is shared over the sites, or sits on its own site) until someone groups it.
update public.categorii set grup_cvr = case when nu_e_cost then 'nu' else 'regie' end where grup_cvr is null;

alter table public.categorii alter column grup_cvr set not null;
alter table public.categorii drop constraint if exists categorii_grup_cvr_check;
alter table public.categorii add constraint categorii_grup_cvr_check
  check (grup_cvr in ('materiale', 'subcontractori', 'combustibil', 'echipamente', 'regie', 'salarii', 'nu'));

-- A NEW category gets the same safe default when whoever adds it does not choose a group:
-- 'nu' if it is marked "not a cost", otherwise 'regie'. (A before-insert trigger, because a column default cannot
-- look at nu_e_cost. NOT NULL is checked after this trigger runs.)
create or replace function public.categorii_grup_cvr_default() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.grup_cvr is null then
    new.grup_cvr := case when coalesce(new.nu_e_cost, false) then 'nu' else 'regie' end;
  end if;
  return new;
end $$;

drop trigger if exists trg_categorii_grup_cvr_default on public.categorii;
create trigger trg_categorii_grup_cvr_default
  before insert on public.categorii
  for each row execute function public.categorii_grup_cvr_default();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. pnl_cost_lines: the P&L's cost lines, one per expense or per part of a split
-- ---------------------------------------------------------------------------------------------------------------
-- The split maths copies costsplit.jsx splitAmounts() step by step, IN FLOATING POINT (float8, the same IEEE doubles
-- JavaScript uses), so rounding at the half-ban comes out identical to the app:
--   t = Math.round(suma_neta * 100) / 100
--   %   split: part = t * valoare / 100
--   lei split: part = valoare, unless the parts no longer add up to t (more than 0.01 off): then t * valoare / sum
--   each part rounded to the ban (Math.round(x * 100) / 100 = floor(x * 100 + 0.5) / 100),
--   and the LAST part takes whatever is left, so the parts always add up to t.
-- A split is what hasSplit() in data.jsx accepts: mod 'procent' or 'lei' and at least two parts (the table's own
-- check constraint already guarantees that shape).
-- A part may later carry its own "categorie" (brief 60, splitting by category). A part without one has the row's
-- category. A part on 'Toate' is indirect (Ana, 12 Nov 2026).
-- Rows with no project and no split keep proiect = null (the P&L's "Costuri directe fără proiect").
-- security_invoker: whoever reads the view directly sees only what the plati / categorii rules let them see (P&L users).
-- The CVR reads it only through cvr_project_pnl_costs(), which runs as the database owner.
drop view if exists public.pnl_cost_lines;
create view public.pnl_cost_lines with (security_invoker = true) as
with base as (
  select p.id, p.data, p.status, p.categorie, p.proiect, p.tip_cost,
         p.impartire,
         -- t: the net amount rounded to the ban, as a double (JS _cs2)
         floor(p.suma_neta::float8 * 100 + 0.5) / 100 as t,
         (p.impartire is not null
            and p.impartire->>'mod' in ('procent', 'lei')
            and jsonb_typeof(p.impartire->'parti') = 'array'
            and jsonb_array_length(p.impartire->'parti') >= 2) as split
    from public.plati p
   where coalesce(p.status, '') <> 'Planificat'          -- planned rows are not costs yet (as in the CVR before)
),
parts as (
  select b.*, e.part, e.ord::int as ord,
         count(*) over (partition by b.id) as n,
         -- Number(p.valoare) || 0 : a number, or numeric text, else 0
         case when jsonb_typeof(e.part->'valoare') = 'number' then (e.part->>'valoare')::float8
              when jsonb_typeof(e.part->'valoare') = 'string'
               and btrim(e.part->>'valoare') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(e.part->>'valoare')::float8
              else 0::float8 end as v
    from base b
    cross join lateral jsonb_array_elements(b.impartire->'parti') with ordinality as e(part, ord)
   where b.split
),
raw as (
  select p.*,
         sum(p.v) over (partition by p.id) as sum_v,
         case when p.impartire->>'mod' = 'procent' then p.t * p.v / 100
              when sum(p.v) over (partition by p.id) > 0
               and abs(sum(p.v) over (partition by p.id) - p.t) > 0.01
                then p.t * p.v / sum(p.v) over (partition by p.id)
              else p.v end as r
    from parts p
),
rounded as (
  select r.*, floor(r.r * 100 + 0.5) / 100 as r2 from raw r
),
amounts as (
  select x.*,
         case when x.ord < x.n then x.r2
              -- last part: t minus the earlier parts (added up in order, as reduce() does), rounded to the ban
              else floor((x.t - coalesce(sum(x.r2) over (partition by x.id order by x.ord
                                   rows between unbounded preceding and 1 preceding), 0)) * 100 + 0.5) / 100
         end as suma
    from rounded x
),
lines as (
  -- split rows: one line per part
  select a.id as plata_id, a.ord as parte, true as impartit, a.data, a.status,
         nullif(a.part->>'proiect', '') as proiect,
         coalesce(nullif(a.part->>'categorie', ''), a.categorie) as categorie,
         a.tip_cost as tip_cost_rand,
         round(a.suma::numeric, 2) as suma_neta
    from amounts a
  union all
  -- every other row: one line, on its project (or none)
  select b.id, null::int, false, b.data, b.status,
         nullif(b.proiect, ''),
         b.categorie,
         b.tip_cost,
         round(b.t::numeric, 2)
    from base b
   where not b.split
)
select l.plata_id,
       l.parte,                    -- 1, 2, ... for a split part; null for a whole row
       l.impartit,
       l.data,
       l.proiect,                  -- project NAME as the P&L stores it; null = no project
       l.categorie,
       c.grup_cvr,                 -- null only if the row's category is not in the category list
       -- the P&L's cost type (costsplit.jsx tipCostOf): none for "not a cost"; a split part on Toate is indirect;
       -- else the row's own switch, else on Toate indirect, else the category's type, else direct
       case when coalesce(c.nu_e_cost, false) then null
            when l.impartit and l.proiect = 'Toate' then 'indirect'
            when l.tip_cost_rand is not null then l.tip_cost_rand
            when not l.impartit and l.proiect = 'Toate' then 'indirect'
            else coalesce(c.tip_cost, 'direct')
       end as tip_cost,
       l.suma_neta,                -- net lei of this line (of this part, for a split)
       l.status
  from lines l
  left join public.categorii c on c.name = l.categorie;

comment on view public.pnl_cost_lines is
  'Brief 59: P&L cost lines, one per expense or per split part, same split maths as costsplit.jsx. Planned rows excluded. Read by cvr_project_pnl_costs().';

revoke all on public.pnl_cost_lines from public, anon;
grant select on public.pnl_cost_lines to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. cvr_project_pnl_costs: same output, now reading only pnl_cost_lines + grup_cvr
-- ---------------------------------------------------------------------------------------------------------------
-- Unchanged on purpose: who may call it (admin / finance), wages spread by Pontaj hours (overhead sites' share goes to
-- overheads), and company-wide costs (no project, or 'Toate') spread over active, non-overhead sites by contract value.
-- Changed: categories come from grup_cvr instead of typed names; split parts land on their own projects; and a
-- 'regie' cost put on one site now counts in that site's overheads (before, it was dropped from the CVR entirely).
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
  total_hours numeric;        -- all hours, overhead sites included
  overhead_hours numeric;     -- hours on overhead sites (e.g. Paza)
  project_hours numeric;      -- hours on real sites
  overhead_wages numeric;     -- wages that belong to overhead sites, go to overheads
  project_wages numeric;      -- wages shared over real sites by hours
begin
  if public.cvr_role() not in ('admin','finance') then
    raise exception 'Doar biroul poate vedea costurile din P&L';
  end if;

  select coalesce(sum(contract_value),0) into total_contract
  from projects where active and contract_value > 0 and not is_overhead;

  -- every wage line, whatever its project (as before)
  select coalesce(sum(suma_neta),0) into total_wages
  from pnl_cost_lines where grup_cvr = 'salarii';

  select coalesce(sum(regular_hours + overtime_hours),0) into total_hours
  from pontaj_timesheets where deleted_at is null;

  select coalesce(sum(ts.regular_hours + ts.overtime_hours),0) into overhead_hours
  from pontaj_timesheets ts
  join projects p on p.id = ts.project_id
  where ts.deleted_at is null and p.is_overhead;

  project_hours := total_hours - overhead_hours;

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
  -- costs put on a site (whole rows and split parts), by the site's linked P&L name
  direct as (
    select
      pr.id as pid,
      coalesce(sum(l.suma_neta) filter (where l.grup_cvr = 'materiale'),0) as materiale,
      coalesce(sum(l.suma_neta) filter (where l.grup_cvr = 'subcontractori'),0) as subcontractori,
      coalesce(sum(l.suma_neta) filter (where l.grup_cvr = 'combustibil'),0) as combustibil,
      coalesce(sum(l.suma_neta) filter (where l.grup_cvr = 'echipamente'),0) as echipamente,
      coalesce(sum(l.suma_neta) filter (where l.grup_cvr = 'regie'),0) as regie
    from projects pr
    left join proiecte pn on pn.id = pr.pnl_proiect_id
    left join pnl_cost_lines l on l.proiect = pn.nume and pn.nume is not null and pn.nume <> '' and pn.nume <> 'Toate'
    group by pr.id
  ),
  -- company-wide costs: no project, or 'Toate' (a split part on 'Toate' too)
  company_pot as (
    select
      coalesce(sum(suma_neta) filter (where grup_cvr = 'materiale'),0) as materiale,
      coalesce(sum(suma_neta) filter (where grup_cvr = 'subcontractori'),0) as subcontractori,
      coalesce(sum(suma_neta) filter (where grup_cvr = 'combustibil'),0) as combustibil,
      coalesce(sum(suma_neta) filter (where grup_cvr = 'echipamente'),0) as echipamente,
      coalesce(sum(suma_neta) filter (where grup_cvr = 'regie'),0) as overheads
    from pnl_cost_lines
    where proiect is null or proiect = '' or proiect = 'Toate'
  )
  select
    pr.id,
    case when project_hours > 0 and not pr.is_overhead
      then round(coalesce(h.hours,0) / project_hours * project_wages)
      else 0 end,
    round(d.materiale     + case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.materiale else 0 end),
    round(d.subcontractori+ case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.subcontractori else 0 end),
    round(d.combustibil   + case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.combustibil else 0 end),
    round(d.echipamente   + case when total_contract > 0 and pr.active and not pr.is_overhead then pr.contract_value/total_contract * cp.echipamente else 0 end),
    round(d.regie
          + case when total_contract > 0 and pr.active and not pr.is_overhead
                 then pr.contract_value/total_contract * (cp.overheads + overhead_wages)
                 else 0 end)
  from projects pr
  cross join company_pot cp
  left join direct d on d.pid = pr.id
  left join hours_by_project h on h.project_id = pr.id;
end $$;

-- same rights as before: logged-in users (the function itself checks the CVR role)
revoke all on function public.cvr_project_pnl_costs() from public, anon;
grant execute on function public.cvr_project_pnl_costs() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Is a P&L entry still used? (one place, used by the delete trigger and the one-time clean-up below)
-- ---------------------------------------------------------------------------------------------------------------
-- "Used" = any payment or income row on its name (incl. a split part, or the HR project written on a fuel receipt),
-- a contract pointing at it, a cash-flow rule on its name, or another CVR site linked to it. Names are compared
-- ignoring capitals and accents: when in doubt, keep the entry.
create or replace function public.pnl_proiect_in_use(p_id uuid, p_except_site uuid default null) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  k text;
begin
  select pnl_name_key(nume) into k from proiecte where id = p_id;
  if k is null then return false; end if;
  if k = pnl_name_key('Toate') then return true; end if;   -- never remove Toate
  return exists (select 1 from projects where pnl_proiect_id = p_id and id is distinct from p_except_site)
      or exists (select 1 from plati where pnl_name_key(proiect) = k or pnl_name_key(proiect_hr) = k)
      or exists (select 1 from plati pl, jsonb_array_elements(pl.impartire->'parti') x
                  where pl.impartire is not null and jsonb_typeof(pl.impartire->'parti') = 'array'
                    and pnl_name_key(x->>'proiect') = k)
      or exists (select 1 from incasari where pnl_name_key(proiect) = k)
      or exists (select 1 from contracte where proiect_id = p_id)
      or exists (select 1 from cashflow_reguli where pnl_name_key(proiect) = k);
end $$;

-- internal helper: not callable from the apps
revoke all on function public.pnl_proiect_in_use(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. A CVR site deleted: its P&L entry is DELETED when nothing uses it, otherwise closed (safety net)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.cvr_close_pnl_proiect() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.pnl_proiect_id is null then
    return old;
  end if;
  if pnl_proiect_in_use(old.pnl_proiect_id, old.id) then
    update proiecte set activ = false where id = old.pnl_proiect_id;   -- old rows keep the name
  else
    delete from proiecte where id = old.pnl_proiect_id;                 -- nothing refers to it: gone from the P&L too
  end if;
  return old;
end $$;
-- the trigger trg_cvr_close_pnl_proiect (after delete on projects) already calls this function: nothing to recreate

-- ---------------------------------------------------------------------------------------------------------------
-- 6. What a site has, before deleting it (for the CVR's delete window)
-- ---------------------------------------------------------------------------------------------------------------
-- Counts only. Works for any office CVR login (admin / finance: the roles that may delete a site), P&L user or not.
-- P&L rows are matched on the site's own name AND its linked P&L entry's name, ignoring capitals and accents.
-- Pontaj rows are matched by site id. A Pontaj day deleted in HR is only marked deleted and still blocks the delete,
-- so it is counted on its own (pontaj_zile_sterse).
create or replace function public.cvr_project_usage(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  keys text[];
  pid uuid;
begin
  if public.cvr_role() not in ('admin','finance') then
    raise exception 'Doar biroul poate șterge proiecte';
  end if;

  select pr.pnl_proiect_id,
         array_remove(array[pnl_name_key(pr.name), pnl_name_key(pn.nume)], null)
    into pid, keys
    from projects pr left join proiecte pn on pn.id = pr.pnl_proiect_id
   where pr.id = p_project_id;
  if not found then
    raise exception 'Proiectul nu mai există';
  end if;
  keys := array_remove(keys, '');

  return jsonb_build_object(
    'plati',            (select count(*) from plati where pnl_name_key(proiect) = any(keys) or pnl_name_key(proiect_hr) = any(keys)),
    'plati_impartite',  (select count(distinct pl.id) from plati pl, jsonb_array_elements(pl.impartire->'parti') x
                          where pl.impartire is not null and jsonb_typeof(pl.impartire->'parti') = 'array'
                            and pnl_name_key(x->>'proiect') = any(keys)),
    'incasari',         (select count(*) from incasari where pnl_name_key(proiect) = any(keys)),
    'contracte',        (select count(*) from contracte where pid is not null and proiect_id = pid),
    'reguli',           (select count(*) from cashflow_reguli where pnl_name_key(proiect) = any(keys)),
    'pontaj_zile',      (select count(*) from pontaj_timesheets where project_id = p_project_id and deleted_at is null),
    'pontaj_zile_sterse', (select count(*) from pontaj_timesheets where project_id = p_project_id and deleted_at is not null),
    'pontaj_alocari',   (select count(*) from pontaj_assignments where project_id = p_project_id),
    'pontaj_vehicule',  (select count(*) from pontaj_fleet_assignments where project_id = p_project_id)
  );
end $$;

revoke all on function public.cvr_project_usage(uuid) from public, anon;
grant execute on function public.cvr_project_usage(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. One-time clean-up: the closed leftover "Petrachioaia - ADC" (Ana, 12 Nov 2026), only if still closed and unused
-- ---------------------------------------------------------------------------------------------------------------
delete from public.proiecte
 where id = '7f3c1d38-7bd9-44ff-b7a5-26f12b9281fd'
   and nume = 'Petrachioaia - ADC'
   and not activ
   and not public.pnl_proiect_in_use(id);

