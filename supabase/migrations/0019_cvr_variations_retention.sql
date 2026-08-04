-- Migration: cvr_variations_retention (CVR v4 — Panou + Variații)
--
-- 1) VARIAȚII (lucrări suplimentare / dispoziții de șantier): lucrări în plus
--    propuse clientului, care apoi sunt aprobate sau respinse. Până acum CVR nu
--    avea deloc noțiunea asta, deși e bani în joc: cele „în așteptare" sunt
--    venit nesigur, iar cele aprobate sunt muncă de adăugat în proiect.
--
--    NOTĂ de model: variațiile aprobate NU rescriu `projects.contract_value` —
--    aceea rămâne suma taskurilor (triggerul din 0015). Când lucrarea chiar e
--    aprobată, taskurile se adaugă normal și valoarea urmează singură. Registrul
--    de variații e urma comercială + prognoza, ca să nu avem două adevăruri
--    despre valoarea contractului.
--
-- 2) GARANȚIA DE BUNĂ EXECUȚIE (retenția) reținută din situații — bani care
--    există, dar pe care nu-i vedeai nicăieri.
-- 3) DATA FACTURII pe situația fiecărui job, ca „certificat neîncasat" să poată
--    fi îmbătrânit („în medie de 34 de zile").
--
-- Totul aditiv. Nu atinge tabelele P&L (proiecte/plati/incasari) sau pontaj_*.

-- ── 1) Registrul de variații ─────────────────────────────────────────────
create table if not exists cvr_variations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  ref text not null,                       -- VO-001, VO-002… per proiect
  description text not null default '',
  -- poate fi NEGATIVĂ: o variație poate scădea valoarea (lucrare renunțată)
  amount numeric(14,2) not null default 0,
  status text not null default 'in_asteptare'
    check (status in ('in_asteptare','aprobata','respinsa')),
  submitted_date date not null default current_date,
  decided_date date,                       -- completată când se aprobă/respinge
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cvr_variations_project on cvr_variations(project_id);

alter table cvr_variations enable row level security;

-- bani: DOAR admin/finance (site nu vede bani), ca la cvr_job_billing
drop policy if exists "money_all_variations" on cvr_variations;
create policy "money_all_variations" on cvr_variations for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

drop trigger if exists trg_touch_variations on cvr_variations;
create trigger trg_touch_variations
  before update on cvr_variations
  for each row execute function public.cvr_touch_updated_at();

-- ── 2) Garanția de bună execuție, pe proiect ─────────────────────────────
-- procent din situație reținut de client până la recepția finală (ex. 5 sau 10)
alter table projects add column if not exists retentie_pct numeric not null default 0;

-- ── 3) Data ultimei facturi, pe situația jobului ─────────────────────────
alter table cvr_job_billing add column if not exists data_facturii date;
