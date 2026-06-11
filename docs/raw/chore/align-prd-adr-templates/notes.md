---
title: "PRD ADR 템플릿 정합화"
date: "2026-06-11"
status: draft # draft | done | rejected
unit_type: chore
---

# Chore: PRD ADR 템플릿 정합화

## 맥락

`html-editor-fe`의 PRD/ADR 템플릿은 기능 요구사항과 비기능 요구사항을
분리하고, ADR에서 선택지와 선택 근거를 명확히 요구한다. 반면 이 프로젝트의
초기 템플릿은 문제/목표/요구사항/수용 기준 정도만 있어, 하네스 강도에 비해
raw artifact의 기본 형식이 얇았다.

## 범위

- 범위에 포함: feature PRD/ADR 템플릿을 `html-editor-fe` 수준에 맞춰 보강,
  PRD 작성 프로토콜 정합화, `raw-start` placeholder 치환 보강.
- 범위에서 제외: 사내 issue id 필드, Dooray 컨벤션, html-editor 도메인 특수
  문구.

## 결정

- PRD 템플릿은 `배경`, `목표`, `비목표`, `기능 요구사항`, `비기능 요구사항`,
  `수용 기준`, `열린 질문`, `ADR 필요 여부`, `관련 문서`를 기본으로 한다.
- ADR 템플릿은 `컨텍스트`, `결정`, `선택지 A/B`, `선택 근거`, `결과`,
  `후속 작업`, `검증`을 기본으로 한다.
- `issue_id` 대신 branch/raw 기반 메타데이터를 둔다.

## 검증

- `npm run harness:ingest -- docs/raw/chore/align-prd-adr-templates`
- `npm run harness:gate`
