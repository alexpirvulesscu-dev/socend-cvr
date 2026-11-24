-- Migration 0031: cvr_tracker_day_lines (24 nov. 2026)
-- 1. Jurnalul zilnic ține locul fiecărei cantități: o zi are mai multe rânduri
--    (de la VJ, până la VJ, cantități, observații) în coloana nouă `lines`.
--    `qty` rămâne totalul zilei. Zilele vechi rămân neatinse (lines = []).
-- 2. Configurația Peștișani:
--    · porțiunile pe console și pe suport au din nou 3 lucrări (3 puncte):
--      Montaj console, Sudură, Țeavă pe console
--    · grup nou în jurnal, „Lucrări adiționale", toate în ml:
--      Piconare stâncă/beton, Parapet demolare, Parapet refacere
--    · grupul „Tranșee" se numește „Șanț"
-- Doar tabele create de CVR. Aditiv: o coloană nouă și o configurație actualizată.
-- Nu se șterge nimic; bifele și zilele existente rămân cum sunt.

alter table cvr_tracker_days add column if not exists lines jsonb not null default '[]'::jsonb;

update cvr_trackers
   set config = config
     || '{
  "groups": [
    {"id": "transee", "label": "Șanț"},
    {"id": "console", "label": "Console"},
    {"id": "sudura", "label": "Sudură țeavă PEHD"},
    {"id": "aditionale", "label": "Lucrări adiționale"}
  ],
  "stages": [
    {"id": "sapat", "label": "Săpătură", "unit": "ml", "group": "transee"},
    {"id": "teava", "label": "Montaj țeavă", "unit": "ml", "group": "transee"},
    {"id": "umplutura", "label": "Umplutură", "unit": "ml", "group": "transee"},
    {"id": "refacere", "label": "Refacere (la gata)", "unit": "ml", "group": "transee"},
    {"id": "console", "label": "Montaj console", "unit": "ml", "group": "console"},
    {"id": "sudura", "label": "Sudură pe console", "unit": "ml", "group": "console"},
    {"id": "teava_console", "label": "Țeavă pe console", "unit": "ml", "group": "console"}
  ],
  "stagesByType": {
    "verde": ["sapat", "teava", "umplutura", "refacere"],
    "acost": ["sapat", "teava", "umplutura", "refacere"],
    "console": ["console", "sudura", "teava_console"],
    "suport": ["console", "sudura", "teava_console"]
  },
  "dailyColumns": [
    {"id": "sapat", "label": "Săpătură", "unit": "ml", "group": "transee"},
    {"id": "teava", "label": "Montaj țeavă", "unit": "ml", "group": "transee"},
    {"id": "umplutura", "label": "Umplutură", "unit": "ml", "group": "transee"},
    {"id": "refacere", "label": "Refacere (la gata)", "unit": "ml", "group": "transee"},
    {"id": "console", "label": "Montaj console", "unit": "buc", "group": "console"},
    {"id": "teava_console", "label": "Țeavă pe console", "unit": "ml", "group": "console"},
    {"id": "sudura_e1", "label": "Echipa 1", "unit": "buc", "group": "sudura"},
    {"id": "sudura_e2", "label": "Echipa 2", "unit": "buc", "group": "sudura"},
    {"id": "piconare", "label": "Piconare stâncă/beton", "unit": "ml", "group": "aditionale"},
    {"id": "parapet_demolare", "label": "Parapet demolare", "unit": "ml", "group": "aditionale"},
    {"id": "parapet_refacere", "label": "Parapet refacere", "unit": "ml", "group": "aditionale"}
  ]
}'::jsonb
 where id = 'd1000000-0000-4000-8000-000000000001';
