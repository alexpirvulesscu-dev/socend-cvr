-- Migration: cvr_rls
-- RLS pornit pe TOATE tabelele create de acest proiect. Fără acces anonim.
-- Roluri (din metadata utilizatorului auth, cheia "role"):
--   admin   → totul
--   finance → totul (nu există încă tabel de settings; când apare, se exclude acolo)
--   site    → citește scheletul, scrie doar intrările zilnice
-- Închiderea zilei de pe șantier va folosi un RPC security definer (faza 4),
-- deci site NU primește update direct pe deliverables/tasks.

-- ── Helper: rolul CVR al utilizatorului logat ────────────────────────────
-- Citește întâi app_metadata (setat doar de admin, sigur), apoi user_metadata.
create or replace function public.cvr_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    ''
  )
$$;

-- ── RLS pornit peste tot ─────────────────────────────────────────────────
alter table projects enable row level security;
alter table jobs enable row level security;
alter table tasks enable row level security;
alter table deliverables enable row level security;
alter table cvr_job_budgets enable row level security;
alter table cvr_cost_entries enable row level security;
alter table cvr_daily_entries enable row level security;
alter table cvr_billing enable row level security;
alter table cvr_labour_stub enable row level security;

-- ── Scheletul: toate rolurile citesc, doar admin/finance scriu ───────────
create policy "skeleton_select_projects" on projects for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
create policy "skeleton_write_projects" on projects for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

create policy "skeleton_select_jobs" on jobs for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
create policy "skeleton_write_jobs" on jobs for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

create policy "skeleton_select_tasks" on tasks for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
create policy "skeleton_write_tasks" on tasks for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

create policy "skeleton_select_deliverables" on deliverables for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
create policy "skeleton_write_deliverables" on deliverables for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

-- ── Bani (bugete, costuri, facturare): DOAR admin/finance, site nu vede ──
create policy "money_all_budgets" on cvr_job_budgets for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

create policy "money_all_costs" on cvr_cost_entries for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

create policy "money_all_billing" on cvr_billing for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

-- ── Intrări zilnice: site poate citi/insera/actualiza; admin/finance tot ─
create policy "daily_select" on cvr_daily_entries for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
create policy "daily_insert" on cvr_daily_entries for insert to authenticated
  with check (public.cvr_role() in ('admin','finance','site'));
create policy "daily_update" on cvr_daily_entries for update to authenticated
  using (public.cvr_role() in ('admin','finance','site'))
  with check (public.cvr_role() in ('admin','finance','site'));
create policy "daily_delete_office" on cvr_daily_entries for delete to authenticated
  using (public.cvr_role() in ('admin','finance'));

-- ── Stub manoperă: toate rolurile citesc (pentru labour_today), birou scrie ─
create policy "labour_select" on cvr_labour_stub for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
create policy "labour_write" on cvr_labour_stub for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));
