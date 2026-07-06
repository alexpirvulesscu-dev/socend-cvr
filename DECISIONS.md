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
