---
title: "레거시 feature raw 제거"
date: "2026-06-10"
status: draft # draft | done | rejected
unit_type: chore
---

# Chore: 레거시 feature raw 제거

## 맥락

초기 세팅에서 만든 `2026-06-09-product-foundation`과
`2026-06-09-quiz-hint-engine` raw unit은 날짜 기반 폴더명과 영어 PRD/ADR을
사용했다. 이후 프로젝트 규칙은 `브랜치명 = raw unit id`와 `프로젝트 작성
문서는 한국어 기본`으로 바뀌었다.

레거시 raw를 유지하면 새 에이전트가 날짜 기반 폴더명과 영어 문서를 여전히
허용되는 예시로 오해할 수 있다.

## 범위

- 범위에 포함: 날짜 기반 영어 feature raw 두 개 삭제, wiki 링크 제거.
- 범위에서 제외: 실제 product foundation 또는 quiz hint engine의 새 PRD/ADR
  작성. 해당 작업은 나중에 실제 브랜치에서 다시 만든다.

## 결정

- 레거시 feature raw는 보존하지 않는다.
- 필요해지는 시점에 `feature/product-foundation`,
  `feature/quiz-hint-engine` 같은 브랜치명 기반 raw unit으로 다시 작성한다.
- 현재 진행 중인 `feature/quiz-platform-shell` 작업과 섞지 않고 main에서
  chore로 처리한다.

## 검증

- `npm run harness:ingest -- docs/raw/chore/remove-legacy-feature-raw`
- `npm run harness:gate`
