-- Migration: cvr_deliverable_mandays (feedback Alex, 8 iulie, runda 4)
-- Ținta de efort se dă PE LIVRABIL (nu pe task). Efortul planificat al taskului
-- devine suma livrabilelor; tasks.planned_man_days rămâne doar ca fallback
-- pentru taskurile setate înainte de această schimbare.
alter table deliverables add column if not exists planned_man_days numeric;
