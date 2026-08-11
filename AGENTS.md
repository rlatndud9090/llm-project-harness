# LLM Project Harness Agent Guide

This repository builds and maintains a reusable harness distributed as a
**Claude Code plugin**. It is installed once with
`/plugin marketplace add rlatndud9090/llm-project-harness` and adopted per
product repository by running `/lph-init`, which drops a `.harness.json`
flag and wires the plugin's enablement. The engine and all
skills/commands/agents live inside the plugin; a consumer repository never
copies them.

Answer the user in Korean, using polite honorifics. Refer to the user with a
neutral term such as `사용자`; do not hard-code a personal nickname. A personal
form of address belongs in an individual user's own global config, not in this
shared harness or the documents (PRD/ADR) it produces.

## Project Boundary

This repository is the **harness provider**, not a product project.

- It owns shared protocols, role prompts, adapter surfaces, raw/wiki templates,
  validation scripts, and harness adoption automation (`init.mjs`, run via
  `/lph-init`).
- **Editing this repository means authoring the harness, not running it.** Do
  the work directly on `main` and push to `main`. Do not create `feature/*`,
  `bugfix/*`, or `chore/*` branches, and do not open a pull request, for a
  harness self-edit — unless the user explicitly asks for a branch or PR.
- **Do not invoke the harness's own skills/protocols to drive work here**
  (`next-feature`, `one-shot`, `kickoff`, `prd-helper`, `adr-helper`,
  `feature-develop`, `make-pr`, `commit-protocol`, `wiki-ingest`,
  `artifact-check`, …). This
  repository *defines* those flows; only consumer projects *run* them. A skill
  name in this repo's own prose points at a definition to edit, not a flow to
  execute against this repo.
- Do not use the consumer-project LLM Wiki workflow, and do not create
  `docs/raw`, `docs/wiki`, PRDs, ADRs, `state.md`, or approval frontmatter for a
  harness self-edit.
- Still run provider-mode verification before claiming done: `npm run
  harness:check`, `npm run lint`, `npm run build`, `npm run test:run`.

Consumer projects own those workflow artifacts:

- `docs/raw/`
- `docs/wiki/`
- product PRDs and ADRs
- product-specific skills and agents
- project-local `AGENTS.md`

## Repository Shape

```txt
.claude-plugin/       Plugin + marketplace manifests (plugin.json, marketplace.json)
commands/             Plugin slash-command adapters
agents/               Plugin agent adapters
skills/               Plugin skill adapters
hooks/                Plugin hook wiring (hooks.json)
action.yml            Composite GitHub Action (server-side CI gate)

harness/
  protocols/          Shared workflow protocols (source of truth)
  roles/              Shared role prompts
  guides/             Shared single-source implementation guidelines
  templates/raw/      Starter templates for consumer docs/raw units

scripts/harness/      init, kickoff, wiki-ingest, artifact-check, gate, install-hooks
```

The `docs/` namespace is reserved for consuming projects. This harness
repository must not reintroduce `docs/harness`, `docs/raw`, or `docs/wiki` as
its own operating structure.

## Consumer Project Model

A consuming project should look like this:

```txt
app-project/
  .harness.json                   Root flag (adoption marker + plugin version)
  .claude/settings.json           Plugin enablement (marketplace + enabledPlugins)
  .github/workflows/harness.yml   CI gate (calls the shared composite action)
  docs/raw/                       Project-owned raw PRD/ADR/notes
  docs/wiki/                      Project-owned thin wiki index
  AGENTS.md                       Project-owned guide
```

There is no `.harness/` symlink and no root `.codex`/`.claude` adapter symlinks.
The shared rules, skills, commands, agents, and engine all come from the
installed plugin — not from a path mounted into the repository. The consumer's
only harness footprint is the flag, the plugin enablement, the CI workflow, and
its own project-owned docs.

Do not copy `harness/`, `scripts/harness`, or the templates into consumer
projects. In-session the engine is reached through `${CLAUDE_PLUGIN_ROOT}`; in
CI through the composite action.

## Adapter Overlay Rules

The symlink/overlay model (and `--retrofit`/`--force`) is obsolete. The plugin
provides its commands, agents, and skills globally once it is enabled.

- The plugin's surfaces are namespaced (`/llm-project-harness:<name>`), so they
  never collide with a project's own files.
- A project overrides any harness surface by defining a same-named local skill
  or command in its own `.claude/` — the local definition wins.
- `/lph-init` is retrofit-safe: it never clobbers existing project files
  (`AGENTS.md`, `docs/wiki/index.md`, and the like are created only when
  absent) and merges `.claude/settings.json` additively (only the marketplace
  and `enabledPlugins` keys, preserving everything else).

## Skill Invocation Markers

Protocol and adapter prose points at harness skills with a `$` marker, e.g.
`$next-feature`, `$kickoff`, `$prd-helper`. `$<name>` means "invoke the harness
skill `<name>`" — in the plugin the runtime invocation is plugin-namespaced,
`/llm-project-harness:<name>` (or the Skill tool). The marker is a documentation
pointer, not a shell variable, and the name always matches a shipped skill
adapter. Load-bearing handoffs name the skill in plain language too, so the
marker is never the only signal.

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
  the root `commands/`, `agents/`, and `skills/` adapters to match.
- Run the relevant verification before claiming completion:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

`npm run harness:check` runs in harness-provider mode in this repository and in
consumer-project mode when executed from a project carrying a `.harness.json`
flag.
