# KICKOFF PROMPT · paste this whole file into Claude Code

Read `.claude/CLAUDE.md`, then `BRIEF.md`, then `DECISIONS.md`. This project runs as an uninterrupted loop:

1. Take the first unchecked task in `BRIEF.md`.
2. Implement it.
3. Verify it (build passes, tests pass, screenshot saved where required).
4. Check it off with the commit hash, commit, move to the next task.

Do not pause between phases. Do not ask me questions. When something is ambiguous, pick the simplest option that matches the design file, log it in `DECISIONS.md`, and keep going. Stop only for the hard stops listed in `.claude/CLAUDE.md`, or when Phase 8 ends with the pull request open.

Design source:

Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/7efff7f2-8b6f-4de2-8ddd-51b09568ab08?file=Socend+CVR+App.dc.html
Implement: Socend CVR App.dc.html

If the claude_design MCP is not registered yet, register it yourself with:
`claude mcp add --transport http claude_design https://api.anthropic.com/v1/design/mcp`
If authentication is needed, tell me to run `/design-login` once, then continue on your own.

Start now with Phase 0.
