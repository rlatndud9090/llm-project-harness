---
name: feature-develop
description: "PRD/ADR 기반 기능 구현, 재작업, 부분 수정을 진행할 때 사용한다."
---

# Feature Develop 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다.

## 필수 로딩

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `.harness/harness/protocols/feature-develop.md`
4. 현재 raw unit의 PRD/ADR/notes
5. 관련 role 문서: `.harness/harness/roles/`

## 승인 게이트 (구현 전 하드 차단)

- `state.md`를 가장 먼저 읽는다. `stage`와 `## 승인 이벤트`가 승인 여부의 단일 진실원이다.
- `npm run harness:check`로 승인 정합성을 확인한다.
- PRD가 `approved`가 아니거나 `state.md`에 승인 이벤트가 없으면 **구현하지 않는다.**
  `$prd-helper`/`$adr-helper`로 되돌아가 구조화 질문으로 사용자의 명시 승인을 받는다.
- 승인 전환은 오직 `npm run harness:approve -- --unit docs/raw/feature/<slug> --quote
  "<사용자 발화 verbatim>" [--adr]`로만 한다. 에이전트가 직접 status를 고치거나 승인을
  만들어내지 않는다. "이렇게 하려고 했어" 같은 발화는 승인이 아니다.
- 게이트 통과 후 `state.md`의 `stage`를 `implementing`으로 갱신하고 구현을 시작한다.

## 실행 원칙

- ADR placeholder 상태에서 구현하지 않는다.
- 사용자 승인 전 PRD를 `approved`, ADR을 `accepted`로 바꾸지 않는다.
- 승인된 PRD/ADR 없이 구현하지 않는다. 먼저 `$prd-helper`/`$adr-helper` 또는 승인 라운드로 되돌린다.
- 구조, 데이터, engine, dependency, 다중 모듈 변경은 `architect` role로 계획을 먼저 확정한다(`$ralplan`이 있으면 계획 게이트로 사용).
- 승인된 branch-sized 구현의 기본 실행 레일은 `architect → domain/ui/test → integrator` role 체인이다(`$ralph`가 있으면 가속기로 사용).
- 구현·테스트·검증 같은 자율 실행은 병렬로 fan-out 할 수 있다. 단 자율 실행 구간 안에서는 사용자에게 묻거나 커밋하지 않고, 모든 인간 승인 게이트와 커밋은 오케스트레이터가 처리한다.
- 하네스 submodule 업데이트나 adapter 정리는 기능 개발 레일과 분리한다.
- domain/UI/test 경계를 분리한다.
- 질문이나 승인 요청이 필요하면 현재 런타임의 구조화 질문 도구를 우선 사용하고,
  구조화 질문 도구가 없을 때만 간결한 명시 질문으로 fallback한다.
- 완료 전 `npm run harness:gate`를 실행한다.
- 커밋이 필요하면 `commit-protocol`을 사용한다.

규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는
한국어로 작성한다.
