# Design source

Fișierul de design aprobat: **Socend CVR App.dc.html** (Claude Design)
https://claude.ai/design/p/7efff7f2-8b6f-4de2-8ddd-51b09568ab08?file=Socend+CVR+App.dc.html

## Stare import

- claude_design MCP este înregistrat (`claude mcp add --transport http claude_design https://api.anthropic.com/v1/design/mcp`), dar cere autentificare umană (`/design-login`) — vezi DECISIONS.md.
- Până la autentificare, sursa de adevăr pentru tokens este paleta din `.claude/CLAUDE.md`, extrasă în `src/design/tokens.ts`.
- După `/design-login`: importă proiectul, salvează `Socend CVR App.dc.html` în acest folder și reconciliază tokens + layout-ul ecranelor cu fișierul real.
