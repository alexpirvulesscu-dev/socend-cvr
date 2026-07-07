-- Migration: cvr_project_lifecycle
-- Aditiv: coloane noi pe `projects` pentru
--   1. bucket-ul de proiecte finalizate (active)
--   2. compatibilitatea cu Pontaj (location — schema veche Pontaj o avea)
--   3. legătura cu tabelul `proiecte` al aplicației P&L (sincronizarea activ/nume)
alter table projects add column if not exists active boolean not null default true;
alter table projects add column if not exists location text;
alter table projects add column if not exists pnl_proiect_id uuid references proiecte(id) on delete set null;

create index if not exists idx_projects_active on projects(active);
