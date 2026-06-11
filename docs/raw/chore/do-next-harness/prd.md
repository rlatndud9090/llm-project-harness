---
title: "Do Next 하네스 강화"
date: "2026-06-11"
status: approved
approval: "user:2026-06-11:Do Next 기반 하네스 강화 계획 구현 요청"
unit_type: chore
---

# PRD: Do Next 하네스 강화

## 배경

현재 하네스는 열린 작업 요청을 `work-intake`와 `prd-drafting`으로 나누어
처리한다. 이 구조는 후보 선정, 딥 인터뷰, raw unit 생성, PRD/ADR 승인, 구현
핸드오프의 경계가 여러 문서에 흩어져 있어 Codex와 ClaudeCode가 서로 다른
진입점을 밟을 수 있다.

형님은 Codex와 ClaudeCode 양쪽에 OMC/OMX 계열 스킬이 존재한다는 전제를 두고,
각 앱이 자기 환경의 `$deep-interview`, `$ralplan`, `$ralph`를 사용하도록 공통
하네스에 명시하길 원한다.

## 목표

- 열린 요청의 새 표준 진입점을 `$do-next`로 통일한다.
- `$do-next`가 작업 단위 선정, 브랜치 생성, raw PRD/ADR 작성, 명시 승인 기록까지
  책임지게 한다.
- `$do-next`는 구현을 시작하지 않고 문서 확정에서 종료한다.
- PRD/ADR 확정 후 구현 요청은 위험도 기준 `$ralplan`, branch-sized 기본 `$ralph`
  흐름으로 연결한다.
- Codex/ClaudeCode 어댑터와 `harness:check`가 새 표준을 추적하게 한다.

## 비목표

- 실제 제품 기능이나 domain engine을 구현하지 않는다.
- OMC/OMX 런타임 자체를 수정하지 않는다.
- `work-intake`와 `prd-drafting`을 삭제하지 않는다.
- 모든 작은 수정에 `$ralplan`을 강제하지 않는다.

## 요구사항

### 기능 요구사항

- `docs/harness/protocols/do-next.md`가 `$do-next` 흐름을 정의해야 한다.
- 열린 요청은 `$do-next`로 라우팅되어야 한다.
- 기존 `work-intake`와 `prd-drafting`은 `$do-next` 호환 별칭 또는 내부 단계로 남아야 한다.
- `$do-next`는 승인 전 PRD `review`, ADR `proposed` 상태를 유지해야 한다.
- 명시 승인 후에만 `approval: "user:YYYY-MM-DD:<근거>"`와 함께 PRD `approved`,
  ADR `accepted`로 전환해야 한다.
- 구현 요청은 승인된 PRD/ADR을 전제로 해야 한다.
- 구조, 데이터, engine, harness, dependency, 다중 모듈 변경은 `$ralplan`을 먼저
  거치도록 문서화해야 한다.
- 승인된 branch-sized 구현은 `$ralph`를 기본 실행 레일로 문서화해야 한다.

### 비기능 요구사항

- 모든 프로젝트 문서는 한국어로 작성한다.
- `.codex/`와 `.claude/`는 공용 `docs/harness/`를 가리키는 얇은 어댑터로 유지한다.
- `harness:check`는 Codex/ClaudeCode `do-next` 어댑터 존재와 기존 intake/drafting
  어댑터의 `$do-next` 호환 문구를 검사해야 한다.

## 수용 기준

- `docs/harness/protocols/do-next.md`가 존재한다.
- `docs/harness/README.md`와 `session-start.md`가 열린 요청을 `$do-next`로 안내한다.
- `work-intake.md`와 `prd-drafting.md`가 `$do-next`의 하위 호환 절차임을 명시한다.
- `feature-develop.md`가 승인된 PRD/ADR 이후 `$ralplan` 위험도 게이트와 `$ralph`
  기본 실행 레일을 설명한다.
- `.codex/skills/do-next/SKILL.md`와 `.claude/skills/do-next/SKILL.md`가 존재한다.
- `npm run harness:check`가 `do-next` 어댑터와 호환 문구를 검사한다.
- `npm run harness:gate`가 통과한다.

## 열린 질문

- 없음. 형님이 제시한 구현 계획을 기준으로 진행한다.

## ADR 필요 여부

- 필요하다. 새 표준 진입점, 기존 스킬 보존 방식, `$ralplan/$ralph` 실행 레일은
  하네스 정책 결정이다.

## 관련 문서

- ADR: `./adr.md`
- Notes: `./notes.md`
