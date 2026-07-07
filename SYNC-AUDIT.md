# SYNC-AUDIT · P&L ↔ CVR ↔ Pontaj

*Written 2026-07-07, after the Pontaj data migration. This is the answer to: "what do we need for a perfectly synced system between P&L, CVR and Pontaj?"*

## Where we are now (after this work)

**One Supabase project** (`rvqsjxgybqbphrnhhyfz` — "Socend P&L") now holds all three apps' data:

| App | Tables | State |
|---|---|---|
| P&L | `proiecte`, `plati`, `incasari`, `categorii`, `vehicule` | live, fed by n8n |
| CVR | `projects/jobs/tasks/deliverables` (shared skeleton) + `cvr_*` | live at socend-cvr.vercel.app |
| Pontaj | `workers`, `assignments`, `timesheets`, `bank_holidays`, `vehicles`, `locations`, `distances`, `fleet_assignments` | **data fully copied** (checksums verified: 2.161 assignments, 2.009 timesheets, 16.464h + 723h overtime, 27 workers); the old app still writes to the OLD project until repointed |

**Project linkage** (the backbone of sync): every CVR project row carries `pnl_proiect_id` pointing at its P&L `proiecte` row. Rename / finalize / delete in CVR propagates automatically (rename also cascades into `plati`/`incasari` by name, exactly like the P&L app does it). Pontaj's 9 projects were merged into the shared skeleton `projects`, keeping their original IDs, so all 4.170 copied timesheet/assignment rows still point at valid projects. Where the P&L already had the same project by name (Pestisani, Termoficare, Auxiliar), the CVR row was linked to the **existing** P&L row — zero duplicates in the P&L dropdown.

## What YOU need to do (in order)

1. **Repoint the Pontaj app** to the shared project: URL `https://rvqsjxgybqbphrnhhyfz.supabase.co`, the publishable key from CVR's `.env.local`. Two changes beyond the URL:
   - Its `projects` table is now the shared one — the app reads `name`, `location`, `active`, which all exist; nothing else to rename.
   - **It must log in.** The old project allowed anonymous read/write; in the shared project the Pontaj tables require an authenticated user (deliberate — the publishable key is public now). Simplest: sign in with a dedicated user, or reuse `site@cvr.demo` until you make one.
2. **Retire the old Pontaj project** once the app is repointed and verified (pause it in Supabase — free tier keeps the data as backup; nothing was deleted).
3. **Decide the near-duplicates** (I did NOT auto-merge these):
   - CVR demo „Termoficare București" vs the real „Termoficare Bucuresti" (has 553 timesheets). The demo is unlinked from P&L on purpose. When you're done demoing, delete the demo project (now possible from Editează) and build the real structure on the real project.
   - „Remedieri Izvarna" (Pontaj) vs „Alimentare Cu Apa Izvarna" (P&L) — same job? If yes, tell me and I'll link them.
   - „Camin C2 - Mihai Bravu" (Pontaj) vs „Camin Apa Bucuresti" (P&L) — same question.
4. **P&L-only projects with no CVR structure**: „Toate", „Magna", „Camin Apa Bucuresti", „Alimentare Cu Apa Izvarna", „Cody Park" (inactive). They stay P&L-only until you either configure them in CVR (wizard) or tell me to import them as empty CVR projects. („Toate" looks like a bucket, not a project — probably leave it.)

## What I'll do next (say the word)

5. **Repoint `labour_today` / `labour_daily` to real Pontaj data.** Today they read the demo stub. Once the Pontaj app writes timesheets into the shared DB, ONE migration swaps the views to read `timesheets` (workers per task need a task-level mapping — today Pontaj tracks people per *project*, CVR asks per *task*; either Mihai's Pontaj gains a task field, or `labour_today` shows project-level people on all its in-progress tasks. That's a product decision for you).
6. **Retire the demo seed** (one delete each for the two demo projects) whenever you're done showing the app around.

## Security findings (important now that CVR is public)

- **P&L tables are open to anonymous access** (`anon` allow-all policies on `plati`, `incasari`, `proiecte`, `categorii`, `vehicule`). That was harmless while nothing was published; now the shared project's public key ships inside the CVR web app, so anyone technical could read/write your P&L data. Fix (needs your go-ahead because the P&L app must then log in too): lock these to `authenticated`, add a login to the P&L app. **Recommended soon.**
- **Pontaj tables**: created locked-to-authenticated from day one (see #1 above).
- **CVR money tables**: already role-guarded (site can't read them) — verified by `npm run check:roles`.
- **Demo passwords**: rotate before giving the link to more people.

## Invariant that now holds (and how it's kept)

> *"Active projects in CVR == active projects in P&L"* — for every **linked** project: creating a CVR project creates its P&L row; finalizing/reactivating flips `activ` in P&L; deleting a CVR project deactivates (never deletes) the P&L row; renames cascade everywhere the name is stored. Unlinked exceptions, on purpose: the 2 demo projects (CVR-only) and the 5 P&L-only projects listed at #4.
