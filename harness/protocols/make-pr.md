# PR 생성 프로토콜 ($make-pr)

`$make-pr`는 사전 승인(pre-approved)으로 빌드된 작업 단위를 **최종 확정**하고 커밋과 PR
생성까지 마무리하는 공용 오케스트레이션 절차다. 승인 2단계 흐름의 마지막 단계다:
`$prd-helper`/`$adr-helper`가 **사전 승인**(빌드 진입 게이트)을 받고, `feature-develop`가
구현·검증하며, 이 `$make-pr`가 **최종 확정**(진짜 `approved`/`accepted`) 후 커밋·PR을 만든다.

절차와 게이트의 강도는 이 하네스가 유지하고, PR을 실제로 생성하는 수단(런타임의 GitHub
통합)은 도구별 어댑터가 정의한다.

## 왜 최종 확정을 여기서 하는가

사전 승인은 **잠정**이다. 구현 결과를 보고 PRD/ADR을 개정하는 일이 흔하기 때문에, 빌드 진입은
가볍게(pre-approved) 열어 두고 최종 확정은 **PR을 만드는 순간 한 번 무겁게** 받는다. 그래서
개정이 반영된 최종 PRD/ADR을 사용자가 마지막으로 확인한 뒤에야 `approved`/`accepted`로 굳는다.

## 입력과 출력

```txt
입력: 사전 승인 후 구현·검증이 끝난 작업 단위 (state.md stage=implementing, harness:gate green 목표)
출력: PRD/ADR 최종 확정(approved/accepted) + Lore commit + push + PR 생성 + PR 링크 보고
```

## 전제 (하드 차단)

이 게이트를 건너뛰고 커밋·PR로 넘어가지 않는다.

1. 현재 branch와 raw path를 확인한다(`git status --short --branch`). 작업 단위 브랜치 위에 있어야 한다.
2. **`state.md`를 먼저 읽는다.** feature 단위는 PRD가 `pre-approved`, (ADR 필요 시) ADR이
   `pre-accepted`여야 한다 — 아직 사전 승인 전이면 `$prd-helper`/`$adr-helper`로 되돌린다.
3. 구현과 검증이 실제로 끝났는지 확인한다. 미완이면 `feature-develop`로 되돌린다.

## Phase 1: 최종 확정 (명시 의례로만)

feature 단위의 `approved`/`accepted` 전환은 사용자의 **명시 최종 승인**이 있을 때만, 오직
`harness:approve --final`로만 한다.

1. **개정 반영 확인**: 빌드 중 PRD/ADR을 개정했다면, 개정이 반영된 최종본이 맞는지 먼저 정리한다
   (개정 이력은 `state.md` `## 단계 로그`에 남아 있어야 한다).
2. 현재 런타임의 구조화 질문 도구로, **대상 문서와 전환 상태를 명시해** 최종 승인을 요청한다.
   예: "이 PRD와 ADR을 approved/accepted로 최종 확정하고 커밋·PR을 만들까요? (확정 / 아직)".
   개정본이 있으면 무엇이 사전 승인 대비 바뀌었는지 요약해 함께 보여준다.
3. 사용자가 분명히 확정하면 **그 발화를 그대로 인용**해 실행한다.

```sh
npm run harness:approve -- --unit docs/raw/feature/<slug> --quote "<사용자의 최종 확정 발화 verbatim>" --final [--adr]
```

`harness:approve --final`은 `pre-approved` PRD를 `approved`로, `pre-accepted` ADR을
`accepted`로 원자적으로 함께 전환하고, 각 status·`approval:` 근거·`state.md` `APPROVAL`
이벤트를 기록하며 `stage`를 `approved`로 올린다. 에이전트가 직접 frontmatter status를 고치지
않는다(런타임 훅과 `harness:check`가 막는다).

**최종 확정으로 간주하지 않는 것:** "좋아 보인다", 방향 설명, 목표·범위 재확인 — 이 중 어느
것도 확정이 아니다. 확정은 위 확정 요청에 대한 사용자의 분명한 긍정 응답만을 뜻한다. 모호하면
확정하지 않고 `pre-approved`/`pre-accepted`로 둔 채 다시 구조화 질문으로 확인한다.

- **bugfix/chore 단위**: PRD/ADR 승인 축이 없으므로 최종 확정 플립을 건너뛴다(bugfix는 `bugfix.md`
  `fixed`, chore는 notes-only). 곧바로 아래 Phase 2로 간다.

## Phase 2: 통합 게이트

```sh
npm run harness:ingest -- docs/raw/<type>/<slug>
npm run harness:gate
```

최종 확정으로 status가 바뀐 뒤 `harness:gate`(= `harness:check` + lint + build + test:run)를
신선한 출력으로 판정한다. `harness:check`는 이제 `approved`/`accepted`와 `APPROVAL` 이벤트의
정합성까지 교차검증한다. 실패하면 커밋하지 않고 원인을 수정한 뒤 처음부터 다시 실행한다.

## Phase 3: 커밋

`commit-protocol`을 그대로 따른다(명시적 스테이징, `관련 문서:` 블록에 PRD/ADR 링크, Lore
trailer, HEREDOC). 이 커밋이 작업 단위를 마무리하는 커밋이며, 최종 확정된 PRD/ADR status
변경을 함께 담는다. 구현 중 브랜치에 남긴 중간 커밋이 있어도 무방하다.

## Phase 4: Push와 PR 생성

1. 작업 단위 브랜치를 원격에 push한다.
2. 런타임의 GitHub 통합으로 PR을 생성한다. `gh` CLI 가용성을 가정하지 않는다(도구별 어댑터가
   실제 수단을 정의한다).
3. PR 제목·본문:
   - 제목은 작업 단위를 한 줄로 설명한다(소비 프로젝트에 커밋/PR 제목 규약이 있으면 그것을 따른다).
   - 본문에는 무엇을·왜 바꿨는지 요약과 함께 PRD/ADR 경로를 링크한다. 저장소에 PR 템플릿
     (`.github/PULL_REQUEST_TEMPLATE` 등)이 있으면 그 구조를 따른다.
4. 생성된 PR의 URL을 사용자에게 보고한다.

## 실패 모드

- **나쁨:** 사전 승인만 받은 상태에서 곧바로 `harness:approve --final`로 확정한다(사용자 최종
  확인 없이).
- **좋음:** 최종 PRD/ADR을 보여주고 명시 확정 발화를 받은 뒤에만 `--final`로 확정한다.

- **나쁨:** 최종 확정 없이(`pre-approved`인 채로) 커밋·PR을 만든다.
- **좋음:** feature 단위는 `$make-pr`에서 `approved`/`accepted`로 확정한 뒤 커밋·PR을 만든다.

- **나쁨:** `harness:gate`를 확정 전에 한 번 돌리고 확정 후에는 생략한다.
- **좋음:** 최종 확정으로 status가 바뀐 뒤 `harness:gate`를 다시 신선하게 판정하고 커밋한다.

- **나쁨:** PR 본문에 PRD/ADR 링크 없이 diff 요약만 남긴다.
- **좋음:** 무엇을·왜와 함께 PRD/ADR을 링크해 결정 추적성을 유지한다.
