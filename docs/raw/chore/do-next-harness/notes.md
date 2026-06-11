---
title: "Do Next 하네스 강화"
date: "2026-06-11"
status: done # draft | done | rejected
approval: "user:2026-06-11:Do Next 기반 하네스 강화 계획 구현 요청"
unit_type: chore
---

# Chore: Do Next 하네스 강화

## 맥락

열린 작업 요청을 `work-intake`와 `prd-drafting`으로 나누어 처리하던 흐름을
`$do-next` 표준 진입점으로 정리한다. Codex와 ClaudeCode 양쪽에서 같은 이름의
스킬을 호출하고, 승인 이후 구현은 `$ralplan`/`$ralph` 레일로 이어지게 한다.

## 범위

- 포함: 공용 `do-next` 프로토콜, Codex/ClaudeCode 어댑터, 기존 intake/drafting
  호환 문구, feature-develop 실행 레일, artifact-check 검증.
- 제외: 제품 기능 구현, OMC/OMX 런타임 수정, 기존 intake/drafting 삭제.

## 결정

- `$do-next`를 새 표준 진입점으로 둔다.
- 기존 `work-intake`와 `prd-drafting`은 `$do-next` 호환 별칭으로 보존한다.
- `$do-next`는 PRD/ADR 승인까지 담당하고 구현하지 않는다.
- 승인 후 구조적 변경은 `$ralplan`, branch-sized 구현은 `$ralph`를 기본으로 둔다.

## 검증

- `npm run harness:gate`
