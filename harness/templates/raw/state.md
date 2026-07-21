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
- **`adr.md`는 `stage`가 `adr-draft` 이상으로 올라간 뒤에만 편집한다.** `$prd-helper`
  단계(`kickoff`/`prd-draft`/`prd-review`)에서는 `adr.md`를 스켈레톤 그대로 두고, ADR
  필요 여부·이유는 PRD `## ADR 필요 여부`에 남긴다(런타임 가드와 `harness:check`가 강제).
- 단계 순서: `kickoff` → `prd-draft` → `prd-review` → (ADR 필요 시 `adr-draft` →
  `adr-review`) → `approved` → `implementing` → `integrated`. ADR이 불필요하면 ADR 단계를
  건너뛰고 PRD 단독 승인으로 `approved`에 진입한다.
- 이 unit이 속한 **area(영역)**는 이 원장이 아니라 `prd.md`(feature)/`bugfix.md`(bugfix)
  frontmatter의 `area:`에 산다. wiki는 그 area의 `### 헤딩` 아래 시간순으로 이 unit을 잇고,
  `harness:check`가 선언한 area와 렌더된 헤딩의 일치를 강제한다.

## 단계 로그 (append-only)

- {YYYY-MM-DD} kickoff: raw 골격 생성

## 승인 이벤트

<!-- 이 블록은 `npm run harness:approve`만 기록한다. 사용자의 명시 승인 발화가
     verbatim으로 남고, harness:check가 이 이벤트와 PRD/ADR status의 정합성을
     교차검증한다. 손으로 위조하면 여러 아티팩트를 동시에 조작해야 하며 감사에
     드러난다. -->

(아직 승인 없음 — 구현 진입 불가)
