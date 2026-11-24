-- Migration 0033: cvr_tracker_segment_notes (24 nov. 2026)
-- Notele unei porțiuni de pe traseu devin o listă de comentarii cu dată:
-- fiecare notă are ziua ei și poate fi modificată sau ștearsă.
-- Tabel nou, aditiv. Notele vechi (cvr_tracker_segments.note) se copiază ca
-- primă notă a porțiunii; coloana veche rămâne neatinsă.

create table if not exists cvr_tracker_segment_notes (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  segment_code text not null,
  note_date date not null default current_date,
  body text not null check (length(trim(body)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cvr_tracker_segment_notes on cvr_tracker_segment_notes(tracker_id, segment_code);

drop trigger if exists trg_touch_tracker_segment_notes on cvr_tracker_segment_notes;
create trigger trg_touch_tracker_segment_notes
  before update on cvr_tracker_segment_notes
  for each row execute function public.cvr_touch_updated_at();

alter table cvr_tracker_segment_notes enable row level security;
drop policy if exists "read_cvr_tracker_segment_notes" on cvr_tracker_segment_notes;
create policy "read_cvr_tracker_segment_notes" on cvr_tracker_segment_notes for select to authenticated
  using (public.cvr_role() in ('admin','finance','site'));
drop policy if exists "office_write_cvr_tracker_segment_notes" on cvr_tracker_segment_notes;
create policy "office_write_cvr_tracker_segment_notes" on cvr_tracker_segment_notes for all to authenticated
  using (public.cvr_role() in ('admin','finance'))
  with check (public.cvr_role() in ('admin','finance'));

-- notele existente devin prima notă a porțiunii (o singură dată)
insert into cvr_tracker_segment_notes (tracker_id, segment_code, note_date, body, created_by)
select s.tracker_id, s.code, current_date, trim(s.note), null
  from cvr_tracker_segments s
 where s.note is not null and trim(s.note) <> ''
   and not exists (select 1 from cvr_tracker_segment_notes n
                    where n.tracker_id = s.tracker_id and n.segment_code = s.code);
