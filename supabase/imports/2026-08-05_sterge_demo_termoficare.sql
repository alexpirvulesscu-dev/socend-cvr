-- Ștergerea datelor DEMO de pe „Termoficare București" (cerută de Alex).
--
-- ATENȚIE: se șterge doar STRATUL CVR de demo. Rândul proiectului RĂMÂNE,
-- pentru că pe el atârnă pontaje reale (634 pontaje, 5.667 ore, 24 oameni,
-- 2 mart. – 5 aug. 2026). `pontaj_timesheets.project_id` e ON DELETE NO ACTION,
-- deci ștergerea proiectului ar fi eșuat oricum — baza se apără singură.
--
-- Ce s-a șters (tot creat de migrările de seed, fără autor uman):
--   5 joburi → 25 taskuri → 45 livrabile → 548 raportări zilnice
--   25 bugete pe categorii, 5 situații de lucrări pe job, 18 costuri
--   5 variații, 1 rând de facturare pe proiect, 334 rânduri labour_stub
-- Verificat înainte: nicio raportare nu avea `created_by`, toate create
-- într-un singur lot (2026-07-06 / 07-27) — adică seed, nu muncă reală.

do $$
declare v_proj uuid;
begin
  select id into v_proj from projects
   where name = 'Termoficare București' and pnl_proiect_id is null;
  if v_proj is null then raise notice 'Proiectul demo nu există.'; return; end if;

  -- plasă de siguranță: dacă între timp Pontajul a repartizat ore pe joburile
  -- acestui proiect, nu se șterge nimic
  if exists (select 1 from pontaj_timesheets where project_id = v_proj and job_id is not null) then
    raise exception 'Există pontaje repartizate pe joburile acestui proiect — nu șterg nimic';
  end if;

  delete from cvr_variations  where project_id = v_proj;
  delete from cvr_billing     where project_id = v_proj;
  delete from cvr_labour_stub where project_id = v_proj;
  delete from jobs            where project_id = v_proj;

  update projects set contract_value = 0 where id = v_proj;
end $$;
