-- Migration: cvr_close_day
-- RPC-ul prin care șantierul salvează ziua: scrie intrările zilnice și
-- incrementează done pe livrabile ÎNTR-O SINGURĂ tranzacție (funcția întreagă).
-- security definer: rulează cu drepturile owner-ului, deci site nu are nevoie
-- de UPDATE direct pe deliverables/tasks; verificarea de rol se face înăuntru.

create or replace function public.cvr_close_day(entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
begin
  if public.cvr_role() not in ('site', 'admin', 'finance') then
    raise exception 'Rol fără drept de raportare zilnică';
  end if;

  for e in
    select * from jsonb_to_recordset(entries) as x(deliverable_id uuid, qty numeric)
  loop
    -- cantitățile goale sau 0 nu produc rânduri
    if e.deliverable_id is null or e.qty is null or e.qty <= 0 then
      continue;
    end if;

    insert into cvr_daily_entries (deliverable_id, entry_date, qty, created_by)
    values (e.deliverable_id, current_date, e.qty, auth.uid());

    update deliverables set qty_done = qty_done + e.qty where id = e.deliverable_id;

    -- primul progres pe un task neînceput îl trece automat „în lucru"
    update tasks t
    set status = 'in_lucru'
    from deliverables d
    where d.id = e.deliverable_id
      and t.id = d.task_id
      and t.status = 'neinceput';
  end loop;
end $$;

revoke execute on function public.cvr_close_day(jsonb) from public;
revoke execute on function public.cvr_close_day(jsonb) from anon;
grant execute on function public.cvr_close_day(jsonb) to authenticated;
