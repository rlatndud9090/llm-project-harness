---
title: "LLM Wiki harness baseline"
date: "2026-06-10"
status: approved
approval: "legacy-before-approval-gate"
unit_type: chore
---

# PRD: LLM Wiki Harness Baseline

## Problem

The project needs durable agent-readable memory, but the wiki layer should not
grow into a stale synthesis system before the product has enough raw artifacts.

## Goals

- Keep `docs/wiki/index.md` as a thin navigation page.
- Move durable details into raw work-unit artifacts.
- Provide PRD, ADR, bugfix, chore, and notes templates.
- Define how feature development accumulates raw context.
- Avoid rebuild, stale-check, and multi-page wiki machinery at the start.

## Non-Goals

- Introduce wiki scripts or automated stale detection.
- Add multiple wiki domain pages.
- Rewrite public git history.

## Requirements

- [ ] `docs/wiki/` contains only `index.md`.
- [ ] `docs/raw/README.md` explains the raw source workflow.
- [ ] Raw templates exist under `docs/raw/_templates/`.
- [ ] Existing durable decisions are represented as raw units.
- [ ] `AGENTS.md` points future agents to index-first, raw-second navigation.

## Acceptance Criteria

- [ ] A future feature can start by copying PRD/ADR templates.
- [ ] A future agent can identify the source of truth from `AGENTS.md`.
- [ ] `docs/wiki/index.md` links to raw units without carrying long synthesis.
- [ ] Lint, build, and test commands pass.

## Links

- ADR: `./adr.md`
