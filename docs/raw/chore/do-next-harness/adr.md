---
title: "Do Next 하네스 강화"
date: "2026-06-11"
status: accepted
approval: "user:2026-06-11:Do Next 기반 하네스 강화 계획 구현 요청"
unit_type: chore
---

# ADR: Do Next 하네스 강화

## 상태

accepted

## 맥락

기존 하네스는 열린 작업을 `work-intake`와 `prd-drafting`으로 나누어 처리했다.
이 방식은 단계가 명확하다는 장점이 있지만, 실제 사용자는 "이제 뭐하지?"처럼
열린 요청으로 시작하고 이후 딥 인터뷰, 작업 단위 선정, PRD/ADR 승인까지 한
흐름으로 이어가길 원한다.

또한 Codex와 ClaudeCode 양쪽에 `$deep-interview`, `$ralplan`, `$ralph`가 존재하므로
앱별 구현 세부보다 공통 스킬 이름과 경계가 중요하다.

## 결정

- 새 표준 진입점은 `$do-next`로 둔다.
- `work-intake`와 `prd-drafting`은 삭제하지 않고 `$do-next`의 내부 단계 또는
  호환 별칭으로 보존한다.
- `$do-next`는 작업 단위 선정, 브랜치 생성, raw PRD/ADR 작성, 명시 승인 기록까지
  담당한다.
- `$do-next`는 구현을 시작하지 않는다.
- PRD/ADR 승인 후 구현 요청은 위험도 기준 `$ralplan` 게이트와 branch-sized 기본
  `$ralph` 실행 레일을 따른다.
- `harness:check`는 Codex/ClaudeCode `do-next` 어댑터 존재와 기존 intake/drafting
  어댑터의 `$do-next` 호환 문구를 검사한다.

## 대안

### 대안 1: 기존 `work-intake`와 `prd-drafting`만 강화

- 장점: 파일 추가가 적다.
- 단점: 사용자가 기대하는 "다음 작업 하나 확정" 경험이 계속 여러 진입점으로 흩어진다.
- 기각 이유: Codex/ClaudeCode 양쪽에서 동일하게 호출할 표준 스킬명이 필요하다.

### 대안 2: 기존 intake/drafting 스킬 삭제

- 장점: 진입점이 하나만 남는다.
- 단점: 기존 문서와 어댑터를 참조하는 에이전트가 깨질 수 있다.
- 기각 이유: 하네스는 cross-agent 호환성이 중요하므로 삭제보다 포워딩이 안전하다.

### 대안 3: 모든 구현 전에 `$ralplan` 필수

- 장점: 일관성은 가장 강하다.
- 단점: 오타 수정이나 단일 파일 문서 수정도 지나치게 무거워진다.
- 기각 이유: 형님은 위험도 기준 필수 게이트를 선택했다.

## 결과

- 열린 요청은 `$do-next`로 시작한다.
- 기존 intake/drafting 흐름은 `$do-next`로 수렴한다.
- 승인 전 문서 상태와 승인 후 구현 상태가 분리된다.
- 구조적 변경은 `$ralplan`, branch-sized 구현은 `$ralph`로 연결된다.

## 검증

- `npm run harness:check`
- `npm run lint`
- `npm run build`
- `npm run test:run`
- `npm run harness:gate`
