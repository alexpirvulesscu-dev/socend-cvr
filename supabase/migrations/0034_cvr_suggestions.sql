-- Migration 0034: cvr_suggestions (25 nov. 2026)
-- Ecranul „Sugestii", ca în aplicația Socend HR: probleme și idei pentru o
-- aplicație mai bună. Față de HR, sugestia are două câmpuri: un titlu scurt
-- (cel mult 80 de caractere) și informații suplimentare, cât e nevoie.
-- Tabel nou, aditiv. Numele îl scrie omul (conturile pot fi folosite la comun).

create table if not exists cvr_suggestions (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (length(trim(author_name)) > 0),
  title text not null check (length(trim(title)) between 1 and 80),
  details text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table cvr_suggestions enable row level security;
drop policy if exists "read_cvr_suggestions" on cvr_suggestions;
create policy "read_cvr_suggestions" on cvr_suggestions for select to authenticated
  using (public.cvr_role() in ('admin','finance'));
drop policy if exists "insert_cvr_suggestions" on cvr_suggestions;
create policy "insert_cvr_suggestions" on cvr_suggestions for insert to authenticated
  with check (public.cvr_role() in ('admin','finance'));
