---
name: next-feature
description: "다음 작업 단위 후보를 추천하고 하나를 선택할 때 사용한다."
---

# Next Feature 어댑터

공용 기준은 `.harness/harness/protocols/next-feature.md`다.

## 실행 순서

1. `.harness/harness/protocols/next-feature.md`를 읽는다.
2. `$deep-interview`로 목표/비목표/결정 경계를 확정한다.
3. `.harness/harness/roles/intake-helper.md`, `unit-planner.md`로 후보 3~5개를 만든다.
4. 1순위 추천과 이유를 제시하고 사용자가 하나를 선택하게 한다.

후보는 branch name, raw path, scope, non-scope, 검증 방법, PRD/ADR 필요성을
포함한다. 구현이나 PRD 작성은 하지 않는다. 선택된 작업 단위는 `$kickoff`로 넘긴다.
