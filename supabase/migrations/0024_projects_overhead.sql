-- Migration: projects_overhead
--
-- „Paza" nu e o lucrare, e un cost permanent care merge peste tot. Alex nu vrea
-- să o mai vadă în CVR (nici pe Șantier, nici în Proiecte): ocupă un loc în
-- listă în fiecare zi și nu are nimic de raportat.
--
-- Marcăm astfel de proiecte cu un steag, în loc să le ștergem: Pontajul trebuie
-- să poată trimite oameni la pază mai departe, iar orele rămân în bază pentru
-- salarii și pentru P&L. Doar CVR le ascunde.
--
-- Aditiv: o coloană nouă cu valoare implicită false, deci nimic nu se schimbă
-- pentru celelalte proiecte.

alter table projects
  add column if not exists is_overhead boolean not null default false;

comment on column projects.is_overhead is
  'true = cost permanent (pază, regie), nu lucrare. CVR îl ascunde din Șantier și din Proiecte; Pontajul îl folosește normal.';

update projects set is_overhead = true where name = 'Paza' and is_overhead = false;
