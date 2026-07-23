-- Migration: cvr_hardening_contract_sync (audit pre-PR v3)
--
-- 1) SECURITATE: cvr_role() citea și user_metadata ca fallback. user_metadata
--    poate fi rescrisă de UTILIZATORUL ÎNSUȘI (supabase.auth.updateUser din
--    consola browserului, cu cheia publică) — deci un cont „site" fără rol în
--    app_metadata s-ar fi putut auto-promova la admin. Toți utilizatorii au
--    rolul în app_metadata (verificat înainte de migrare), așa că fallback-ul
--    se elimină: rolul vine EXCLUSIV din app_metadata (doar adminul o scrie).
--
-- 2) CONSISTENȚĂ: projects.contract_value trebuie să fie mereu suma valorilor
--    taskurilor (așa o calculează wizard-ul la creare, așa o afișează UI-ul,
--    și pe ea se repartizează costurile company-wide din P&L). Editarea inline
--    a valorii unui task (v3) o poate desincroniza — un trigger o ține la zi
--    pe orice insert/update/delete de task și la mutarea joburilor între
--    proiecte. Aditiv; nu atinge tabelele P&L sau pontaj_*.

-- ── 1) cvr_role fără fallback pe user_metadata ───────────────────────────
-- (aceeași formă ca în 0002, doar fără ramura user_metadata)
create or replace function public.cvr_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  )
$$;

-- ── 2) contract_value = suma taskurilor, întreținută de trigger ──────────
create or replace function public.cvr_sync_contract_value()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pid uuid;
  old_pid uuid;
begin
  -- proiectul afectat de rândul nou/actualizat
  if tg_op in ('INSERT', 'UPDATE') then
    select j.project_id into pid from jobs j where j.id = new.job_id;
  end if;
  -- la ștergere sau la mutarea taskului pe alt job, recalculează și vechiul proiect
  if tg_op in ('DELETE', 'UPDATE') then
    select j.project_id into old_pid from jobs j where j.id = old.job_id;
  end if;

  if pid is not null then
    update projects p set contract_value = coalesce((
      select sum(t.value) from tasks t join jobs j on j.id = t.job_id
      where j.project_id = p.id
    ), 0) where p.id = pid;
  end if;
  if old_pid is not null and old_pid is distinct from pid then
    update projects p set contract_value = coalesce((
      select sum(t.value) from tasks t join jobs j on j.id = t.job_id
      where j.project_id = p.id
    ), 0) where p.id = old_pid;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_sync_contract_value on tasks;
create trigger trg_sync_contract_value
  after insert or update of value, job_id or delete on tasks
  for each row execute function public.cvr_sync_contract_value();

-- Backfill: aliniază valorile existente, DOAR pentru proiectele care au taskuri
-- (cele fără taskuri își păstrează valoarea introdusă manual).
update projects p
set contract_value = s.total
from (
  select j.project_id, sum(t.value) as total
  from tasks t join jobs j on j.id = t.job_id
  group by j.project_id
) s
where s.project_id = p.id and p.contract_value is distinct from s.total;
