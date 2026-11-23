-- Migration 0030: cvr_tracker_checkpoints (23 nov. 2026)
-- „Cum stăm azi" măsoară DOAR ce e terminat, prin puncte de control:
-- „cu săpătura am ajuns la VJ47". Porțiunile până acolo se bifează, iar ziua
-- bifei se salvează discret pe fiecare porțiune.
-- Jurnalul zilnic devine o singură foaie: un rând pe zi, coloanele din Excel
-- (Tranșee, Console, Sudură echipa 1 / echipa 2) + observații.
-- Jurnalul vechi (cvr_tracker_entries, 0027/0029) nu se mai citește; rândurile rămân ca istoric.

-- ── Bifele: o porțiune, o lucrare, ziua în care a fost gata ──────────────
create table if not exists cvr_tracker_marks (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  segment_code text not null,
  stage text not null,
  done_on date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tracker_id, segment_code, stage)
);

-- ── Punctele de control: „am ajuns cu X la VJ47, venind de la VJ80" ─────
create table if not exists cvr_tracker_checkpoints (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  stage text not null,
  from_pt text not null,
  at_pt text not null,
  done_on date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_cvr_tracker_checkpoints on cvr_tracker_checkpoints(tracker_id, stage, created_at);

-- ── Jurnalul zilnic: un rând pe zi ──────────────────────────────────────
create table if not exists cvr_tracker_days (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references cvr_trackers(id) on delete cascade,
  work_date date not null,
  qty jsonb not null default '{}'::jsonb,   -- {coloană: cantitate}, coloanele din config.dailyColumns
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracker_id, work_date)
);
drop trigger if exists trg_touch_tracker_days on cvr_tracker_days;
create trigger trg_touch_tracker_days
  before update on cvr_tracker_days
  for each row execute function public.cvr_touch_updated_at();

alter table cvr_tracker_marks enable row level security;
alter table cvr_tracker_checkpoints enable row level security;
alter table cvr_tracker_days enable row level security;
do $$
declare t text;
begin
  foreach t in array array['cvr_tracker_marks','cvr_tracker_checkpoints','cvr_tracker_days']
  loop
    execute format('drop policy if exists "read_%1$s" on %1$I', t);
    execute format($p$create policy "read_%1$s" on %1$I for select to authenticated
                      using (public.cvr_role() in ('admin','finance','site'))$p$, t);
    execute format('drop policy if exists "office_write_%1$s" on %1$I', t);
    execute format($p$create policy "office_write_%1$s" on %1$I for all to authenticated
                      using (public.cvr_role() in ('admin','finance'))
                      with check (public.cvr_role() in ('admin','finance'))$p$, t);
  end loop;
end $$;

-- ── Configurația Peștișani: lucrările cu puncte de control + coloanele zilnice ──
update cvr_trackers
   set config = '{
  "unit": "m",
  "types": [
    {"id": "verde", "label": "Săpătură în spațiu verde", "short": "spațiu verde", "color": "#2E9E6B"},
    {"id": "acost", "label": "Săpătură în acostament (1,4 m)", "short": "acostament", "color": "#B0765C"},
    {"id": "console", "label": "Țeavă pe console metalice", "short": "console", "color": "#47698F"},
    {"id": "suport", "label": "Suport metalic pe fundații beton", "short": "fundații + suport", "color": "#5FA8A0"}
  ],
  "groups": [
    {"id": "transee", "label": "Tranșee"},
    {"id": "console", "label": "Console"},
    {"id": "sudura", "label": "Sudură țeavă PEHD"}
  ],
  "stages": [
    {"id": "sapat", "label": "Săpătură", "unit": "ml", "group": "transee"},
    {"id": "teava", "label": "Montaj țeavă", "unit": "ml", "group": "transee"},
    {"id": "umplutura", "label": "Umplutură", "unit": "ml", "group": "transee"},
    {"id": "refacere", "label": "Refacere (la gata)", "unit": "ml", "group": "transee"},
    {"id": "teava_console", "label": "Țeavă pe console", "unit": "ml", "group": "console"}
  ],
  "stagesByType": {
    "verde": ["sapat", "teava", "umplutura", "refacere"],
    "acost": ["sapat", "teava", "umplutura", "refacere"],
    "console": ["teava_console"],
    "suport": ["teava_console"]
  },
  "dailyColumns": [
    {"id": "sapat", "label": "Săpătură", "unit": "ml", "group": "transee"},
    {"id": "teava", "label": "Montaj țeavă", "unit": "ml", "group": "transee"},
    {"id": "umplutura", "label": "Umplutură", "unit": "ml", "group": "transee"},
    {"id": "refacere", "label": "Refacere (la gata)", "unit": "ml", "group": "transee"},
    {"id": "console", "label": "Montaj console", "unit": "buc", "group": "console"},
    {"id": "teava_console", "label": "Țeavă pe console", "unit": "ml", "group": "console"},
    {"id": "sudura_e1", "label": "Echipa 1", "unit": "buc", "group": "sudura"},
    {"id": "sudura_e2", "label": "Echipa 2", "unit": "buc", "group": "sudura"}
  ]
}'::jsonb
 where id = 'd1000000-0000-4000-8000-000000000001';

-- ── Bifele de pornire: ce era „Gata" pe pagina Peștișani (artifact), cu ziua bifei ──
insert into cvr_tracker_marks (tracker_id, segment_code, stage, done_on, created_by)
select 'd1000000-0000-4000-8000-000000000001', v.c, v.s, v.d::date, null
  from (values
    ('s39b', 'teava_console', '2026-10-30'), ('s40', 'teava_console', '2026-10-30'),
    ('s41', 'teava_console', '2026-10-30'), ('s42', 'teava_console', '2026-10-30'),
    ('s43', 'teava_console', '2026-10-30'), ('s44', 'teava_console', '2026-10-30'),
    ('s45a', 'teava_console', '2026-10-30'),
    ('s59a', 'sapat', '2026-11-21'), ('s59b', 'sapat', '2026-11-21'),
    ('s60', 'sapat', '2026-11-21'), ('s60', 'teava', '2026-11-21'),
    ('s61', 'sapat', '2026-11-06'), ('s61', 'teava', '2026-11-06'),
    ('s62', 'sapat', '2026-10-19'), ('s63', 'sapat', '2026-10-19'), ('s64', 'sapat', '2026-10-13'),
    ('s65', 'sapat', '2026-10-19'), ('s66', 'sapat', '2026-10-19'), ('s67', 'sapat', '2026-10-19'),
    ('s68', 'sapat', '2026-10-19'),
    ('s69', 'sapat', '2026-10-19'), ('s69', 'teava', '2026-10-19'),
    ('s70', 'sapat', '2026-10-19'), ('s70', 'teava', '2026-10-19'),
    ('s71', 'sapat', '2026-10-19'), ('s71', 'teava', '2026-10-19'),
    ('s72', 'sapat', '2026-10-19'), ('s72', 'teava', '2026-10-19'), ('s72', 'umplutura', '2026-10-19'),
    ('s73', 'teava_console', '2026-10-19'), ('s74a', 'teava_console', '2026-10-19'),
    ('s74b', 'sapat', '2026-10-19'), ('s74b', 'teava', '2026-10-19'), ('s74b', 'umplutura', '2026-10-19'),
    ('s75', 'sapat', '2026-10-19'), ('s75', 'teava', '2026-10-19'), ('s75', 'umplutura', '2026-10-19'),
    ('s76', 'sapat', '2026-10-19'), ('s76', 'teava', '2026-10-19'), ('s76', 'umplutura', '2026-10-19'),
    ('s77', 'sapat', '2026-10-19'), ('s77', 'teava', '2026-10-19'), ('s77', 'umplutura', '2026-10-19'),
    ('s78', 'sapat', '2026-10-19'), ('s78', 'teava', '2026-10-19'), ('s78', 'umplutura', '2026-10-19'),
    ('s79', 'sapat', '2026-11-21'), ('s79', 'teava', '2026-11-21'), ('s79', 'umplutura', '2026-11-21')
  ) as v(c, s, d)
on conflict (tracker_id, segment_code, stage) do nothing;

-- ── Jurnalul zilnic din Excel (12-29 oct.), un rând pe zi; VJ-urile trec în observații ──
insert into cvr_tracker_days (tracker_id, work_date, qty, note, created_by)
select 'd1000000-0000-4000-8000-000000000001', v.d::date, v.q::jsonb, v.n, null
  from (values
    ('2026-10-12', '{"sapat": 20, "teava": 20, "sudura_e1": 1, "sudura_e2": 1}', 'VJ72-VJ73: plus decofrare teava si curatenie'),
    ('2026-10-15', '{"sapat": 30, "sudura_e1": 3, "sudura_e2": 2}', 'VJ62-VJ63: Turnare egalizare 5 stalpi; Cămin CVGA VJ194'),
    ('2026-10-16', '{"sapat": 40, "teava": 60, "umplutura": 40, "sudura_e1": 3, "sudura_e2": 3}', 'plus lucrari la CVGA 194; raport dat de Mihai, nu cunoaste VJ-urile'),
    ('2026-10-19', '{"sapat": 40, "teava": 235, "sudura_e1": 3, "sudura_e2": 4}', 'VJ65-VJ72: săpătură, țeavă, sudură echipa 1; VJ36-VJ40: maturat 194 si aerisitor la 217; subtraversare-sondaje vj217'),
    ('2026-10-20', '{"sudura_e1": 3, "sudura_e2": 3}', 'VJ36-VJ49: montat aerisire vj33; VJ80-VJ60: sondaj vj225'),
    ('2026-10-21', '{"umplutura": 110, "sudura_e1": 1, "sudura_e2": 3}', 'VJ36-VJ49: pe sector de console; VJ80-VJ60: inca doua suduri la stiut de proba; VJ70-VJ67: umplutură 70 m; Supratraversare VJ117-VJ122: umplutură 40 m, s-a terminat armatura vj194 si confectionati 4 stalpi teava 500 pt vj39'),
    ('2026-10-22', '{"sudura_e1": 2}', 'VJ36-VJ49: Carat stalpii sus+cofraj baza. Nu a fost cine stie ce productie, a plouat foarte rau'),
    ('2026-10-23', '{"console": 3, "sudura_e1": 3}', 'VJ36-VJ49: 3 console axate cofrate, turnate'),
    ('2026-10-26', '{"sapat": 6, "console": 2, "sudura_e1": 3}', 'VJ36-VJ49: 2 stalpi cofrati, turnati, crestere presiune pt proba vj60-80; taiat, spart strat beton 6m x 1.5 latime, de specificat 28.10 de catre Florin ce segment'),
    ('2026-10-27', '{"sapat": 4, "teava": 10, "umplutura": 10, "refacere": 10, "sudura_e1": 2}', '4m sapati, montata subtraversare 10m, sudate capetele, acoperit'),
    ('2026-10-28', '{"sudura_e1": 2}', 'VJ36-VJ46: Decofrat stalpii de la console. A plouat torential, nu s-a putut face mai mult, echipa a mai pregatit terenul pt a doua zi'),
    ('2026-10-29', '{"teava_console": 230, "sudura_e1": 3}', 'VJ36-VJ46: 3 suduri la VJ221, montat toata teava pe console')
  ) as v(d, q, n)
on conflict (tracker_id, work_date) do nothing;
