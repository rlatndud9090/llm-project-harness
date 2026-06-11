# Poke Battle Quiz Wiki Index

> 이 문서는 항상 로딩되는 유일한 LLM Wiki 페이지다. 프로젝트 방향과 raw work
> unit 링크만 제공한다. 종합 요약 문서로 키우지 않는다.

Last updated: 2026-06-11 Asia/Seoul

## Direction

- **무엇:** 모두가 같은 정답 포켓몬을 하루 한 번 추리하는 일일 퀴즈.
- **어떻게:** 자유 질문 대신 배틀처럼 보이는 행동으로 정보를 드러낸다.
- **초기 제품 범위:** 여러 모드 플랫폼이 아니라 1일 1회 배틀형 퀴즈를 먼저 만든다.
- **Engine boundary:** MVP는 풀 배틀 시뮬레이터가 아니라 deterministic quiz hint engine을 사용한다.
- **State boundary:** MVP 진행 상황과 개인 기록은 localStorage에서 시작할 수 있다.
- **Knowledge boundary:** raw PRD/ADR/notes가 진실 원천이고, 이 index는 navigation만 맡는다.

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
- **하네스 스킬과 에이전트 정의 보강** — [PRD](../raw/chore/harness-agent-protocol-strengthening/prd.md) · [ADR](../raw/chore/harness-agent-protocol-strengthening/adr.md) · [Notes](../raw/chore/harness-agent-protocol-strengthening/notes.md)

## Maintenance

- 새 raw work unit은 `docs/raw/{feature,bugfix,chore}/branch-slug/` 아래에 둔다.
- raw path는 `feature/quiz-data-contract` 같은 branch name에서 파생한다.
- feature unit은 기본적으로 `prd.md`, `adr.md`, 선택적 `notes.md`를 가진다.
- bugfix/chore unit은 작고 결정이 없는 유지보수라면 notes-only가 가능하다.
- 제품 방향, 데이터 구조, engine boundary, UI architecture, harness policy가 바뀌면
  bugfix/chore라도 PRD/ADR을 추가한다.
- raw unit을 추가하면 `npm run harness:ingest -- docs/raw/<type>/<slug>`를 실행해
  이 index에 navigation line 하나만 추가한다.
- 새 `docs/wiki/*.md` 페이지는 accepted raw ADR이 index 하나로 부족하다고 결정한
  뒤에만 추가한다.
