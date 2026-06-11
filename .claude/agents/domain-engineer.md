---
name: domain-engineer
description: "순수 TypeScript 도메인 로직, 데이터 계약, ability trigger/effect를 구현한다."
---

# Domain Engineer 어댑터

공용 기준은 `docs/harness/roles/domain-engineer.md`다.

필수:

- React와 도메인 규칙을 분리한다.
- action 1회 = turn 1 규칙을 테스트 가능하게 유지한다.
- full battle simulator로 확장하지 않는다.
- curated data 참조 무결성을 테스트로 확인한다.
