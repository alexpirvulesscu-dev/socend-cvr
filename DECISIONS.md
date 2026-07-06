# DECISIONS.md · assumption log

Claude Code writes one line here every time it makes a judgement call instead of asking. Format: date · phase/task · decision · why. Alex reads this during PR review.

| Date | Task | Decision | Why |
|---|---|---|---|
| 2026-07-06 | 0/scaffold | Used current stable versions (Vite 8, React 19, TS 6, Tailwind v4) | Sibling P&L apps are buildless (no package.json), so there were no versions to match |
| 2026-07-06 | 0/scaffold | Installed BRIEF-listed packages without asking (React, Tailwind, Supabase JS, Vitest) | Tech stack is pre-approved in BRIEF.md; loop protocol forbids questions |
| 2026-07-06 | 0/scaffold | Claimed port 5177, recorded in parent CLAUDE.md registry | Next free after 5176 (US-P&L) |
| 2026-07-06 | 0/scaffold | Unused scaffold boilerplate (App.css, assets/) moved to session scratchpad instead of deleted | Delete commands are blocked by safety rules; moving keeps the repo clean without destroying anything |
