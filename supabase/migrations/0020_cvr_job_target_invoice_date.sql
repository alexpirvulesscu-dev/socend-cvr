-- Data-țintă de facturare la nivel de JOB.
--
-- Până acum ținta exista doar pe task (tasks.target_invoice_date, migrarea 0016).
-- În practică se facturează un job întreg la o dată („PT2 se facturează pe 15
-- august"), nu task cu task. Coloana asta e planul jobului; taskurile fără dată
-- proprie o moștenesc (moștenirea se face în aplicație, nu în bază, ca ținta
-- explicită a unui task să rămână mereu mai tare decât cea a jobului).
--
-- Stă în cvr_job_billing (nu în jobs) pentru că e informație comercială: tabelul
-- acela e vizibil doar pentru admin și finance, iar șantierul nu-l poate citi.
-- Aditiv: nu se șterge și nu se modifică nimic existent.

alter table public.cvr_job_billing
  add column if not exists target_invoice_date date;

comment on column public.cvr_job_billing.target_invoice_date is
  'Data la care vrem să facturăm jobul. Taskurile fără target_invoice_date propriu o moștenesc.';
