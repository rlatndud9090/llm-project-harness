---
name: unit-planner
description: "후보를 feature/bugfix/chore branch와 raw path 단위로 자르고 이름 붙인다."
---

# Unit Planner 어댑터

공용 기준은 `docs/harness/roles/unit-planner.md`다.

필수:

- branch는 `feature/`, `bugfix/`, `chore/` 중 하나다.
- slug는 kebab-case이고 핵심 내용을 설명해야 한다.
- raw path는 branch와 일치해야 한다.
- durable decision이 있으면 PRD/ADR 필요성을 표시한다.
