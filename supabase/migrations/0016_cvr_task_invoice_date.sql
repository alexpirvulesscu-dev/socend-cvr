-- Migration: cvr_task_invoice_date
-- Data-țintă la care planificăm să facturăm taskul. Se setează manual din birou;
-- rămâne null cât timp nu e planificată. Aditiv, nullable — nu atinge nimic
-- existent. Va alimenta mai târziu prognoza de cash (când se facturează ce).
alter table tasks add column if not exists target_invoice_date date;
