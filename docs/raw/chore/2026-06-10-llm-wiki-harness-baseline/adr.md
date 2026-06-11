---
title: "Use raw work units with a single navigation wiki"
date: "2026-06-10"
status: accepted
approval: "legacy-before-approval-gate"
related_prd: "./prd.md"
unit_type: chore
supersedes:
---

# ADR: Use Raw Work Units With A Single Navigation Wiki

## Context

The project wants the durable memory benefits of an LLM Wiki while avoiding
early over-investment in multi-page synthesis, frontmatter sync, rebuild scripts,
or stale-check machinery.

## Decision

Use a two-layer knowledge base:

1. Raw work units under `docs/raw/{feature,bugfix,chore}/YYYY-MM-DD-slug/`.
2. A single thin navigation page at `docs/wiki/index.md`.

Feature raw units should normally contain `prd.md`, `adr.md`, and optional
`notes.md`. Bugfix and chore units can be lighter, but durable decisions should
still use ADRs.

## Alternatives

- Multi-page wiki synthesis: rejected for the initial phase because summaries can
  go stale and require maintenance machinery.
- Raw notes as loose session files: rejected because branch-like work units are
  easier to link from commits and future tasks.
- Wiki scripts and stale checks: rejected until the raw corpus is large enough to
  justify machinery.

## Consequences

### Positive

- Agents load one small wiki page first.
- Durable context lives close to the work unit that created it.
- Future expansion remains possible through a new raw ADR.

### Negative / Trade-Offs

- Cross-cutting synthesis requires reading several raw units.
- The index must be curated when new raw units are added.

## Verification

- `docs/wiki/` has only `index.md`.
- `docs/raw/_templates/` contains starter templates.
- `AGENTS.md` documents the workflow.
- `npm run lint`, `npm run build`, and `npm run test:run` pass.
