---
name: next-feature
description: "다음 작업 단위 후보를 추천하고 하나를 선택할 때 사용한다."
---

# Next Feature 어댑터

공용 기준은 `.harness/harness/protocols/next-feature.md`다.

## 실행 순서

1. `.harness/harness/protocols/next-feature.md`를 읽는다.
2. 목표/비목표/결정 경계를 확정한다(`$deep-interview`가 있으면 그 스킬을 우선 사용하고, 없으면 현재 런타임의 구조화 질문 도구를 우선 사용하며 그마저 없을 때만 명시 질문).
3. `.harness/harness/roles/intake-helper.md`, `unit-planner.md`로 후보 3~5개를 만든다.
4. 1순위 추천과 이유를 제시하고 사용자가 하나를 선택하게 한다.

후보는 branch name, raw path, scope, non-scope, 검증 방법, PRD/ADR 필요성을
포함한다. 구현이나 PRD 작성은 하지 않는다. 선택된 작업 단위는 `$kickoff`로 넘긴다.

## 질문 도구

- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 사용한다.
- 질문 transport는 deep-interview 내부에서 현재 surface에 맞게 선택한다.
- `$deep-interview`가 없을 때만 현재 런타임의 구조화 질문 도구로 직접 fallback한다.
- 구조화 질문 도구도 없을 때만 간결한 명시 질문으로 fallback한다.
