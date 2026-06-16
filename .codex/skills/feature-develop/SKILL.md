---
name: feature-develop
description: "PRD/ADR 기반 기능 구현, 재작업, 부분 수정을 진행할 때 사용한다."
---

# Feature Develop 어댑터

ClaudeCode는 독자 규칙을 만들지 않고 공용 하네스를 따른다.

## 필수 로딩

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `.harness/harness/protocols/feature-develop.md`
4. 현재 raw unit의 PRD/ADR/notes
5. 관련 role 문서: `.harness/harness/roles/`

## 실행 원칙

- ADR placeholder 상태에서 구현하지 않는다.
- 사용자 승인 전 PRD를 `approved`, ADR을 `accepted`로 바꾸지 않는다.
- 승인된 PRD/ADR 없이 구현하지 않는다. 먼저 `$prd-helper`/`$adr-helper` 또는 승인 라운드로 되돌린다.
- 구조, 데이터, engine, dependency, 다중 모듈 변경은 `architect` role로 계획을 먼저 확정한다(`$ralplan`이 있으면 계획 게이트로 사용).
- 승인된 branch-sized 구현의 기본 실행 레일은 `architect → domain/ui/test → integrator` role 체인이다(`$ralph`가 있으면 가속기로 사용).
- 하네스 submodule 업데이트나 adapter 정리는 기능 개발 레일과 분리한다.
- domain/UI/test 경계를 분리한다.
- 완료 전 `npm run harness:gate`를 실행한다.
- 커밋이 필요하면 `commit-protocol`을 사용한다.

규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는
한국어로 작성한다.
