# Socend CVR · CLAUDE.md

## Purpose
Internal cost-vs-value (CVR) app for Socend Construct. Hierarchy: Proiect → Joburi → Taskuri → Livrabile. Office (Alex, finance) sets up projects and watches 5 KPIs. Site foreman (Mihai) reports daily quantities from his phone. UI is 100% Romanian with diacritics (comma-below ș, ț). Numbers in Romanian format: 2.482.395 lei · 35,4%.

## Loop protocol (how to work)
- Work `BRIEF.md` top to bottom. One task = one commit. Check off each task with its commit hash.
- Verify before checking off: `npm run build` passes, `npm test` passes, and for UI tasks save a screenshot to `/qa/` (use Chrome DevTools MCP, 390px and 1280px widths).
- Never ask the user questions. Ambiguity: pick the simplest option that matches the design file, log one line in `DECISIONS.md`, continue.
- Do not pause between phases. Review happens once, at the end, via pull request.
- On any new session: read this file, read `BRIEF.md`, resume at the first unchecked task.

## Hard stops (the only reasons to stop and ask)
1. A migration would DROP, ALTER, TRUNCATE or DELETE anything in a table this project did not create.
2. An action costs money (new Supabase project/branch, paid service, domain).
3. Auth that only a human can do (e.g. `/design-login`). Ask once, then continue.

## Tech stack
- Vite + React + TypeScript + Tailwind CSS
- Supabase JS v2. Shared Supabase project (Socend), ref: `rvqsjxgybqbphrnhhyfz`. This database is shared with the P&L app (and Pontaj later). Treat it as production.
- Tests: Vitest. Git: GitHub, feature branch + PR.
- Dev port: open the parent folder `CLAUDE.md` port registry, claim the next free port, record it there and in `package.json` (`vite --port <port>`).

## Database safety (non-negotiable)
- First action on the DB: read-only inspection (`list_tables` on all schemas). Never modify existing P&L or Pontaj tables.
- All schema changes via migration files, additive only. New tables prefixed `cvr_` except the shared skeleton: `projects`, `jobs`, `tasks`, `deliverables` (create only if they do not exist; if they exist, extend additively).
- RLS ON for every table this project creates. Roles via auth user metadata: `admin` (all), `finance` (all except settings), `site` (read skeleton, insert/update daily entries only). No anonymous access.
- Labour-today comes from a view `labour_today(project_id, task_id, workers)`. For now it reads a stub table `cvr_labour_stub`; later it will be repointed to real Pontaj tables. Never build Pontaj logic here.
- Seed data lives in one clearly named migration (`seed_demo_termoficare`) so it can be removed in one step.

## Design source
- The imported Claude Design file `Socend CVR App.dc.html` is the single source of truth for layout, spacing, component structure and UI copy. Extract design tokens into `src/design/tokens.ts`.
- Aesthetic: clean, Apple-like. White borderless cards on `#FAF9F6`, radius 16 to 20px, soft diffuse shadows, frosted translucent top bar, SF Pro or Inter, tabular numbers, generous white space. Teal `#115468` only on the Șantier day header (Alex changed it from navy at the 2026-07-07 review), yellow `#E2E04A` only there.
- Palette: bg `#FAF9F6`, card `#FFFFFF`, border `#E8E8E8`, dark `#0D1A2D`/`#14263F`, text `#0D1A2D`/`#5B6673`, primary `#58A834` (hover `#46862A`, tint `#DDEDDC`), links `#115468`, success `#58A834`, warning `#F0A800`, error `#D64545`. Never pure black.

## Domain rules
- No people, crews or names in this app. Labour is Pontaj's job. CVR only shows read-only worker counts from `labour_today`.
- Site day-close asks ONLY about tasks that have labour today. Tasks in progress with no labour today are never asked about.
- Statuses: `neinceput`, `in_lucru`, `finalizat`. Saving daily quantities on a `neinceput` task flips it to `in_lucru`.
- Billing pipeline per project: Depus → Certificat → Facturat → Încasat.

## KPI formulas (exact, do not improvise)
- deliverable_pct = min(done / total, 1)
- task_pct = Σ(weight_i × deliverable_pct_i) / Σ(weight_i)   · weights per task sum to 100
- EV (lucrări executate, lei) = task_value × task_pct, summed up the tree
- plan_pct = clamp((today − start) / (end − start), 0, 1) per job; project plan = value-weighted
- behind_days = (plan_pct − done_pct) × job_duration_days; project = value-weighted; positive = behind
- cost_var = (job_budget_total × done_pct) − actual_cost; positive = under budget
- margin = (EV − cost) / EV
- WIP = max(0, EV − depus)
- KPI colours: schedule <2 days good, 2 to 7 warning, >7 error; cost_var ≥0 good else error; margin ≥15% good, 8 to 15% warning, else error; cash ≥90% good, 70 to 90% warning, else error.

## Git workflow
- `git init`, empty `main`, work on `feature/cvr-v1`. Conventional commits (`feat:`, `fix:`, `chore:`).
- Phase 8: push branch, open PR with `gh pr create`, include summary + `/qa` screenshots. NEVER merge. Alex reviews and merges.
