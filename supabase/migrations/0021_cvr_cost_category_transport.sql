-- 0021 · „Transport" devine categorie de cost de sine stătătoare
--
-- De ce: ofertele Socend se calculează pe patru coloane de preț unitar —
-- Material, Manoperă, Utilaj și TRANSPORT — plus cheltuielile indirecte.
-- CVR avea doar primele trei, așa că transportul se ascundea în „organizare",
-- iar structura costului din aplicație nu mai semăna cu oferta trimisă
-- clientului. Cu valoarea asta în enum, CVR poate arăta oferta exact așa cum
-- a fost calculată.
--
-- Strict aditiv: se adaugă o valoare nouă în enum. Nu se șterge, nu se
-- redenumește și nu se modifică nimic existent. Rândurile de buget și de cost
-- de până acum rămân neatinse.
--
-- Notă Postgres: `alter type ... add value` nu poate fi folosită în aceeași
-- tranzacție în care e adăugată, de aceea mutarea sumelor stă separat, în 0022.

alter type cvr_cost_category add value if not exists 'transport';
