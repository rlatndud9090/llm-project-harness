# Poke Battle Quiz Agent Guide

This file is the project-local operating contract for `/Users/nhn/prvprjt/poke-battle-quiz`.
It inherits the parent workspace rule: answer in Korean honorifics and call the user `형님`.

## Project Intent

Build a daily Pokemon deduction quiz where the answer is a Pokemon and the player
reveals hints through battle-like commands instead of free-form questions.

The MVP is not a full battle simulator. It should use a small deterministic quiz
hint engine: commands emit events, abilities react through explicit hooks, and the
UI renders battle logs plus revealed hints.

## Language Policy

Project-authored documents are written in Korean by default. This includes
`docs/raw/`, `docs/wiki/`, `docs/harness/`, PRDs, ADRs, notes, and agent-facing
workflow documents. Keep code identifiers, branch names, file paths, commands,
package names, and protocol keywords in English when that is the natural or
machine-readable form.

## LLM Wiki Harness

This project uses the Karpathy-style LLM Wiki pattern.

- Raw sources are the durable source of truth under `docs/raw/`.
- Raw sources are grouped by branch-derived work units under
  `docs/raw/feature/`, `docs/raw/bugfix/`, and `docs/raw/chore/`.
- New work branches must use `feature/<kebab-slug>`, `bugfix/<kebab-slug>`, or
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

On session start:

1. Read `docs/wiki/index.md`.
2. Read `docs/harness/protocols/session-start.md`.
3. Follow only the raw-unit links relevant to the task.
4. Read `prd.md` / `adr.md` before making product or architecture decisions.
5. Read `notes.md` only when implementation history or verification details are
   needed.

When to update the wiki:

- After a product decision, architecture decision, data import decision, or
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
- Keep runtime logs, metrics, and OMX state out of `docs/raw/` and `docs/wiki/`.

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
Commit bodies must include a `관련 문서:` block with PRD/ADR links for product,
architecture, implementation, data, or harness policy changes. Use notes-only
links only for small maintenance work without a durable decision.
Agents may draft PRDs and ADRs, but must not mark PRDs as `approved` or ADRs as
`accepted` without explicit user approval. Approved PRDs and accepted ADRs must
include `approval: "user:YYYY-MM-DD:<reason>"` frontmatter. Legacy approved or
accepted raw artifacts may use `approval: "legacy-before-approval-gate"` only if
the artifact-check allowlist permits it.

When the user asks an open-ended next-work question such as "이제 뭐하지?", follow
`docs/harness/protocols/work-intake.md` before creating a branch or raw unit.
After a candidate is accepted, use `docs/harness/protocols/prd-drafting.md`.

## Raw Unit Templates

- `docs/raw/_templates/feature-prd.md`
- `docs/raw/_templates/feature-adr.md`
- `docs/raw/_templates/notes.md`
- `docs/raw/_templates/bugfix.md`
- `docs/raw/_templates/chore.md`

## Architecture Direction

Use this high-level shape unless a later wiki decision supersedes it:

```txt
src/domain/
  types.ts
  state.ts
  commands.ts
  battleReducer.ts
  hints.ts
  daily.ts
  rules/
  abilities/

src/data/
  curated/
  generated/

src/ui/
  CommandPanel.tsx
  BattleLog.tsx
  GuessBox.tsx
  DailyGame.tsx
```

Core engine boundary:

- React owns rendering and user interaction.
- `src/domain` owns serializable simulation state and pure reducers.
- Ability behavior is modeled as trigger effects, not as one-off conditionals in
  the reducer.
- Data import/generation belongs outside runtime UI.

## Verification

After code changes, run the relevant subset of:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

For local UI checks:

```sh
npm run dev -- --host 127.0.0.1
```
