---
title: "하네스 스킬과 에이전트 정의 보강"
date: "2026-06-11"
status: approved
unit_type: chore
branch: "chore/harness-agent-protocol-strengthening"
raw_path: "docs/raw/chore/harness-agent-protocol-strengthening"
---

# PRD: 하네스 스킬과 에이전트 정의 보강

## 배경

현재 프로젝트는 Codex와 ClaudeCode가 같은 raw/wiki/harness 원칙을 공유하도록
구성되어 있다. 하지만 스킬과 서브에이전트 정의의 강도는 참조 프로젝트보다
얇아서, 커밋 추적성, PRD/ADR 링크, 스테이징 금지 규칙, 역할별 출력 형식,
실패 모드가 충분히 강제되지 않는다.

이 프로젝트는 여러 세션과 여러 에이전트가 이어서 개발하므로, 도구별 어댑터가
달라도 같은 수준의 절차와 품질 기준을 적용해야 한다.

## 목표

- [ ] 커밋 프로토콜이 모든 의미 있는 커밋을 raw 문서와 연결하도록 강화한다.
- [ ] 기능/구조 변경 커밋은 관련 PRD와 ADR 링크를 본문에 포함하도록 한다.
- [ ] `git add -A`, `git add .`, `--no-verify` 같은 추적성 우회 경로를 금지한다.
- [ ] 역할 정의가 담당/미담당, 성공 기준, 금지 사항, 출력 형식, 실패 모드,
      최종 체크리스트를 갖도록 보강한다.
- [ ] Codex와 ClaudeCode 어댑터가 공용 하네스를 같은 강도로 참조하도록 한다.

## 비목표

- [ ] 참조 프로젝트의 도메인 특화 스킬을 그대로 가져오지 않는다.
- [ ] 포켓몬 퀴즈 구현, 데이터 계약, UI 구현을 이 작업에서 시작하지 않는다.
- [ ] 도구별 런타임 내부 동작까지 강제로 통일하지 않는다.
- [ ] 기존 raw/wiki 구조를 `.omx` 또는 특정 도구 전용 구조로 되돌리지 않는다.

## 요구사항

### 기능 요구사항

- [ ] 커밋 프로토콜은 `관련 문서:` 블록을 필수로 설명해야 한다.
- [ ] 제품/아키텍처/구현 변경 커밋은 `[PRD](...)`와 `[ADR](...)` 링크를 포함해야 한다.
- [ ] notes-only chore/bugfix 예외는 작고 결정이 없는 유지보수에만 허용되어야 한다.
- [ ] 커밋 메시지는 Lore Commit Protocol과 공존해야 한다.
- [ ] Integrator 역할은 검증, 명시적 스테이징, 커밋 메시지 작성 책임을 강하게 가져야 한다.
- [ ] 각 역할은 자신이 하지 않아야 할 일을 명확히 거부해야 한다.
- [ ] 도구별 스킬 어댑터는 공용 `docs/harness/` 문서를 진실 원천으로 삼아야 한다.

### 비기능 요구사항

- [ ] 모든 새 프로젝트 문서는 한국어로 작성한다.
- [ ] 하네스 규칙은 Codex와 ClaudeCode 양쪽에서 추적 가능해야 한다.
- [ ] 규칙은 과도한 장식보다 실행 가능한 체크리스트와 실패 모드 중심이어야 한다.
- [ ] 하네스 검증 명령으로 raw/wiki/adapter 정합성을 확인할 수 있어야 한다.

## 수용 기준

- [ ] `docs/harness/protocols/commit-protocol.md`가 PRD/ADR 링크 정책을 포함한다.
- [ ] `docs/harness/roles/integrator.md`가 관련 문서 링크, HEREDOC, 금지 명령,
      fresh gate 확인을 명시한다.
- [ ] 주요 role 문서가 출력 형식과 최종 체크리스트를 갖는다.
- [ ] `.codex/`와 `.claude/` 어댑터가 공용 하네스 기준을 가리킨다.
- [ ] `npm run harness:check`가 통과한다.

## 열린 질문

- 향후 모든 bugfix/chore에도 PRD/ADR을 기본 생성할지, 의미 있는 결정이 있는
  작업에만 요구할지 추가 논의가 필요하다.

## ADR 필요 여부

필요하다. 커밋 문서 링크 정책과 notes-only 예외 범위는 후속 에이전트 행동을
제약하는 durable process decision이므로 ADR에 남긴다.

## 관련 문서

- ADR: `./adr.md`
