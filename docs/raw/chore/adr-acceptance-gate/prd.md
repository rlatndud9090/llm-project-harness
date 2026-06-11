---
title: "ADR 승인 게이트"
date: "2026-06-11"
status: approved
approval: "user:2026-06-11:ADR은 의사결정이므로 형님과 함께 확정해야 한다는 원칙 확인"
unit_type: chore
branch: "chore/adr-acceptance-gate"
raw_path: "docs/raw/chore/adr-acceptance-gate"
---

# PRD: ADR 승인 게이트

## 배경

데이터 계약 작업에서 에이전트가 PRD를 `approved`, ADR을 `accepted`로 단독
전환한 문제가 있었다. ADR은 기술 의사결정 기록이므로, 에이전트가 초안을 작성할
수는 있어도 승인 상태를 독자적으로 확정하면 안 된다.

참조 프로젝트는 인간의 역할을 PRD/ADR 작성, 코드 리뷰, 방향 결정으로 명시하고,
integrator가 PRD/ADR frontmatter와 ADR 불변성을 강하게 검증한다. 이 프로젝트도
같은 강도로 승인 경계를 가져야 한다.

## 목표

- [ ] 에이전트가 PRD `approved` 또는 ADR `accepted`를 단독으로 만들지 못하게 한다.
- [ ] 승인된 PRD/ADR에는 사용자 승인 근거가 frontmatter에 남아야 한다.
- [ ] 기존 accepted/approved raw는 게이트 도입 전 legacy로만 예외 처리한다.
- [ ] `harness:check`가 승인 근거 누락을 자동으로 잡아야 한다.
- [ ] Codex/ClaudeCode 역할과 스킬 문서가 같은 승인 규칙을 안내해야 한다.

## 비목표

- [ ] 기존 accepted ADR 본문을 재작성하지 않는다.
- [ ] feature 구현 방식 자체를 이 작업에서 바꾸지 않는다.
- [ ] 모든 과거 raw 문서를 한국어로 재작성하지 않는다.

## 요구사항

### 기능 요구사항

- [ ] `status: approved` PRD는 `approval:` frontmatter를 가져야 한다.
- [ ] `status: accepted` ADR은 `approval:` frontmatter를 가져야 한다.
- [ ] 새 승인 근거는 `user:YYYY-MM-DD:<짧은 근거>` 형식을 사용해야 한다.
- [ ] legacy approval marker는 게이트 도입 전 기존 approved/accepted 문서에만 허용한다.
- [ ] feature 개발 프로토콜은 사용자 승인 전 PRD/ADR status를 확정하지 말라고 명시해야 한다.

### 비기능 요구사항

- [ ] 승인 규칙은 `docs/harness/`가 진실 원천이어야 한다.
- [ ] `.codex/`와 `.claude/`는 공용 하네스를 참조하는 얇은 어댑터로 유지한다.
- [ ] 검증 실패 메시지는 어떤 문서가 승인 근거를 누락했는지 알 수 있어야 한다.

## 수용 기준

- [ ] `npm run harness:check`가 승인 근거 없는 approved PRD/accepted ADR을 실패시킨다.
- [ ] 기존 approved/accepted 문서는 legacy marker로만 통과한다.
- [ ] raw templates가 `approval:` 필드를 포함한다.
- [ ] feature-develop, artifact-validation, architect, integrator 문서가 승인 경계를 명시한다.
- [ ] 데이터 계약 브랜치의 PRD/ADR은 승인 전 review/proposed 상태로 정정되어 있다.

## 열린 질문

- 향후 사용자 승인 근거를 더 구조화해야 하는가? 현재는 frontmatter string으로 시작한다.

## ADR 필요 여부

필요하다. 이 작업은 에이전트가 어떤 상태 전이를 할 수 있는지 제한하는 하네스
정책 결정이다.

## 관련 문서

- ADR: `./adr.md`
