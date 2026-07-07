# Socend CVR

Aplicație internă cost-vs-valoare (CVR) pentru Socend Construct: biroul configurează
Proiect → Joburi → Taskuri → Livrabile și urmărește 5 KPI-uri; șeful de șantier
raportează zilnic cantitățile construite, de pe telefon, doar pentru taskurile
care au avut manoperă în ziua respectivă (filtrul vine din Pontaj, prin view-ul
`labour_today`).

## Stack

- Vite + React + TypeScript + Tailwind CSS v4
- Supabase (Postgres + Auth + RLS) — proiectul partajat Socend (`rvqsjxgybqbphrnhhyfz`)
- Vitest pentru formulele KPI

## Rulare locală

```bash
npm install
npm run dev        # pornește pe portul 5177 (registrul de porturi e în ../CLAUDE.md)
```

`.env.local` (negit-uit) trebuie să conțină `VITE_SUPABASE_URL` și
`VITE_SUPABASE_PUBLISHABLE_KEY`. Utilizatori demo: `admin@cvr.demo`,
`finance@cvr.demo`, `site@cvr.demo`.

## Verificări

```bash
npm test             # formulele KPI (vectorii exacți din BRIEF.md)
npm run build        # tsc + vite build
npm run check:roles  # RLS: site nu vede banii, anonimul nu vede nimic
```

## Structură

- `src/domain/kpi.ts` — TOATE formulele KPI (pure, testate; nu se improvizează)
- `src/data/` — citiri/scrieri Supabase
- `src/views/` — ecranele (Proiecte, Proiect, Job, Șantier, Configurare, Login)
- `supabase/migrations/` — migrări aplicate, doar aditive
- `BRIEF.md` / `DECISIONS.md` — planul bifat și jurnalul de decizii

## Reguli de aur

1. Baza de date e partajată cu P&L (și, mai târziu, Pontaj) — tratată ca producție;
   tabelele CVR au prefixul `cvr_`, scheletul (`projects`, `jobs`, `tasks`,
   `deliverables`) e comun.
2. Fără oameni/nume în CVR — manopera e treaba Pontaj; CVR citește doar
   `labour_today`.
3. Formulele KPI din `.claude/CLAUDE.md` sunt literă de lege.
