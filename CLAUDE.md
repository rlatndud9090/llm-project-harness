# LLM Project Harness ClaudeCode Guide

ClaudeCode uses the same project contract as Codex.

1. Read `AGENTS.md`.
2. Treat this repository as the harness provider, not as a consumer project.
3. Use `harness/` as the shared source of truth.
4. Use `.claude/commands`, `.claude/skills`, and `.claude/agents` only as thin
   adapters over that shared harness.

Do not create Claude-only process rules that conflict with `AGENTS.md` or
`harness/`. If a workflow rule changes, update the shared harness first and then
adjust the adapter.
