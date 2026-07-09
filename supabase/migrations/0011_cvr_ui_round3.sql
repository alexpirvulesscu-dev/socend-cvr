-- Migration: cvr_ui_round3 (feedback Alex, 8 iulie)
-- Aditiv, doar pe tabelele CVR:
--   1. projects.is_small    → secțiunea „Proiecte mici" (agregat separat, nu poluează lista)
--   2. projects.sort_order  → ordonarea manuală prin drag & drop
--   3. tasks.planned_man_days → ținta de efort (oameni-zile) pe task; efortul
--      consumat vine din labour_daily (stub azi, Pontaj mâine)
alter table projects add column if not exists is_small boolean not null default false;
alter table projects add column if not exists sort_order int not null default 0;
alter table tasks add column if not exists planned_man_days numeric;

create index if not exists idx_projects_sort on projects(sort_order);
