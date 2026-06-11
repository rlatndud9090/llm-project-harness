# Poke Battle Quiz Wiki Index

> This is the only always-loaded LLM Wiki page. It gives the project direction
> and points to raw work-unit artifacts. Do not turn it into a synthesis dump.

Last updated: 2026-06-10 Asia/Seoul

## Direction

- **What:** a daily Pokemon-themed deduction quiz where everyone solves the same
  Pokemon answer.
- **How:** players reveal information through battle-like commands instead of
  free-form questions.
- **Engine boundary:** the MVP uses a deterministic quiz hint engine, not a full
  battle simulator.
- **State boundary:** MVP progress and personal stats can start in localStorage.
- **Knowledge boundary:** raw PRD/ADR/notes files are the source of truth; this
  index is only navigation.

## Raw Units

### Project Operations

- **Repository bootstrap** — [Notes](../raw/chore/2026-06-09-repository-bootstrap/notes.md)
- **GitHub publication** — [Notes](../raw/chore/2026-06-09-github-publication/notes.md)
- **Public docs cleanup** — [Notes](../raw/chore/2026-06-09-public-docs-cleanup/notes.md)
- **LLM Wiki harness baseline** — [PRD](../raw/chore/2026-06-10-llm-wiki-harness-baseline/prd.md) · [ADR](../raw/chore/2026-06-10-llm-wiki-harness-baseline/adr.md)
- **Cross-Agent Harness** — [PRD](../raw/chore/cross-agent-harness/prd.md) · [ADR](../raw/chore/cross-agent-harness/adr.md)
- **Intake helper harness** — [Notes](../raw/chore/intake-helper-harness/notes.md)
- **하네스 강도와 한국어 원칙 보강** — [Notes](../raw/chore/harness-parity-language/notes.md)
- **레거시 feature raw 제거** — [Notes](../raw/chore/remove-legacy-feature-raw/notes.md)
- **PRD ADR 템플릿 정합화** — [Notes](../raw/chore/align-prd-adr-templates/notes.md)

## Maintenance

- Add new raw work units under `docs/raw/{feature,bugfix,chore}/branch-slug/`,
  derived from branches like `feature/main-layout`.
- Feature units should normally include `prd.md`, `adr.md`, and optional
  `notes.md`.
- Bugfix and chore units may use `notes.md` only, unless a durable decision needs
  an ADR.
- When a raw unit is added, run `npm run harness:ingest -- docs/raw/<type>/<slug>`
  to add exactly one navigation line here under the best category.
- Add new `docs/wiki/*.md` pages only after an accepted raw ADR says the index is
  no longer enough.
