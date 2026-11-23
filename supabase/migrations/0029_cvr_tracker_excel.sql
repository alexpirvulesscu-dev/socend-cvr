-- Migration 0029: cvr_tracker_excel (23 nov. 2026)
-- Trackerul Peștișani trece pe lista de lucrări din Excelul de șantier
-- (Săpătură, Montaj țeavă, Umplutură, Refacere în ml; Montaj console în buc;
-- Țeavă pe console în ml; Suduri în buc) și pe jurnalul „un rând = o zi + un loc".
-- 1. Jurnalul acceptă rânduri fără VJ (Mihai nu știe reperul, sau e un cămin)
--    și rânduri doar cu observații. Un rând de jurnal = un lot (batch_id) de
--    cantități, câte una pe lucrare. is_initial = „realizat înainte de jurnal".
-- 2. Rândurile pornite din pagina veche (0028) se scot; intră rândurile din
--    Excelul „Tracker_Pestisani_VJ36-VJ80.xlsx", foaia Jurnal zilnic (12-29 oct.).
-- Doar tabele create de CVR (0027).

alter table cvr_tracker_entries alter column from_pt drop not null;
alter table cvr_tracker_entries alter column to_pt drop not null;
alter table cvr_tracker_entries alter column stage drop not null;
alter table cvr_tracker_entries alter column qty drop not null;
alter table cvr_tracker_entries drop constraint if exists cvr_tracker_entries_qty_check;
alter table cvr_tracker_entries add constraint cvr_tracker_entries_qty_check
  check ((qty is null or qty > 0) and ((stage is null) = (qty is null)));
alter table cvr_tracker_entries add column if not exists batch_id uuid;
alter table cvr_tracker_entries add column if not exists is_initial boolean not null default false;
create index if not exists idx_cvr_tracker_entries_batch on cvr_tracker_entries(batch_id);

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
    {"id": "transee", "label": "Tranșee (spațiu verde și acostament)"},
    {"id": "console", "label": "Console"},
    {"id": "sudura", "label": "Sudură țeavă PEHD"}
  ],
  "stages": [
    {"id": "sapat", "label": "Săpătură", "unit": "ml", "group": "transee"},
    {"id": "teava", "label": "Montaj țeavă", "unit": "ml", "group": "transee"},
    {"id": "umplutura", "label": "Umplutură", "unit": "ml", "group": "transee"},
    {"id": "refacere", "label": "Refacere (la gata)", "unit": "ml", "group": "transee"},
    {"id": "console", "label": "Montaj console", "unit": "buc", "group": "console", "target": 2},
    {"id": "teava_console", "label": "Țeavă pe console", "unit": "ml", "group": "console"},
    {"id": "sudura", "label": "Suduri", "unit": "buc", "group": "sudura"}
  ],
  "stagesByType": {
    "verde": ["sapat", "teava", "umplutura", "refacere"],
    "acost": ["sapat", "teava", "umplutura", "refacere"],
    "console": ["teava_console"],
    "suport": ["teava_console"]
  }
}'::jsonb
 where id = 'd1000000-0000-4000-8000-000000000001';

delete from cvr_tracker_entries
 where tracker_id = 'd1000000-0000-4000-8000-000000000001'
   and note = 'Preluat din pagina Peștișani VJ36-VJ80';

-- rândurile Excelului: (nr rând, data, de la, până la, lucrare, cantitate, observații)
insert into cvr_tracker_entries (tracker_id, batch_id, work_date, from_pt, to_pt, stage, qty, note, is_initial, created_by, created_at)
select 'd1000000-0000-4000-8000-000000000001',
       md5('pestisani-excel-' || v.nr)::uuid,
       v.d::date, v.f, v.t, v.s, v.q, v.n, v.nr = 0, null,
       timestamptz '2026-11-23 12:00:00+02' + make_interval(secs => v.nr)
  from (values
    (0,  '2026-10-13', null, null, 'sapat', 376.9, 'Realizat până la 13.10 (din Excel)'),
    (1,  '2026-10-12', 'VJ72', 'VJ73', 'sapat', 20, 'plus decofrare teava si curatenie'),
    (1,  '2026-10-12', 'VJ72', 'VJ73', 'teava', 20, 'plus decofrare teava si curatenie'),
    (1,  '2026-10-12', 'VJ72', 'VJ73', 'sudura', 2, 'plus decofrare teava si curatenie'),
    (2,  '2026-10-15', 'Cămin CVGA VJ194', null, null, null, null),
    (3,  '2026-10-15', 'VJ62', 'VJ63', 'sapat', 30, 'Turnare egalizare 5 stalpi'),
    (3,  '2026-10-15', 'VJ62', 'VJ63', 'sudura', 5, 'Turnare egalizare 5 stalpi'),
    (4,  '2026-10-16', null, null, 'sapat', 40, 'plus lucrari la CVGA 194; raport dat de Mihai, nu cunoaste VJ-urile'),
    (4,  '2026-10-16', null, null, 'teava', 60, 'plus lucrari la CVGA 194; raport dat de Mihai, nu cunoaste VJ-urile'),
    (4,  '2026-10-16', null, null, 'umplutura', 40, 'plus lucrari la CVGA 194; raport dat de Mihai, nu cunoaste VJ-urile'),
    (4,  '2026-10-16', null, null, 'sudura', 6, 'plus lucrari la CVGA 194; raport dat de Mihai, nu cunoaste VJ-urile'),
    (5,  '2026-10-19', 'VJ65', 'VJ72', 'sapat', 40, null),
    (5,  '2026-10-19', 'VJ65', 'VJ72', 'teava', 235, null),
    (5,  '2026-10-19', 'VJ65', 'VJ72', 'sudura', 3, null),
    (6,  '2026-10-19', 'VJ36', 'VJ40', 'sudura', 4, 'maturat 194 si aerisitor la 217; subtraversare-sondaje vj217'),
    (7,  '2026-10-20', 'VJ36', 'VJ49', 'sudura', 3, 'montat aerisire vj33'),
    (8,  '2026-10-20', 'VJ80', 'VJ60', 'sudura', 3, 'sondaj vj225'),
    (9,  '2026-10-21', 'VJ36', 'VJ49', 'sudura', 3, 'pe sector de console'),
    (10, '2026-10-21', 'VJ80', 'VJ60', 'sudura', 1, 'inca doua suduri la stiut de proba'),
    (11, '2026-10-21', 'VJ70', 'VJ67', 'umplutura', 70, null),
    (12, '2026-10-21', 'Supratraversare VJ117-VJ122', null, 'umplutura', 40, 's-a terminat armatura vj194 si confectionati 4 stalpi teava 500 pt vj39'),
    (13, '2026-10-22', 'VJ36', 'VJ49', 'sudura', 2, 'Carat stalpii sus+cofraj baza. Nu a fost cine stie ce productie, a plouat foarte rau'),
    (14, '2026-10-23', 'VJ36', 'VJ49', 'console', 3, '3 console axate cofrate, turnate'),
    (14, '2026-10-23', 'VJ36', 'VJ49', 'sudura', 3, '3 console axate cofrate, turnate'),
    (15, '2026-10-26', 'VJ36', 'VJ49', 'console', 2, '2 stalpi cofrati, turnati,  crestere presiune pt proba vj60-80'),
    (15, '2026-10-26', 'VJ36', 'VJ49', 'sudura', 3, '2 stalpi cofrati, turnati,  crestere presiune pt proba vj60-80'),
    (16, '2026-10-26', null, null, 'sapat', 6, 'taiat, spart strat beton 6m x 1.5 latime, de specificact 28.10 de catre Florin ce segment'),
    (17, '2026-10-27', null, null, 'sapat', 4, '4m sapati, montata subtraversare 10m, sudate capetele, acoperit'),
    (17, '2026-10-27', null, null, 'teava', 10, '4m sapati, montata subtraversare 10m, sudate capetele, acoperit'),
    (17, '2026-10-27', null, null, 'umplutura', 10, '4m sapati, montata subtraversare 10m, sudate capetele, acoperit'),
    (17, '2026-10-27', null, null, 'refacere', 10, '4m sapati, montata subtraversare 10m, sudate capetele, acoperit'),
    (17, '2026-10-27', null, null, 'sudura', 2, '4m sapati, montata subtraversare 10m, sudate capetele, acoperit'),
    (18, '2026-10-28', 'VJ36', 'VJ46', 'sudura', 2, 'Decofrat stalpii de la console. A plouat torential, nu s-a putut face mai mult, echipa a mai pregatit terenul pt a doua zi'),
    (19, '2026-10-29', 'VJ36', 'VJ46', 'teava_console', 230, '3 suduri la VJ221, montat toata teava pe console'),
    (19, '2026-10-29', 'VJ36', 'VJ46', 'sudura', 3, '3 suduri la VJ221, montat toata teava pe console')
  ) as v(nr, d, f, t, s, q, n)
 where not exists (
   select 1 from cvr_tracker_entries e
    where e.tracker_id = 'd1000000-0000-4000-8000-000000000001' and e.batch_id is not null);
