---
name: do-next
description: "열린 작업 아이디어를 branch-sized work unit과 승인된 PRD/ADR로 확정할 때 사용한다."
---

# Do Next 어댑터

ClaudeCode는 독자 규칙을 만들지 않고 공용 하네스의 `$do-next` 흐름을 따른다.

## 필수 로딩

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `.harness/harness/protocols/do-next.md`
4. 필요한 경우 `.harness/harness/protocols/work-intake.md`
5. 필요한 경우 `.harness/harness/protocols/prd-drafting.md`

## 실행 원칙

- 열린 요청은 `$do-next`가 표준 진입점이다.
- 의도와 결정 경계는 ClaudeCode 환경에 설치된 `$deep-interview`로 좁힌다.
- OMC/OMX 런타임의 structured question UI가 있으면 그 경로를 사용한다.
- structured input이 없으면 한 번에 하나의 명시 질문만 묻는다.
- 작업 단위가 확정되면 `feature/`, `bugfix/`, `chore/` 브랜치와 같은 raw path를 만든다.
- PRD는 `review`, ADR은 `proposed`로 작성한 뒤 사용자 명시 승인 때만 승인 상태로 전환한다.
- `$do-next`는 구현하지 않는다.

## 구현 핸드오프

승인된 PRD/ADR 이후 구현 요청이 오면:

- 구조, 데이터, engine, dependency, 다중 모듈 변경은 `$ralplan`을 먼저 사용한다.
- 승인된 branch-sized 구현은 `$ralph`를 기본 실행 레일로 사용한다.
- 하네스 submodule 업데이트나 adapter 정리는 제품 기능 변경과 분리한다.
- 작은 문서/오타/국소 수정만 solo execute를 허용한다.

규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다.
