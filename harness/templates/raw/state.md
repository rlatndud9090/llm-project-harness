---
title: "{제목}"
date: "{YYYY-MM-DD}"
stage: kickoff
prd_status: draft
adr_status: proposed
---

# 작업 단계 원장: {제목}

이 파일은 이 작업 단위의 **단계 체크포인트**이자 **승인 증거**다. 새 세션이나
새 에이전트가 작업을 이어받을 때 **가장 먼저 이 파일을 읽어** 지금 어느 단계인지,
승인을 이미 받았는지 판단한다. 채팅 히스토리가 아니라 이 원장이 단일 진실원이다.

규칙:

- `stage`와 `prd_status`/`adr_status`를 **손으로 승인 상태(approved/accepted)로 바꾸지
  않는다.** 승인 전환은 오직 `npm run harness:approve`로만 한다.
- 아래 `## 승인 이벤트`에 사용자의 명시 승인이 기록되기 전에는 PRD를 `approved`,
  ADR을 `accepted`로 둘 수 없다(`harness:check`가 막고, 구현도 시작할 수 없다).
- 단계가 바뀌면 `## 단계 로그`에 한 줄 append 하고 `stage`를 갱신한다.

## 단계 로그 (append-only)

- {YYYY-MM-DD} kickoff: 브랜치와 raw 골격 생성

## 승인 이벤트

<!-- 이 블록은 `npm run harness:approve`만 기록한다. 사용자의 명시 승인 발화가
     verbatim으로 남고, harness:check가 이 이벤트와 PRD/ADR status의 정합성을
     교차검증한다. 손으로 위조하면 여러 아티팩트를 동시에 조작해야 하며 감사에
     드러난다. -->

(아직 승인 없음 — 구현 진입 불가)
