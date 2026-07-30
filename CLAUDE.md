# LLM Project Harness ClaudeCode Guide

ClaudeCode uses the same project contract as Codex.

## 이 저장소를 고칠 때는 하네스를 "쓰지" 말고 "정의"만 한다 (필독)

이 저장소는 하네스 **제공자(provider)** 다. 소비 프로젝트가 아니다. 그래서 이 저장소
자체를 수정할 때는 이 하네스가 정의하는 워크플로를 **소비하지 않는다.** (권위 있는 전문은
`AGENTS.md`의 "Project Boundary".)

- **`main`에서 바로 작업하고 `main`으로 바로 푸시한다.** 사용자가 명시적으로 요청하지
  않는 한 `feature/*`·`bugfix/*`·`chore/*` 브랜치를 만들지 않고, 하네스 자기수정에 대해
  PR을 열지 않는다.
- 이 하네스가 정의하는 스킬·프로토콜(`next-feature`, `kickoff`, `prd-helper`,
  `adr-helper`, `feature-develop`, `make-pr`, `commit-protocol`, `wiki-ingest`,
  `artifact-check` 등)을 이 저장소 작업을 굴리는 데 **호출하지 않는다.** 여기서 스킬
  이름을 보거든 "이 흐름을 실행하라"가 아니라 "이 흐름의 정의를 편집 대상으로 삼으라"는
  뜻이다. 이 스킬들은 **소비 프로젝트에서만** 실행한다.
- 하네스 자기수정을 위해 `docs/raw`, `docs/wiki`, PRD, ADR, 승인 frontmatter,
  `state.md`를 만들지 않는다.
- 그래도 provider 모드 검증은 돌린다:
  `npm run harness:check && npm run lint && npm run build && npm run test:run`.

## 기본 계약

1. Read `AGENTS.md`.
2. Treat this repository as the harness provider, not as a consumer project.
3. Use `harness/` as the shared source of truth.
4. Use `.claude/commands`, `.claude/skills`, and `.claude/agents` only as thin
   adapters over that shared harness.

Do not create Claude-only process rules that conflict with `AGENTS.md` or
`harness/`. If a workflow rule changes, update the shared harness first and then
adjust the adapter.
