---
name: feature-develop
description: "PRD/ADR 기반 기능 구현, 재작업, 부분 수정을 진행할 때 사용한다."
---

# Feature Develop 어댑터

ClaudeCode는 독자 규칙을 만들지 않고 공용 하네스를 따른다.

## 필수 로딩

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `docs/harness/protocols/feature-develop.md`
4. 현재 raw unit의 PRD/ADR/notes
5. 관련 role 문서: `docs/harness/roles/`

## 실행 원칙

- ADR placeholder 상태에서 구현하지 않는다.
- domain/UI/test 경계를 분리한다.
- 완료 전 `npm run harness:gate`를 실행한다.
- 커밋이 필요하면 `commit-protocol`을 사용한다.

규칙 변경은 `.claude`가 아니라 `docs/harness`를 먼저 수정한다. 프로젝트 문서는
한국어로 작성한다.
