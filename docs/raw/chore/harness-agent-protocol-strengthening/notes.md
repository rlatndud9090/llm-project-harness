---
title: "하네스 스킬과 에이전트 정의 보강"
date: "2026-06-11"
status: done # draft | done | rejected
unit_type: chore
---

# Chore: 하네스 스킬과 에이전트 정의 보강

## 맥락

형님이 참조 프로젝트와 비슷한 수준의 commit-protocol, skill, subagent 강도를
요청했다. 특히 모든 의미 있는 커밋이 PRD/ADR 링크를 갖고, Codex와 ClaudeCode가
같은 하네스 규칙을 적용해야 한다.

## 범위

- 범위에 포함: 커밋 프로토콜, 통합 역할, 공용 역할 prompt, 도구별 스킬/에이전트
  어댑터, raw/wiki 연결.
- 범위에서 제외: 포켓몬 퀴즈 데이터 계약 구현, 앱 UI 구현, 전체 raw-start 정책
  변경.

## 결정

- 공용 `docs/harness/`를 진실 원천으로 유지한다.
- 커밋 본문에는 `관련 문서:` 블록을 두고, 제품/구조/정책 변경은 PRD/ADR 링크를
  포함한다.
- notes-only chore/bugfix 예외는 작고 결정이 없는 유지보수에만 둔다.

## 검증

- 통과: `npm run harness:check`
- 통과: `npm run harness:gate`
- 참고: `test:run`은 현재 테스트 파일이 없어 `--passWithNoTests`로 통과했다.
