---
title: "ADR 승인 게이트"
date: "2026-06-11"
status: done # draft | done | rejected
unit_type: chore
---

# Chore: ADR 승인 게이트

## 맥락

- 데이터 계약 작업에서 에이전트가 PRD/ADR을 단독으로 approved/accepted 처리했다.
- 형님이 ADR은 의사결정이므로 함께 확정해야 한다고 지적했다.
- 참조 프로젝트는 인간의 역할을 PRD/ADR 작성과 방향 결정으로 두고, integrator가
  ADR 불변성을 강하게 검증한다.

## 범위

- 포함: 승인 frontmatter 규칙, artifact check 자동 검사, feature/role/skill 문서 보강,
  기존 approved/accepted 문서 legacy marker.
- 제외: feature 구현 변경, 과거 ADR 본문 재작성.

## 결정

- PRD `approved`, ADR `accepted`에는 `approval:` frontmatter가 필요하다.
- 새 승인 근거는 `user:YYYY-MM-DD:<근거>` 형식이다.
- 기존 approved/accepted 문서는 `legacy-before-approval-gate` marker만 허용한다.

## 검증

- 통과: `npm run harness:check`
- 통과: `npm run harness:gate`
- 참고: main에는 테스트 파일이 없어 `test:run`은 `--passWithNoTests`로 통과했다.
