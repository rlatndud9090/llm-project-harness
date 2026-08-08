---
name: pr-self-loop
description: Codex 자동 리뷰를 대신하는 자체 리뷰 루프. 코덱스 토큰이 소진·미가용일 때 pr-review-check-loop 대신 격리된 리뷰어 에이전트(Workflow 다중 렌즈 finder + 적대 검증)가 매 사이클 PR diff를 꼼꼼히 리뷰하고, 정당한 결함을 head 브랜치에서 수정·gate·커밋한 뒤, "연속 클린 2회(loop-until-dry)"에 도달할 때까지 조기종료 없이 루프를 돈다. **라이브 운영에 영향 주는 결함(BLOCKER)만 루프를 늘리고, 주석·문서 정합·네이밍 같은 사소한 것(COSMETIC)은 놓치지 않되 수렴 후 한 번에 배치 처리**해 루프가 늘어지지 않게 한다. "자체 리뷰 루프", "코덱스 대신 셀프 리뷰", "pr self loop", "격리 리뷰어로 돌려" 등에 사용. Codex를 쓰는 원본은 pr-review-check-loop.
---

# PR Self-Review Loop

Codex 자동 리뷰를 **격리된 리뷰어 에이전트의 자체 리뷰**로 대체하는 루프. 코덱스 토큰이 소진되거나
쓸 수 없을 때 [pr-review-check-loop](../pr-review-check-loop/SKILL.md)를 대신한다. 리뷰까지 Claude가
직접 하므로 **토큰 효율**과 **검증 정확도**를 동시에 챙기는 게 이 스킬의 존재 이유다.

> ⚠️ pr-review-check-loop와 달리 이건 GitHub의 Codex 리뷰를 읽는 게 아니라 **자체 리뷰**라, github.com이든
> Enterprise든 로컬 브랜치든 무관하게 diff만 있으면 돈다(원격·리뷰 봇 불필요).

## Trigger
- 사용자가 `/pr-self-loop` 명령 사용
- "자체 리뷰 루프", "코덱스 대신 셀프 리뷰", "격리 리뷰어로 리뷰 끝까지", "pr self loop" 등
- pr-review-check-loop 진행 중 Codex가 토큰 소진/무응답으로 재리뷰를 못 올릴 때 이 스킬로 전환

## Arguments
`/pr-self-loop [PR_LINK_OR_NUMBER | BRANCH]`
- 생략 시 현재 브랜치의 열린 PR 또는 현재 브랜치 자체를 리뷰 대상으로 추론. base는 PR base 또는 `main`.

---

## 핵심 규칙 (non-negotiable)

1. **리뷰만 격리 위임.** finder·verify는 Workflow 격리 에이전트가 돌린다(diff를 자기 컨텍스트에서 직접
   읽어 메인 컨텍스트를 비운다). **accept/reject 최종판정·수정·gate 채택·commit·push는 메인 에이전트만** 한다.
2. **head 브랜치 한정·force 금지.** 수정은 PR head 브랜치에서만. `git push --force*` 전면 금지.
3. **loop-until-dry: 종료 조건은 "BLOCKER 연속 클린 2회".** 한 번 클린으로 끝내지 않는다. 조기종료·거짓완료
   금지 — 이슈를 다 못 잡았는데 루프가 멈추는 걸 막는 게 이 스킬의 목적이다.
4. **심각도 게이팅(이 스킬의 핵심).** 아래 §심각도 정책대로, **라이브 운영 결함(BLOCKER)만** dry 카운터를
   리셋하고 즉시 고친다. **사소한 것(COSMETIC — 주석 오류·문서 정합·내부 네이밍)은 놓치지 않되 수렴 후
   한 번의 배치로 정리**하며, 루프를 절대 늘리지 않는다.
5. **recall 우선 적대 검증.** 각 finding은 독립 에이전트가 반증(refute-first, 기본 REFUTED)한다. 실제
   코드로 성립을 확인해야 CONFIRMED, 여지 있으나 불확실하면 PLAUSIBLE, diff 밖 기존 코드 트집이면 REFUTED.
6. **의사결정 가드.** approved PRD/accepted ADR·사용자 확정 스펙에 반하는 지적은 임의 적용 금지 —
   "스펙 반대"는 REFUTED(스펙 준수 여부만 본다). 스펙 자체를 바꿔야 하면 사용자와 먼저 논의.

---

## 심각도 정책 (사용자 지시 — 사소한 걸로 루프를 늘리지 않는다)

각 finding을 finder가 **BLOCKER** 또는 **COSMETIC**으로 분류하고, 메인은 이 축으로 루프를 제어한다.

### BLOCKER — dry 카운터를 리셋하고 그 라운드에 즉시 고친다
라이브 운영·사용자 경험·데이터에 실제로 영향을 주는 결함:
- **correctness/logic** — 잘못된 출력, 엣지에서 NaN/Infinity/크래시, off-by-one, 부동소수 누출(예: 표시가
  지수표기로 새거나 값이 0으로 뭉개짐), 계산이 스펙과 불일치.
- **contract/계약** — API·데이터 계약·스키마 파손, 제출/조회 형식 불일치, 버전 미분리로 구·신 데이터 오염.
- **regression** — 기존 동작·다른 게임/모듈이 의도치 않게 깨짐.
- **security** — 인증·CSRF·주입·시크릿 노출·권한.
- **data integrity** — 집계·저장·dedup·경계 검증 오류.
- **user-visible 오작동** — 잘못된 수치·깨진 레이아웃·빈 렌더·i18n 키 패리티 파손(런타임 빈칸).
- **위험 경로 테스트 공백** — 진짜 버그를 가릴 수 있는 미검증 분기(0 나눗셈 방어·재방문 폴백 등). 단, 단순
  "커버리지 낮음"이 아니라 **실제 회귀를 놓칠 경로**여야 BLOCKER.

### COSMETIC — 누적만 하고 **수렴 후 한 번에** 정리(루프 안 늘림)
나중에 다시 볼 때 챙길 가치는 있으나 라이브 운영엔 무해한 것:
- stale/틀린 **주석**·JSDoc, **문서 정합**(코드는 바꿨는데 설명이 옛말), 예시·표현 오타.
- **내부 네이밍**(외부 계약 아닌 식별자), 죽은-코드 주석, 비기능 스타일·포맷.
- 사용자 눈·런타임 동작에 안 드러나는 것 전부.

### 애매하면
**BLOCKER로 올린다(recall 우선).** 단 "라이브 운영·사용자·데이터에 영향 없음"이 근거로 명백하면 COSMETIC.
심각도는 finder가 매기고 verify가 교차 확인한다 — 과분류(everything BLOCKER)도 과소분류(실결함을 COSMETIC)도
피하도록, verify 프롬프트에 "이 결함이 배포되면 사용자/데이터/동작에 무엇이 잘못되나"를 한 줄로 답하게 한다.

---

## 절차

### 0. 사전 (경량)
1. 대상 식별: 인자의 PR/브랜치 → 없으면 `git rev-parse --abbrev-ref HEAD`의 열린 PR → 없으면 현재 브랜치.
2. base 확정: PR base(`gh pr view --json baseRefName`) 또는 `main`. **리뷰 대상 = `git diff <base>...HEAD`**.
3. 변경 표면 파악: `git diff --name-only <base>...HEAD`로 렌즈를 diff에 맞춘다(안 건드린 영역 렌즈 금지).
4. 워크플로 스크립트를 세션 tmp에 1회 작성(아래 템플릿, 렌즈만 커스터마이즈). HEAD 동적 참조라 라운드마다
   같은 scriptPath 재실행하면 되고 SHA 갱신이 필요 없다.

### 1. 라운드 (Workflow 1회 = find + verify)
- diff 표면별 **다중 렌즈 finder**(격리·high effort)가 `git diff <base>...HEAD`를 직접 읽어 결함을 낸다.
- 각 finding을 **독립 적대 verify**(medium effort, refute-first)로 검증 → REFUTED 탈락.
- `file:line`로 dedup, 심각도(BLOCKER/COSMETIC)로 분류.
- 반환: `{ blockers: [...], cosmetics: [...] }`.

### 2. 메인 처리 (라운드마다)
- **BLOCKER**: accept/reject 판정 → 수정(버그는 **먼저 실패 테스트로 결함 입증 후** 고침) → `gate` green →
  head 브랜치에 커밋. 여러 개면 한 커밋으로 묶어도 됨.
- **COSMETIC**: **이번엔 고치지 않는다.** `seen` 집합에 누적만(중복 방지). 루프를 늘리지 않는다.
- `round_clean = (이번 라운드 신규 BLOCKER 0)`. COSMETIC만 있으면 그 라운드는 clean으로 친다.

### 3. loop-until-dry
- `round_clean`이 **연속 2회**면 수렴. 아니면 다음 라운드(같은 scriptPath 재실행, 수정된 HEAD를 리뷰).
- 조기종료 금지. 컨텍스트 한계면 완료라 거짓말하지 말고 어디까지 왔는지 보고 후 재개 안내.

### 4. 수렴 후 — COSMETIC 배치 정리 (1회)
- 누적된 COSMETIC을 **한 번의 배치 커밋**으로 정리한다(주석·문서·네이밍 일괄). 이렇게 "나중에 다시 볼 때"
  깨끗하되, 루프 중엔 한 번도 이걸로 라운드가 늘지 않는다.
- COSMETIC이 많고 사용자가 원하면 배치 커밋 대신 `notes.md`/후속 이슈로 남기는 것도 허용(사용자 확인).
- 배치 후 `gate` 재확인 green.

### 5. push·보고
- head 브랜치 push(fast-forward·force 금지). 원격 없으면 로컬 커밋만 보고.
- §출력 계약대로 보고.

---

## Workflow 스크립트 템플릿

`scripts/self-review.template.js`를 세션 tmp로 복사하고 **LENSES만 이번 diff 표면에 맞게** 바꾼 뒤
`Workflow({scriptPath})`로 라운드마다 재실행한다. 스크립트는 `{ blockers, cosmetics, round_clean }`를 낸다.
템플릿 전문·주석은 [scripts/self-review.template.js](scripts/self-review.template.js) 참고.

렌즈 예시(프로젝트·diff에 맞춰 3~5개): `correctness-core`(핵심 로직·엣지·fail-soft) · `contract-data`(계약·
스키마·집계·저장) · `regression-consistency`(전 경로 정합·다른 모듈 무영향·잔재 없음) · `ui-i18n`(표시·키
패리티·접근성) · `tests`(수용기준 커버·동어반복/skip 없음·위험경로 가드). 순수 표시 PR이면 correctness+ui+tests만.

---

## 토큰 효율 (이 스킬의 필수 규율)

- **격리 위임(O1).** finder/verify가 diff를 자기 컨텍스트에서 읽는다 — 멀티라운드 내내 살아야 하는 메인
  루프 컨텍스트에 파일 덤프를 쌓지 않는다.
- **HEAD 동적(O2).** `git diff <base>...HEAD`라 라운드마다 같은 scriptPath 재실행, SHA 갱신·재작성 없음.
- **effort 배분(O3).** finder `high`(recall), verify `medium`(precision), 값싼 기계적 렌즈는 `low`.
- **표면 한정(O4).** 렌즈는 실제 변경 파일만 담당. 안 건드린 영역엔 렌즈를 안 붙인다.
- **COSMETIC로 루프 안 늘림(O5).** 사소한 지적이 dry를 리셋하지 못하게 해 **라운드 수 자체를 최소화**한다
  (사용자 지시의 핵심 효율 레버). 배치는 수렴 후 딱 1회.
- **dedup·요약(O6).** file:line dedup, 검증 로그는 파일 캡처 후 grep/tail만. gate는 종료코드를 1차 게이트로.
- **명세 1회 로드(O7).** 이 SKILL.md·템플릿은 루프 시작 시 1회만.

---

## 출력 계약

수렴 시 보고에 최소 포함:
1. 리뷰 대상(PR/브랜치·base)·**몇 라운드** 돌았는지.
2. **BLOCKER**: 발견·수정 N(카테고리별)·반영 커밋 SHA. 각 결함의 한 줄 요지(특히 라이브에 어떤 영향이었는지).
3. **COSMETIC**: 누적 N·배치 커밋 SHA(또는 notes로 남긴 사유).
4. 실행한 `gate` 결과(green 여부·테스트 수).
5. **종료 근거 — "BLOCKER 연속 클린 2회 도달"**(watch timeout·1회 클린은 종료 근거 아님).

background 세션이면 `result:` 라인 맨 앞에 스킬 단계 표시를 붙이고, 한 줄로 자립적으로 쓴다.

## 실패 모드
- **나쁨:** 주석 오탈자·문서 정합 하나에 dry를 리셋해 루프가 끝없이 늘어짐 / everything BLOCKER.
  **좋음:** 심각도 게이팅 — 라이브 결함만 dry 리셋, 사소한 건 수렴 후 배치 1회.
- **나쁨:** 실 결함(지수표기 누출·표시 정밀도·0 나눗셈)을 COSMETIC으로 과소분류해 흘려보냄.
  **좋음:** 애매하면 BLOCKER, verify가 "배포 시 무엇이 잘못되나"로 교차 확인.
- **나쁨:** 1회 클린으로 종료(조기종료) / watch timeout을 완료로 오인.
  **좋음:** BLOCKER 연속 2회 클린만 종료. 컨텍스트 한계는 checkpoint 후 재개.
- **나쁨:** 리뷰까지 메인이 파일을 다 읽어 컨텍스트·토큰 폭증.
  **좋음:** find/verify 격리 위임, 메인은 판정·수정·gate·commit만.
