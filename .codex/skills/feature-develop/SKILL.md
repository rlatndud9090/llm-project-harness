---
name: feature-develop
description: "PRD/ADR 기반 기능 구현, 재작업, 부분 수정을 진행할 때 사용한다."
---

# Feature Develop 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다. 절차·게이트·실행 레일의 정본은
`.harness/harness/protocols/feature-develop.md`이며, 이 어댑터는 그 위의 표면 배선만 남긴다.

## 필수 로딩

1. `.harness/harness/protocols/feature-develop.md` — 절차·게이트·레일의 정본.
2. 현재 raw unit의 `state.md`(가장 먼저) → 필요한 만큼 PRD/ADR/notes.
3. 디스패치할 role 문서: `.harness/harness/roles/`.
4. `AGENTS.md`·`docs/wiki/index.md`는 이 컨텍스트에 아직 로드돼 있지 않을 때만
   (`session-start`에서 이미 읽었으면 재판독하지 않는다).

## 사전 승인 게이트 (구현 전 하드 차단)

`state.md`의 `stage`와 `## 승인 이벤트`가 승인 여부의 단일 진실원이다. `npm run harness:check`로
승인 정합성을 확인하고, PRD가 `pre-approved`가 아니거나 사전 승인 이벤트(`PREAPPROVAL`)가 없으면
**구현하지 않는다** — `$prd-helper`/`$adr-helper`로 되돌아가 구조화 질문으로 명시 사전 승인을 받는다.
전환은 오직 `npm run harness:approve -- --unit docs/raw/feature/<slug> --quote "<사용자 발화 verbatim>" [--adr]`
로만 한다(에이전트가 status를 직접 고치거나 승인을 만들어내지 않는다; "이렇게 하려고 했어" 같은
의도·아이디어 발화는 사전 승인이 아니다). 게이트 통과 후 `stage`를 `implementing`으로 올려 시작한다.
빌드 중 사용자가 확인한 PRD/ADR 개정은 본문만 고쳐 `pre-approved`로 두고 `state.md` 단계 로그에
남긴다(상세는 프로토콜 Phase 0.6). 최종 확정·커밋·PR은 구현이 끝난 뒤 `$make-pr`가 담당한다.

## 실행 원칙 (상세는 프로토콜 Phase 0.5 / 실행 레인)

- 위임은 기본이 아니라 크기가 정당화할 때만 편다(`session-start.md` "위임 비용"). 병렬 분업이
  이득인 변경(구조·데이터·engine·dependency·다중 모듈)만 `architect → domain/ui/test → integrator`
  role 체인으로 펼치고, 단일 관심사(한 모듈·국소 로직·작은 수정)는 메인이 직접 하거나 1~2 역할로
  좁힌다. 그런 변경은 `architect` role로 계획을 먼저 확정한다(`$ralplan`이 있으면 계획 게이트).
- 구현·테스트·검증 자율 실행은 병렬 fan-out 할 수 있다. 단 자율 구간 안에서는 사용자에게 묻거나
  커밋하지 않고, 모든 인간 승인 게이트와 커밋은 오케스트레이터가 처리한다. domain/UI/test 경계를 분리한다.
- 질문·승인은 현재 런타임의 구조화 질문 도구를 우선 사용한다.
- 하네스 submodule 업데이트·adapter 정리는 기능 개발 레일과 분리한다.
- 완료 전 `npm run harness:gate`, 최종 확정·커밋·PR은 `$make-pr`(`commit-protocol` 사용)로 넘어간다.

규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는 한국어로 작성한다.
