---
title: "Use a shared harness core with tool adapters"
date: "2026-06-10"
status: accepted
approval: "legacy-before-approval-gate"
related_prd: "./prd.md"
unit_type: chore
supersedes:
---

# ADR: Use A Shared Harness Core With Tool Adapters

## Context

The project wants `html-editor-fe`-level process control while remaining usable
from Codex, ClaudeCode, and future agents. `html-editor-fe` stores commands,
skills, and agents under `.claude/`, which works for ClaudeCode but would make
Claude-specific files the source of truth here.

This project also decided that raw work units should map to branch names. For
example, `feature/main-layout` maps to `docs/raw/feature/main-layout/`.

## Decision

Use a shared harness core:

1. Human-readable protocols and roles live under `docs/harness/`.
2. Executable validation and generation live under `scripts/harness/`.
3. ClaudeCode adapters live under `.claude/`.
4. Codex adapters live under `.codex/`.
5. `AGENTS.md` and `CLAUDE.md` point agents back to the shared harness.

New raw unit paths should derive from branch names:

```txt
feature/<slug> -> docs/raw/feature/<slug>/
bugfix/<slug>  -> docs/raw/bugfix/<slug>/
chore/<slug>   -> docs/raw/chore/<slug>/
```

Historical date-prefixed units remain valid legacy records.

## Alternatives

- ClaudeCode-only `.claude/` harness: rejected because Codex would need a
  duplicate process surface.
- Documentation-only rules: rejected because raw/wiki consistency needs
  executable checks.
- Full wiki rebuild/staleness machinery: rejected because the current wiki is a
  thin navigation index by design.
- Directly copy all `html-editor-fe` skills: rejected because several are
  mail-editor or Tiptap specific.

## Consequences

### Positive

- Codex and ClaudeCode share the same process contract.
- Raw/wiki consistency can be checked before commits.
- Branch names, raw paths, wiki links, and commit trailers align around one work
  unit id.
- Future helper agents can be added without changing the raw/wiki foundation.

### Negative / Trade-Offs

- The repository now has small harness scripts to maintain.
- Tool-specific adapters can drift if future changes update only one side.
- Existing date-prefixed raw units need legacy tolerance in checks.

## Verification

- Run `npm run harness:check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run test:run`.
