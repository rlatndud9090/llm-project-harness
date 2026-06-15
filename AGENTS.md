# LLM Project Harness Agent Guide

This repository builds and maintains a reusable cross-agent harness that can be
mounted into product repositories as a `.harness` git submodule.

Answer the user in Korean honorifics and call the user `형님`.

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
.agents/              Generic adapter definitions for runtimes that read it
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
exposed at the project root under `.codex/`, `.claude/`, and optionally
`.agents/`.

Do not symlink `docs/harness`, `docs/raw/_templates`, or `scripts/harness` into
consumer projects. Package scripts should call `.harness/scripts/harness/*.mjs`
directly.

## Adapter Overlay Rules

The consumer project owns root `.codex/`, `.claude/`, and `.agents/`.

- `attach-submodule.mjs` may add symlinks for shared harness adapters.
- Existing local project adapters must not be overwritten by default.
- A local project skill or agent at the same path is a project override.
- Use `attach-submodule.mjs --retrofit` when adding the harness to an existing
  project; it preserves local docs, adapters, and scripts while adding marker
  blocks and fallback harness adapter names.
- Use `--force` only when the user intentionally wants to replace a local
  adapter with the shared harness adapter.

## Development Rules

- Keep project-authored documentation in Korean by default.
- Keep code identifiers, file paths, commands, package names, and protocol
  keywords in English when that is the natural machine-readable form.
- Prefer small, reversible changes.
- Update `harness/` first when changing shared workflow behavior, then update
  `.codex/`, `.claude/`, and `.agents/` adapters to match.
- Run the relevant verification before claiming completion:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

`npm run harness:check` runs in harness-provider mode in this repository and in
consumer-project mode when executed from a project with `.harness`.
