-- Migration 0032: cvr_tracker_culori_artifact (24 nov. 2026)
-- Tipurile de lucrare de pe traseul Peștișani primesc culorile din pagina
-- originală a lui Alex: verde, mov, portocaliu, albastru. Doar configurația.
update cvr_trackers
   set config = jsonb_set(config, '{types}', '[
    {"id": "verde", "label": "Săpătură în spațiu verde", "short": "spațiu verde", "color": "#34C759"},
    {"id": "acost", "label": "Săpătură în acostament (1,4 m)", "short": "acostament", "color": "#AF52DE"},
    {"id": "console", "label": "Țeavă pe console metalice", "short": "console", "color": "#FF9500"},
    {"id": "suport", "label": "Suport metalic pe fundații beton", "short": "fundații + suport", "color": "#32ADE6"}
  ]'::jsonb)
 where id = 'd1000000-0000-4000-8000-000000000001';
