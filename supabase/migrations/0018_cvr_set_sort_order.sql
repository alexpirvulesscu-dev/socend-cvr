-- Migration: cvr_set_sort_order
-- Reordonarea prin drag & drop se salva cu câte un UPDATE pe rând (15 proiecte =
-- 15 cereri). Dacă pica una la mijloc, ordinea rămânea salvată PE JUMĂTATE, fără
-- ca cineva să afle. Aici e o singură cerere, într-o singură tranzacție.
--
-- p_table e restrâns la cele trei tabele-schelet (whitelist explicită, ca să nu
-- existe niciun drum de la parametru la SQL arbitrar).

create or replace function public.cvr_set_sort_order(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker           -- rulează cu drepturile apelantului: RLS se aplică normal
set search_path = public
as $$
begin
  if p_table = 'projects' then
    update projects p set sort_order = x.ord
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) x
    where p.id = x.id;
  elsif p_table = 'jobs' then
    update jobs j set sort_order = x.ord
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) x
    where j.id = x.id;
  elsif p_table = 'tasks' then
    update tasks t set sort_order = x.ord
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) x
    where t.id = x.id;
  else
    raise exception 'Tabel neacceptat pentru reordonare: %', p_table;
  end if;
end $$;

revoke execute on function public.cvr_set_sort_order(text, uuid[]) from public, anon;
grant execute on function public.cvr_set_sort_order(text, uuid[]) to authenticated;
