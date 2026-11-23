# Project Brief: Socend CVR

## What This Is
Internal web app tracking cost vs value on Socend Construct's live projects. Office staff set up Proiect → Joburi → Taskuri → Livrabile with values, quantities and weights, then watch 5 KPIs. The site foreman reports daily built quantities from his phone, only for tasks that had labour that day (fed by Pontaj). Design already approved in Claude Design (`Socend CVR App.dc.html`); this build implements it 1:1.

## Done Looks Like
- All 6 screens from the design file working against the shared Supabase, in Romanian.
- The 5 KPIs calculate exactly per the formulas in `.claude/CLAUDE.md` and are covered by unit tests.
- Mihai's day-close flow works end to end: labour-today filter → steppers → save → CVR updates.
- Role-based access enforced by RLS (admin, finance, site).
- Feature branch pushed, PR open with screenshots. Nothing merged.

## Tech Stack
Vite + React + TypeScript + Tailwind (matches the other Socend frontends). Supabase JS v2 on the shared project `rvqsjxgybqbphrnhhyfz` (one database, many frontends: this is how CVR, P&L and Pontaj communicate). Vitest for the KPI math. GitHub feature branch + PR.

## Architecture
Single-page React app → Supabase (Postgres + Auth + RLS). Shared skeleton tables (`projects`, `jobs`, `tasks`, `deliverables`) used later by Pontaj too. CVR-only tables prefixed `cvr_`. Labour-today read through view `labour_today`, stubbed now, repointed to Pontaj tables later. No backend server.

## Build Phases

### Phase 0: Setup
- [x] `git init`, create branch `feature/cvr-v1`, add `.gitignore` (node_modules, .env.local, /qa) · `6a42e84`
- [x] Scaffold Vite + React + TS + Tailwind; app boots on the port claimed in the parent `CLAUDE.md` port registry (acceptance: `npm run dev` serves a page) · `1e68186`
- [x] Via Supabase MCP: `get_project_url` + `get_publishable_keys` for ref `rvqsjxgybqbphrnhhyfz`, write `.env.local`, create `src/lib/supabase.ts` (acceptance: a test query connects) · `753cfa8`
- [x] Register claude_design MCP if missing, import the design project, save `Socend CVR App.dc.html` reference into `/design`, extract tokens to `src/design/tokens.ts` (acceptance: tokens file matches the palette in `.claude/CLAUDE.md`) · `3f28d66` — tokens done din paleta CLAUDE.md; importul fișierului .dc.html rămâne BLOCAT pe `/design-login` (hard stop #3, cerut o dată; vezi design/README.md)

### Phase 1: Database
- [x] Read-only inspection of existing schema; write findings to `DECISIONS.md` (acceptance: list of existing tables recorded, nothing modified) · `8b37bf0`
- [x] Migration `cvr_core`: `projects`, `jobs`, `tasks`, `deliverables` (create if absent), `cvr_daily_entries`, `cvr_cost_entries`, `cvr_billing`, `cvr_labour_stub`, enums for status and cost categories (Manoperă, Utilaje, Materiale, Subcontractori, Organizare) (acceptance: migration applies cleanly) · `5387b64`
- [x] Migration `cvr_rls`: RLS on all new tables, policies for `admin`, `finance`, `site` per `.claude/CLAUDE.md` (acceptance: anon client gets zero rows; site role cannot read `cvr_cost_entries`) · `a3c2cf1`
- [x] View `labour_today(project_id, task_id, workers)` reading `cvr_labour_stub` (acceptance: seeded stub rows appear in the view) · `ce46a23`
- [x] Migration `seed_demo_termoficare`: project Termoficare București (CMTEB, 2.482.395 lei, facturare pe stadii fizice) with jobs PT2, PT3, PT6, PT10, PT11. PT2 tasks: Conductă provizorie 57.600 lei (livrabile: Țeavă montată 62/100 m pondere 50, Suduri 118/180 pondere 30, Traversări carosabil 3/6 pondere 10, Traversări pietonale 7/12 pondere 10), Excavație și umplutură 66.880 lei (310/704 m3), Înlocuire conductă DN250 272.000 lei (0/320 m pondere 60, 0/128 suduri pondere 40), Refacere sistem rutier 120.960 lei (0/576 m2), Branșamente și probe 36.000 lei (0/8). Fill PT3/PT6/PT10/PT11 with sensible analogous data. Second project: Parc Fotovoltaic Dolj 4,2 MW (Energize, facturare lunară, 1.343.260 lei, Zona A + Zona B: Batere piloni, Structură metalică, Montaj panouri, Cabluri DC, Teste și PIF). Billing PT-project: Depus 476.175, Certificat 476.175, Facturat 476.175, Încasat 380.000. Stub labour today on 5 Termoficare tasks + 1 Zona A task (acceptance: seed applies, app can query it) · `aeec922`

### Phase 2: Domain logic
- [x] `src/domain/kpi.ts` implementing every formula from `.claude/CLAUDE.md` (acceptance: compiles, exported pure functions) · `73d87a3`
- [x] Vitest unit tests with these exact vectors, tolerance ±0,01: task_pct(62/100 w50, 118/180 w30, 3/6 w10, 7/12 w10) = 0,615; EV = 57.600 × 0,615 = 35.424; task_pct(310/704 w100) = 0,4403; margin(EV 100.000, cost 76.500) = 0,235; behind_days(plan 0,39, done 0,354, 100 days) = 3,6 (acceptance: `npm test` green) · `998d3ca`
- [x] Data hooks: fetch project tree, KPIs per project/job, billing, costs (acceptance: Proiecte list renders seeded data from Supabase) · `daf7670`

### Phase 3: Office screens
- [x] Proiecte list per design: cards with bar + plan tick, 3 pills (grafic in days, cost sub/peste buget, marjă) (acceptance: matches design, screenshot `/qa/01-proiecte-*.png`) · `175cf6b`
- [x] Proiect detail: 5 KPI cards with the exact Romanian questions and captions from the design, Flux facturare (Depus → Certificat → Facturat → Încasat + caption row), jobs list, "Cum se calculează" panel (acceptance: KPI values match unit-tested functions, screenshot `/qa/02-*.png`) · `7a66a75` — întrebările RO sunt formulate de mine (designul e blocat pe /design-login); de reconciliat după import
- [x] Job detail: task cards with status pills, livrabile rows (weight chip, mini bar, "62 / 100 m"), "x% din valoarea taskului realizată", Pornește taskul / Marchează finalizat; Buget vs cost real per category with over-budget red; Costuri înregistrate + Adaugă cost form writing to `cvr_cost_entries` (acceptance: adding a cost updates KPIs live — verificat: +1.000 lei a actualizat instant totalurile, apoi șters, screenshot `/qa/03-*.png`) · `0584ccd`

### Phase 4: Șantier screens (mobile first)
- [x] Day view: dark navy day header, "Pontaj spune" strip, one tappable card per labour-today task with remaining quantities ("mai sunt 38 m"), empty state, button "Închide ziua · N taskuri" (acceptance: PT6 in-progress tasks without labour do NOT appear — verificat: exact 6 carduri, zero PT6, screenshot `/qa/04-*.png`) · `d1296ea`
- [x] Report screen "Ce s-a construit azi": one row per livrabil with 52px steppers, "Salvează ziua" writes `cvr_daily_entries` and increments `done` in one transaction, flips neinceput → in_lucru when quantities > 0, success box "Zi închisă ✓" (acceptance: saving updates Proiecte KPIs — verificat: EV 452.584→453.256 live; flip-ul de status verificat prin SQL; datele demo restaurate după test, screenshot `/qa/05-*.png`) · `b4dd7ff` + `d1296ea`

### Phase 5: Configurare proiect
- [x] 4-step wizard (Informații proiect, Joburi + buget pe 5 categorii, Taskuri, Livrabile with UM/cantitate/pondere), live check "Ponderile dintr-un task trebuie să însumeze 100%", summary sidebar "Valoare totală contract" (acceptance: a full new project can be created and appears in Proiecte — verificat cap-coadă cu un proiect de test „Hală Logistică Chitila" 395.000 lei, apărut în listă, apoi șters ca datele demo să rămână cele din BRIEF, screenshot `/qa/06-*.png`) · `e9bba53`

### Phase 6: Auth and roles
- [x] Supabase email login, role from user metadata, route guards: `site` sees only Șantier, `finance` and `admin` see everything (acceptance: automated check that a site-role session cannot fetch cost rows — `npm run check:roles`, 6/6 verificări trec; gate-ul UI verificat în browser cu site@cvr.demo) · `f8cd56c`

### Phase 7: QA and polish
- [x] Diacritics sweep (comma-below ș ț everywhere), Romanian number formatting via one shared formatter, loading and error states (acceptance: grep finds no cedilla ş ţ, no raw unformatted numbers — grep curat; review multi-agent a mai găsit 7 probleme confirmate, toate reparate: pluralizare „un muncitor", empty states pe Proiecte/Joburi/Taskuri, zecimale în „mai sunt", raportarea eșecului de curățenie la salvarea wizard-ului) · `d942cec`
- [x] Screenshot every screen at 390px and 1280px into `/qa`, compare against the design file, fix visual gaps (acceptance: all screenshots present — 18 capturi: 6 ecrane × 2 lățimi + stări goale/validare/succes; comparația cu fișierul de design rămâne blocată pe /design-login) · `d942cec`

### Phase 8: Ship
- [x] Update `BRIEF.md` checkboxes and `DECISIONS.md`, push `feature/cvr-v1`, open PR with `gh pr create` including summary + `/qa` screenshots, then STOP (acceptance: PR URL printed; nothing merged) — repo: https://github.com/alexpirvulesscu-dev/socend-cvr

### Phase 9: Clienți + Tracker Peștișani (23 nov. 2026)
- [x] Migrare `0027_cvr_clients_tracker`: clienți (grupare pe ecran), tracker, porțiuni, lucrări separate, jurnal; RLS; job nou „Betonare CS - Etapa 1" · `b7ab937`
- [x] Migrare `0028_seed_tracker_pestisani` + `src/domain/tracker.ts` cu teste (împărțirea metrilor pe porțiuni, pornirea din pagina Peștișani) · `b7ab937`
- [x] Ecranul Clienți: 3 clienți, apoi proiectele fiecăruia (screenshot `/qa/08-*.png`) · `31d1d20`
- [x] Fila Tracker: „Cum stăm azi" (hartă, etape, cămine) și „Jurnal zilnic" (zi cu zi, de la VJ la VJ); adăugare și ștergere verificate cap-coadă (screenshot `/qa/09-*.png`, `/qa/10-*.png`) · `31d1d20`
- [x] Jurnalul refăcut ca Excelul: Pe zile, Jurnal, Pe porțiuni (migrarea `0029_cvr_tracker_excel`; screenshot `/qa/10-*.png`, `/qa/11-*.png`, `/qa/12-*.png`)
- [x] Puncte de control pe „Cum stăm azi" + jurnal zilnic într-o singură foaie (migrarea `0030_cvr_tracker_checkpoints`; screenshot `/qa/09-*.png`, `/qa/11-*.png`)
- [ ] Faza 2: situații de lucrări și situații de plată din tracker, pentru Socend și pentru subcontractori (pe proiect: cu sau fără subcontractor)

## External Services
- Supabase shared project `rvqsjxgybqbphrnhhyfz` (exists; keys via Supabase MCP)
- claude_design MCP `https://api.anthropic.com/v1/design/mcp` (auth once via `/design-login`)
- GitHub (repo + PR), Chrome DevTools MCP for screenshots (installed)

## Constraints and Rules
See `.claude/CLAUDE.md`: additive-only migrations, RLS everywhere, no people in CVR, Romanian UI with diacritics, Apple-like design per the imported file, never merge the PR.
