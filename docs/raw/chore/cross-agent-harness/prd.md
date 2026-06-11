---
title: "Cross-agent harness"
date: "2026-06-10"
status: approved
approval: "legacy-before-approval-gate"
unit_type: chore
---

# PRD: Cross-Agent Harness

## Problem

The project should be operable from both Codex and ClaudeCode without splitting
its process rules across tool-specific directories. The existing raw/wiki setup
documents the intended workflow, but it does not yet provide executable controls
for starting raw units, ingesting wiki links, or validating artifacts.

## Goals

- Establish a shared harness that Codex and ClaudeCode can both follow.
- Use branch names as raw work-unit identifiers.
- Add executable checks for raw/wiki consistency.
- Keep the wiki as a single thin navigation page.
- Preserve the ability to add helper agents later for work-unit scoping and PRD
  drafting.

## Non-Goals

- Do not recreate the full multi-page wiki machinery.
- Do not import mail-editor-specific CSS or compatibility rules.
- Do not enforce dependency exact-version pinning without a future ADR.
- Do not rewrite historical date-prefixed raw units.

## Requirements

- [x] Shared process rules live under `docs/harness/`.
- [x] Tool-specific adapters in `.claude/` and `.codex/` point back to the shared
      harness.
- [x] `harness:start` creates raw units from branch-style identifiers.
- [x] `harness:ingest` updates `docs/wiki/index.md` idempotently.
- [x] `harness:check` validates raw/wiki consistency.
- [x] `harness:gate` runs artifact checks and normal project verification.

## Acceptance Criteria

- [x] `npm run harness:check` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [x] `npm run test:run` passes.

## Links

- ADR: `./adr.md`
