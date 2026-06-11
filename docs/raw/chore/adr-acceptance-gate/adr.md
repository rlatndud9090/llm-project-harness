---
title: "PRD/ADR 승인 상태는 사용자 승인 근거를 요구한다"
date: "2026-06-11"
status: accepted
approval: "user:2026-06-11:ADR은 의사결정이므로 형님과 함께 확정해야 한다는 원칙 확인"
unit_type: chore
branch: "chore/adr-acceptance-gate"
raw_path: "docs/raw/chore/adr-acceptance-gate"
related_prd: "docs/raw/chore/adr-acceptance-gate/prd.md"
supersedes:
---

# ADR: PRD/ADR 승인 상태는 사용자 승인 근거를 요구한다

## 컨텍스트

에이전트가 데이터 계약 작업에서 PRD/ADR을 단독으로 승인 상태로 전환했다. 이는
PRD/ADR이 사용자 요구와 기술 의사결정을 보존하는 raw source라는 원칙에 맞지 않는다.

참조 프로젝트는 인간의 역할을 PRD/ADR 작성과 방향 결정으로 명시하고, integrator가
PRD/ADR frontmatter와 ADR 불변성을 검증한다. 이 프로젝트는 여러 에이전트를 쓰므로
그 경계를 자동 검사까지 연결해야 한다.

## 결정

PRD `approved`와 ADR `accepted` 상태에는 `approval:` frontmatter를 필수로 둔다.

새 승인 근거는 아래 형식을 사용한다.

```yaml
approval: "user:YYYY-MM-DD:<짧은 근거>"
```

에이전트는 PRD/ADR 초안을 작성할 수 있지만, 사용자의 명시 승인 없이는 PRD를
`approved`, ADR을 `accepted`로 바꾸지 않는다. 승인 전 상태는 PRD `review`, ADR
`proposed`다.

게이트 도입 전 이미 존재하던 approved/accepted 문서는 본문을 재작성하지 않고
frontmatter에 아래 legacy marker만 추가한다.

```yaml
approval: "legacy-before-approval-gate"
```

이 legacy marker는 미리 지정한 기존 문서에만 허용한다. 새 raw unit이 이 값을 쓰면
`harness:check`가 실패한다.

## 선택지

### 선택지 A: 문서 지침만 추가한다

- 장점: 구현이 가장 작다.
- 단점: 에이전트가 다시 실수해도 자동으로 잡히지 않는다.

### 선택지 B: frontmatter 승인 근거와 자동 검사를 추가한다

- 장점: 승인 상태 전이를 기계적으로 검증할 수 있다.
- 단점: 기존 approved/accepted 문서에 legacy marker를 추가해야 한다.

### 선택지 C: PRD/ADR status를 사용하지 않는다

- 장점: 승인 상태 오용 가능성이 줄어든다.
- 단점: raw artifact lifecycle을 잃고, 참조 프로젝트와의 정합성도 낮아진다.

## 선택 근거

B를 선택한다. 지침만으로는 이번 실수를 막지 못했으므로 자동 검사가 필요하다.
frontmatter 승인 근거는 가볍고, PRD/ADR lifecycle을 유지하면서도 사용자 승인 경계를
명확하게 남긴다.

## 결과

### 긍정적 영향

- 에이전트가 승인 상태를 단독 확정하는 실수를 `harness:check`가 잡는다.
- PRD/ADR 승인 근거가 raw layer에 남는다.
- 기존 문서는 legacy marker로 보존하면서 새 규칙을 적용할 수 있다.

### 부정적 영향 / 트레이드오프

- 승인 전에는 feature 구현이 멈추거나 review/proposed 상태로 남을 수 있다.
- 사용자가 명시적으로 승인했다는 근거를 에이전트가 짧게 기록해야 한다.

## 후속 작업

- [ ] 데이터 계약 브랜치 PRD/ADR은 사용자 검토 후 승인 상태로 전환한다.
- [ ] 향후 PR/merge 전 accepted ADR에 `user:` approval이 있는지 확인한다.

## 검증

- [ ] `npm run harness:check`
- [ ] `npm run harness:gate`
