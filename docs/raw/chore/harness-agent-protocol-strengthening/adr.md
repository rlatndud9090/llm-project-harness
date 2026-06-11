---
title: "하네스 커밋 추적성과 역할 정의 강화"
date: "2026-06-11"
status: accepted
unit_type: chore
branch: "chore/harness-agent-protocol-strengthening"
raw_path: "docs/raw/chore/harness-agent-protocol-strengthening"
related_prd: "docs/raw/chore/harness-agent-protocol-strengthening/prd.md"
---

# ADR: 하네스 커밋 추적성과 역할 정의 강화

## 컨텍스트

참조 프로젝트는 커밋 본문에 PRD/ADR 링크를 필수로 두고, 역할별 agent prompt도
담당/미담당, 강한 실패 모드, 출력 형식, 최종 체크리스트를 갖는다. 이 프로젝트는
raw/wiki/harness 구조를 이미 갖췄지만, 커밋과 raw 문서의 연결 방식이 trailer
중심이라 PRD/ADR 링크가 눈에 잘 띄지 않았고, 일부 역할 정의는 도메인 방향
변경을 충분히 반영하지 못했다.

## 결정

커밋 프로토콜은 Lore Commit Protocol을 유지하되, 본문에 `관련 문서:` 블록을
필수로 둔다. 제품, 아키텍처, 구현, 하네스 정책 변경 커밋은 관련 PRD와 ADR
링크를 포함해야 한다.

작고 결정이 없는 notes-only chore/bugfix는 예외로 허용하지만, 그 경우에도
`관련 문서:` 블록에 Notes 링크를 두고 `Related:` trailer로 raw unit을 연결한다.
프로젝트 방향, 하네스 정책, 데이터 구조, 엔진 경계, UI 구조 같은 durable decision
이 포함되면 chore라도 PRD/ADR을 추가한다.

역할 정의는 공용 `docs/harness/roles/`에 강화하고, `.codex/`와 `.claude/`는 얇은
어댑터로 유지한다. 도구별 파일은 공용 하네스를 다시 설명하지 않고, 해당 도구가
지켜야 하는 최소 진입점과 금지 사항을 보강한다.

## 선택지

### A. 참조 프로젝트 형식을 그대로 복사한다

- 장점: 강도가 즉시 올라간다.
- 단점: 이 프로젝트의 Lore Commit Protocol, branch-derived raw unit, 한국어 문서
  원칙과 충돌한다.

### B. 공용 하네스를 진실 원천으로 두고 강도만 이식한다

- 장점: Codex/ClaudeCode 양쪽이 같은 규칙을 참조하고, 프로젝트 고유 정책과
  충돌하지 않는다.
- 단점: 도구별 prompt가 참조 프로젝트보다 얇아 보일 수 있다.

## 선택 근거

B를 선택한다. 이 프로젝트의 핵심은 특정 도구 프롬프트가 아니라
`docs/harness/`가 cross-agent source of truth가 되는 것이다. 따라서 강한 규칙은
공용 문서에 두고, `.codex/`와 `.claude/`는 실행 표면에 맞춘 어댑터로 유지하는
편이 장기적으로 안전하다.

## 결과

- 의미 있는 커밋은 PRD/ADR 링크와 Lore trailer를 동시에 갖는다.
- notes-only 예외는 작고 결정 없는 유지보수로 제한된다.
- 역할 prompt는 실행 가능한 출력 형식, 실패 모드, 체크리스트를 갖는다.
- 도메인 방향은 “거창한 플랫폼”보다 “1일 1회 배틀형 퀴즈”를 기준으로 정렬된다.

## 후속 작업

- 향후 bugfix/chore raw-start가 PRD/ADR을 기본 생성해야 하는지 별도 작업에서
  검토한다.
- 데이터 계약 작업에서는 이 커밋 프로토콜을 적용해 PRD/ADR 링크가 있는 커밋을
  만든다.

## 검증

- `npm run harness:check`
- `npm run harness:gate`
