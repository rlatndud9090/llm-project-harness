# Wiki Maintenance Log

## 2026-06-09

- Created the project-local LLM Wiki harness under `docs/wiki/`.
- Added `AGENTS.md` as the schema and entrypoint for future agents.
- Captured the initial product intent, data-source strategy, quiz hint engine
  direction, and LLM Wiki adoption request.
- Added the first architecture, decision, reference, and session-log pages.
- Updated `README.md` and `docs/session-handoff.md` to point future sessions to
  `AGENTS.md` and `docs/wiki/index.md`.
- Removed the placeholder wiki link from `templates/page.md` so link checks only
  report real unresolved links.
- Moved the durable knowledge harness from `.omx/wiki` to `docs/wiki` and
  moved raw sources to `docs/raw` so the wiki is tool-agnostic and separated
  from OMX runtime state.
- Captured the public GitHub publication request and added
  `environment/github-publication`.
- Captured completed publication facts for
  `https://github.com/rlatndud9090/poke-battle-quiz`.
