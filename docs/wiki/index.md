# LLM Project Harness Wiki Index

> 이 문서는 항상 로딩되는 유일한 LLM Wiki 페이지다. 하네스 방향과 raw work
> unit 링크만 제공한다. 종합 요약 문서로 키우지 않는다.

Last updated: 2026-06-12 Asia/Seoul

## Direction

- **무엇:** 여러 제품 저장소에 장착 가능한 cross-agent LLM harness.
- **대상:** 웹앱, 모바일앱, 게임, 도구, 실험 프로젝트.
- **범위:** raw/wiki, PRD/ADR, Do Next, 역할 프롬프트, 도구별 어댑터, artifact check, gate, commit protocol, submodule attach.
- **비범위:** 특정 제품 코드, 특정 도메인 데이터, 특정 UI 디자인 시스템.
- **Knowledge boundary:** raw PRD/ADR/notes가 진실 원천이고, 이 index는 navigation만 맡는다.

## Raw Units

### Harness Evolution

- **LLM Wiki harness baseline** — [PRD](../raw/chore/2026-06-10-llm-wiki-harness-baseline/prd.md) · [ADR](../raw/chore/2026-06-10-llm-wiki-harness-baseline/adr.md)
- **Cross-Agent Harness** — [PRD](../raw/chore/cross-agent-harness/prd.md) · [ADR](../raw/chore/cross-agent-harness/adr.md)
- **Intake helper harness** — [Notes](../raw/chore/intake-helper-harness/notes.md)
- **하네스 강도와 한국어 원칙 보강** — [Notes](../raw/chore/harness-parity-language/notes.md)
- **레거시 feature raw 제거** — [Notes](../raw/chore/remove-legacy-feature-raw/notes.md)
- **PRD ADR 템플릿 정합화** — [Notes](../raw/chore/align-prd-adr-templates/notes.md)
- **하네스 스킬과 에이전트 정의 보강** — [PRD](../raw/chore/harness-agent-protocol-strengthening/prd.md) · [ADR](../raw/chore/harness-agent-protocol-strengthening/adr.md) · [Notes](../raw/chore/harness-agent-protocol-strengthening/notes.md)
- **ADR 승인 게이트** — [PRD](../raw/chore/adr-acceptance-gate/prd.md) · [ADR](../raw/chore/adr-acceptance-gate/adr.md) · [Notes](../raw/chore/adr-acceptance-gate/notes.md)
- **Do Next 하네스 강화** — [PRD](../raw/chore/do-next-harness/prd.md) · [ADR](../raw/chore/do-next-harness/adr.md) · [Notes](../raw/chore/do-next-harness/notes.md)
- **하네스 메타 정책** — [Notes](../raw/chore/harness-meta-policy/notes.md)

### Project Operations

- **하네스 레포지토리 테라포밍** — [Notes](../raw/chore/harness-repository-terraform/notes.md)
- **서브모듈 장착 하네스** — [Notes](../raw/chore/submodule-attach-harness/notes.md)

## Maintenance

- 새 raw work unit은 `docs/raw/{feature,bugfix,chore}/branch-slug/` 아래에 둔다.
- raw path는 `feature/data-contract` 같은 branch name에서 파생한다.
- feature unit은 기본적으로 `prd.md`, `adr.md`, 선택적 `notes.md`를 가진다.
- bugfix/chore unit은 작고 결정이 없는 유지보수라면 notes-only가 가능하다.
- 제품 방향, 데이터 구조, engine boundary, UI architecture, durable harness policy가
  바뀌면 bugfix/chore라도 PRD/ADR을 검토한다.
- developer-only 하네스 유지보수는 제품 PRD/ADR 자동구현 레일 밖에서 Notes raw
  unit으로 추적할 수 있다.
- raw unit을 추가하면 `npm run harness:ingest -- docs/raw/<type>/<slug>`를 실행해
  이 index에 navigation line 하나만 추가한다.
- 새 `docs/wiki/*.md` 페이지는 accepted raw ADR이 index 하나로 부족하다고 결정한
  뒤에만 추가한다.
