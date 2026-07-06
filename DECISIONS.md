# DECISIONS.md · assumption log

Claude Code writes one line here every time it makes a judgement call instead of asking. Format: date · phase/task · decision · why. Alex reads this during PR review.

| Date | Task | Decision | Why |
|---|---|---|---|
| 2026-07-06 | 0/scaffold | Used current stable versions (Vite 8, React 19, TS 6, Tailwind v4) | Sibling P&L apps are buildless (no package.json), so there were no versions to match |
| 2026-07-06 | 0/scaffold | Installed BRIEF-listed packages without asking (React, Tailwind, Supabase JS, Vitest) | Tech stack is pre-approved in BRIEF.md; loop protocol forbids questions |
| 2026-07-06 | 0/scaffold | Claimed port 5177, recorded in parent CLAUDE.md registry | Next free after 5176 (US-P&L) |
| 2026-07-06 | 0/scaffold | Unused scaffold boilerplate (App.css, assets/) moved to session scratchpad instead of deleted | Delete commands are blocked by safety rules; moving keeps the repo clean without destroying anything |
| 2026-07-06 | 0/design | Design import BLOCKED on human auth: claude_design MCP registered but unauthenticated; DesignSync needs interactive /design-login; design URL returns 403 anonymously | Hard stop #3 — asked once in chat, then continued. Tokens written from the CLAUDE.md palette (meets BRIEF acceptance); screens will be built from BRIEF + CLAUDE.md spec and reconciled with the .dc.html once Alex authenticates |
| 2026-07-06 | 1/inspect | Read-only inspection of shared DB `rvqsjxgybqbphrnhhyfz`: public = proiecte(0), plati(78 rows, LIVE), incasari(0), categorii(0), vehicule(0), all RLS on; auth.users empty; storage empty. No projects/jobs/tasks/deliverables, no cvr_*, no Pontaj tables | Skeleton tables are absent → create them fresh. P&L tables will not be touched. `plati` has live data — extra caution with any SQL |
| 2026-07-06 | 1/cvr_core | Added table `cvr_job_budgets(job_id, category, amount)` beyond the BRIEF list | The Job screen needs "Buget vs cost real per category"; budgets per job × 5 categories need a home. Additive, cvr_-prefixed |
| 2026-07-06 | 1/cvr_core | Enum values are ASCII slugs (manopera, in_lucru...); diacritics live only in the UI labels | DB identifiers with diacritics break tooling; the UI formatter maps slug → "Manoperă" etc. |
| 2026-07-06 | 1/cvr_rls | Role read from JWT `app_metadata.role` first, falling back to `user_metadata.role` | user_metadata is self-editable by any logged-in user (privilege escalation risk); app_metadata can only be set by an admin. Recommendation: set roles in app_metadata |
| 2026-07-06 | 1/cvr_rls | Site day-close will write via a security-definer RPC (built in Phase 4), not via direct UPDATE grants on deliverables/tasks | Keeps the site role limited to "read skeleton + write daily entries" exactly as specced, and makes save-day atomic (one transaction) |
| 2026-07-06 | 1/seed | PT3=612.340, PT6=448.910, PT10=391.205, PT11=476.500 so all jobs sum exactly to 2.482.395; Zona A=726.630, Zona B=616.630 → 1.343.260. PT6 seeded intentionally OVER budget (red state); PT6 has NO labour today (Phase 4 acceptance); PT10/Zona B untouched future jobs | BRIEF gave only PT2 exactly; the rest had to be "sensible analogous data" that still adds up |
