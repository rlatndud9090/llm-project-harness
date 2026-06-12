# LLM Project Harness Agent Guide

This file is the project-local operating contract for this harness checkout.
It inherits the parent workspace rule: answer in Korean honorifics and call the user `형님`.

## Project Intent

Build and maintain a reusable cross-agent harness that can be attached to many
product repositories: web apps, mobile apps, games, tools, and experiments.

This repository is not a product app. It owns the shared process layer:
raw/wiki conventions, PRD/ADR workflow, role prompts, tool adapters, artifact
checks, integration gates, and commit protocol.

Consumer projects own their product code, product PRDs/ADRs, domain-specific
roles, UI verification details, and local wiki history.

## Language Policy

Project-authored documents are written in Korean by default. This includes
`docs/raw/`, `docs/wiki/`, `docs/harness/`, PRDs, ADRs, notes, and agent-facing
workflow documents. Keep code identifiers, branch names, file paths, commands,
package names, and protocol keywords in English when that is the natural or
machine-readable form.

## LLM Wiki Harness

This repository uses the Karpathy-style LLM Wiki pattern for its own harness
history, and exports the same pattern for consumer projects.

- Raw sources are the durable source of truth under `docs/raw/`.
- Raw sources are grouped by branch-derived work units under
  `docs/raw/feature/`, `docs/raw/bugfix/`, and `docs/raw/chore/`.
- New work branches should use `feature/<kebab-slug>`, `bugfix/<kebab-slug>`, or
  `chore/<kebab-slug>`. The raw path mirrors the branch:
  `feature/main-layout` -> `docs/raw/feature/main-layout/`.
- Each raw work unit is a directory, not a loose session dump. Typical feature
  units contain `prd.md`, `adr.md`, and optional `notes.md`.
- The LLM-maintained wiki is intentionally thin: `docs/wiki/index.md` is the
  only always-loaded wiki page.
- `AGENTS.md` is the schema and routing contract that tells future agents how to
  use and maintain the wiki.
- Shared cross-agent process rules live under `docs/harness/`. Tool-specific
  files under `.claude/` and `.codex/` are adapters, not sources of truth.
- Consumer projects should mount this repository as a `.harness` git submodule,
  then link shared harness surfaces with `scripts/harness/attach-submodule.mjs`.

On session start:

1. Read `docs/wiki/index.md`.
2. Read `docs/harness/protocols/session-start.md`.
3. Follow only the raw-unit links relevant to the task.
4. Read `prd.md` / `adr.md` before making product, architecture, or process
   decisions.
5. Read `notes.md` only when implementation history or verification details are
   needed.

When to update the wiki:

- After a product decision, architecture decision, process decision, or
  implementation milestone.
- After a meaningful debugging discovery or test/verification result.
- After a discussion that changes project direction.
- Before ending a long session if the next session would otherwise lose context.

Wiki maintenance rules:

- Raw units are public-safe and append-oriented. Once a PRD or ADR is accepted,
  prefer a superseding ADR or an added note over rewriting history.
- `docs/wiki/index.md` is navigation, not a synthesis dump. Keep it short:
  project direction plus categorized raw-unit links.
- Add new wiki pages only after an accepted raw ADR says the single index is no
  longer enough.
- Ingest is lightweight and script-backed: when a raw unit is added, run
  `npm run harness:ingest -- docs/raw/<type>/<slug>` to add or update one index
  line under the best category. Do not add frontmatter, sync logs, rebuild
  scripts, or stale-check machinery.
- Keep runtime logs, metrics, local reference repos, and OMX state out of
  `docs/raw/` and `docs/wiki/`.

## Cross-Agent Harness

Follow `docs/harness/README.md` for shared process control.

Key commands:

```sh
npm run harness:start -- --type feature --slug main-layout --title "Main layout"
npm run harness:ingest -- docs/raw/feature/main-layout
npm run harness:check
npm run harness:gate
```

Use `harness:start` when beginning a new feature, bugfix, or chore. On a valid
work branch it can infer the type and slug. On `main`, pass `--type` and
`--slug` explicitly.

Before commit, follow `docs/harness/protocols/commit-protocol.md`. Run
`npm run harness:gate` unless the change is so small that a clearly justified
subset is enough. The gate runs artifact checks, lint, build, and tests.

Commit bodies must include a `관련 문서:` block. Use PRD/ADR links for product,
architecture, implementation, dependency, or durable process changes.
Developer-only harness maintenance may use raw Notes links unless it changes a
durable harness policy.

Agents may draft PRDs and ADRs, but must not mark PRDs as `approved` or ADRs as
`accepted` without explicit user approval. Approved PRDs and accepted ADRs must
include `approval: "user:YYYY-MM-DD:<reason>"` frontmatter. Legacy approved or
accepted raw artifacts may use `approval: "legacy-before-approval-gate"` only if
the artifact-check allowlist permits it.

When the user asks an open-ended next-work question such as "이제 뭐하지?", use
`$do-next` and follow `docs/harness/protocols/do-next.md`. `work-intake` and
`prd-drafting` remain compatibility/internal steps, but new product work should
converge through `$do-next` before creating a branch or raw unit.

After PRD/ADR approval, implementation is a separate request. Use `$ralplan`
first for structural, data, engine, dependency, or multi-module changes. Use
`$ralph` as the default execution lane for approved branch-sized
implementation, with solo execution reserved for small local edits.

Harness changes are developer operating-structure work. Do not route ordinary
harness maintenance through `$do-next`, product PRD/ADR approval, or PRD/ADR
based implementation automation unless the user explicitly asks to treat a
harness change as a product-facing decision. Track ordinary harness changes with
a chore raw Notes unit, wiki ingest, `harness:gate`, and the commit protocol.

For consuming project setup, follow `docs/harness/protocols/submodule-attach.md`.
The consuming project owns `AGENTS.md`, `docs/raw/`, and `docs/wiki/`; shared
adapter and protocol files should remain linked to the `.harness` submodule.

## Raw Unit Templates

- `docs/raw/_templates/feature-prd.md`
- `docs/raw/_templates/feature-adr.md`
- `docs/raw/_templates/notes.md`
- `docs/raw/_templates/bugfix.md`
- `docs/raw/_templates/chore.md`

## Repository Shape

```txt
docs/harness/
  protocols/
  roles/

scripts/harness/
  raw-start.mjs
  wiki-ingest.mjs
  artifact-check.mjs
  gate.mjs

.codex/
  agents/
  skills/

.claude/
  agents/
  commands/
  skills/
```

Core boundary:

- `docs/harness/` owns shared rules.
- `.codex/` and `.claude/` are thin adapters over shared rules.
- `scripts/harness/` owns repeatable checks and small automation.
- `docs/raw/` and `docs/wiki/` in this repository describe harness evolution,
  not any consumer product.

## Verification

After changes, run the relevant subset of:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```
