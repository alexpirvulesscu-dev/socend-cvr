-- Migration: pontaj_prefix
-- Toate tabelele Pontaj primesc prefixul pontaj_ (cerut de Alex la review,
-- consecvent cu cvr_*). Sigur de făcut ACUM: tabelele au fost create azi,
-- aplicația Pontaj încă NU e repunctată spre proiectul partajat, deci nu
-- există niciun consumator. FK-urile și politicile RLS se mută automat.
alter table workers rename to pontaj_workers;
alter table assignments rename to pontaj_assignments;
alter table timesheets rename to pontaj_timesheets;
alter table bank_holidays rename to pontaj_bank_holidays;
alter table vehicles rename to pontaj_vehicles;
alter table locations rename to pontaj_locations;
alter table distances rename to pontaj_distances;
alter table fleet_assignments rename to pontaj_fleet_assignments;
