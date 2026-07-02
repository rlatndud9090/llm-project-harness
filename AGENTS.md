# LLM Project Harness Agent Guide

This repository builds and maintains a reusable cross-agent harness that can be
mounted into product repositories as a `.harness` git submodule.

Answer the user in Korean, using polite honorifics. Refer to the user with a
neutral term such as `사용자`; do not hard-code a personal nickname. A personal
form of address belongs in an individual user's own global config, not in this
shared harness or the documents (PRD/ADR) it produces.

## Project Boundary

This repository is the **harness provider**, not a product project.

- It owns shared protocols, role prompts, tool adapters, raw/wiki templates,
  validation scripts, and submodule attach automation.
- It does not use the consumer-project LLM Wiki workflow for its own work.
- Do not require harness-repository changes to use `feature/*`, `bugfix/*`, or
  `chore/*` branches.
- Do not require harness-repository changes to create `docs/raw`,
  `docs/wiki`, PRDs, ADRs, or approval frontmatter.

Consumer projects own those workflow artifacts:

- `docs/raw/`
- `docs/wiki/`
- product PRDs and ADRs
- product-specific skills and agents
- project-local `AGENTS.md`

## Repository Shape

```txt
harness/
  protocols/          Shared workflow protocols consumed through .harness
  roles/              Shared role prompts
  templates/raw/      Starter templates for consumer docs/raw units

scripts/harness/      Attach, kickoff, wiki-ingest, artifact-check, gate, install-hooks
.codex/               Shared Codex adapter definitions
.claude/              Shared ClaudeCode adapter definitions
```

The `docs/` namespace is reserved for consuming projects. This harness
repository must not reintroduce `docs/harness`, `docs/raw`, or `docs/wiki` as
its own operating structure.

## Consumer Project Model

A consuming project should look like this:

```txt
app-project/
  .harness/           Git submodule pointing to this repository
  docs/raw/           Project-owned raw PRD/ADR/notes
  docs/wiki/          Project-owned thin wiki index
  AGENTS.md           Project-owned guide
  .codex/             Project-owned adapter surface plus harness links
  .claude/            Project-owned adapter surface plus harness links
```

Shared rules are read from `.harness/harness/`. Runtime-visible adapters are
exposed at the project root under `.codex/` and `.claude/`.

Do not symlink `docs/harness`, `docs/raw/_templates`, or `scripts/harness` into
consumer projects. Package scripts should call `.harness/scripts/harness/*.mjs`
directly.

## Adapter Overlay Rules

The consumer project owns root `.codex/` and `.claude/`.

- `attach-submodule.mjs` may add symlinks for shared harness adapters.
- Existing local project adapters must not be overwritten by default.
- A local project skill or agent at the same path is a project override.
- Use `attach-submodule.mjs --retrofit` when adding the harness to an existing
  project; it preserves local docs, adapters, and scripts while adding marker
  blocks and fallback harness adapter names.
- Use `--force` only when the user intentionally wants to replace a local
  adapter with the shared harness adapter.

## Skill Invocation Markers

Protocol and adapter prose points at harness skills with a `$` marker, e.g.
`$next-feature`, `$kickoff`, `$prd-helper`. `$<name>` means "invoke the harness
skill `<name>`" — ClaudeCode uses the Skill tool or `/<name>`; Codex uses the
skill prompt. The marker is a documentation pointer, not a shell variable, and
the name always matches a shipped skill adapter. Load-bearing handoffs name the
skill in plain language too, so the marker is never the only signal.

`$deep-interview`, `$ralph`, `$ralplan`, and `/team` are OPTIONAL external
accelerators (oh-my-claudecode / OMX); this harness does not ship them. When a
protocol explicitly uses `$deep-interview`, prefer that skill first when it is
installed; deep-interview itself is responsible for choosing the current
surface's structured question path and falling back safely when needed. If
`$deep-interview` is absent, use the current runtime's structured question tool
when available and fall back to one concise plain-text question only when no
structured path is exposed. When these accelerators are absent, keep using the
harness-native execution rail (`architect → domain/ui/test → integrator`) and do
not block on them.

## Development Rules

- Keep project-authored documentation in Korean by default.
- Keep code identifiers, file paths, commands, package names, and protocol
  keywords in English when that is the natural machine-readable form.
- Prefer small, reversible changes.
- Update `harness/` first when changing shared workflow behavior, then update
  `.codex/` and `.claude/` adapters to match.
- Run the relevant verification before claiming completion:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

`npm run harness:check` runs in harness-provider mode in this repository and in
consumer-project mode when executed from a project with `.harness`.
