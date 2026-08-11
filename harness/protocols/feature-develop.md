# 기능 개발 프로토콜

**사전 승인된(pre-approved)** PRD/ADR 기반으로 기능을 설계, 구현, 검증까지 진행하는 공용
오케스트레이션 절차다. 최종 확정·커밋·PR은 이 프로토콜이 아니라 `$make-pr`가 담당한다.
절차와 게이트의 강도는 이 하네스가 유지하고, 도메인 특수성은 소비 프로젝트의 PRD/ADR과
`AGENTS.md`가 제공한다고 가정한다.

## 입력과 출력

```txt
입력: docs/raw/feature/<slug>/prd.md (status: pre-approved)
출력: 구현 완료 + wiki ingest + harness gate 통과 → $make-pr(최종 확정 + 커밋 + PR)
```

feature raw unit은 `prd.md`, `adr.md`, `notes.md`, `state.md`를 가진다. 승인은 2단계다:
**사전 승인**(PRD `pre-approved`/ADR `pre-accepted`)이 이 빌드 단계의 진입 게이트이고,
**최종 확정**(`approved`/`accepted`)은 `$make-pr`에서 PR 직전에 이뤄진다. 에이전트는 PRD/ADR
초안을 작성할 수 있지만, 사용자 명시 사전 승인 전에는 `pre-approved`/`pre-accepted`로 바꾸지
않는다. 전환은 오직 `harness:approve`로만 하며, 그 근거는 `state.md`의 승인 이벤트
(`PREAPPROVAL`)에 사용자 발화 verbatim으로 기록된다. 구현은 `state.md`에 사전 승인이 기록된
이후에만 시작한다.

## 역할

| 역할 | 책임 |
| --- | --- |
| `architect` | PRD 분석, ADR 작성, 구현 계획, 인터페이스 경계 정의 |
| `domain-engineer` | 앱 핵심 상태, 명령, 규칙, 데이터 계약, 비즈니스 로직 구현 |
| `ui-engineer` | 사용자-facing 화면, 상호작용, 반응형 UI, 접근성 구현 |
| `test-engineer` | 도메인/통합/UI 검증 전략과 테스트 구현 |
| `integrator` | raw/wiki 검증, gate 실행, 커밋 프로토콜 |

## Phase 0: 사전 승인 게이트 (하드 차단)

구현 앞에 반드시 통과해야 하는 게이트다. 이 게이트를 건너뛰고 구현으로 넘어가지 않는다.
여기서 요구하는 것은 **사전 승인**(pre-approved)이지 최종 승인이 아니다 — 최종 확정은
`$make-pr`에서 한다.

1. 현재 branch와 raw path를 확인한다.
2. **`state.md`를 먼저 읽는다.** `stage`와 `## 승인 이벤트`가 단일 진실원이다(채팅
   히스토리로 승인 여부를 판단하지 않는다).
3. `docs/raw/feature/<slug>/prd.md`와 `adr.md`를 읽고 status와 `approval:` 근거를 확인한다.
4. `npm run harness:check`를 실행해 승인 정합성(승인 이벤트 backing, state↔status)을 확인한다.
5. **차단 조건:** 아래 중 하나라도 참이면 구현하지 않는다.
   - PRD가 `pre-approved`(또는 이미 `approved`)가 아니다.
   - `state.md`에 PRD 사전 승인 이벤트(`PREAPPROVAL`)가 없다(사용자 발화 verbatim 미기록).
   - ADR 결정이 필요한데 ADR이 `pre-accepted`(또는 이미 `accepted`)가 아니다.

   이 경우 `$prd-helper`/`$adr-helper`로 되돌아가 사용자의 명시 사전 승인을 구조화 질문으로
   받고, 전환은 오직 `harness:approve`로 한다. **에이전트가 스스로 승인을 만들거나
   상태를 전환하지 않는다.**
6. 게이트를 통과했으면 `state.md`의 `stage`를 `implementing`으로 갱신한다.
7. 사용자 요청이 신규 구현, 재작업, 부분 수정, PRD 보강 중 무엇인지 분류한다.
8. 계획 게이트 필요 여부와 실행 레일(기본 role 체인 또는 설치된 가속기)을 한 줄로 보고한다.

| 조건 | 실행 모드 | 동작 |
| --- | --- | --- |
| 구현 전 PRD/ADR만 있음 | 초기 실행 | Phase 1부터 진행 |
| 구현이 일부 있음 + 같은 PRD | 개선 실행 | 변경 범위만 재계획 |
| 특정 모듈만 수정 | 부분 실행 | 해당 role 중심으로 진행 |
| ADR 결정이 바뀜 | 새 결정 | 기존 ADR superseded 또는 새 ADR 작성 |

## Phase 0.6: 빌드 중 PRD/ADR 개정 (사전 승인의 핵심)

사전 승인은 **잠정**이다. 구현된 결과물을 보고 사용자가 요구를 추가·변경하는 일은 자연스럽고,
그걸 위해 `pre-approved`/`pre-accepted` 상태를 둔다. 빌드 중 PRD/ADR을 고칠 수 있되 규율이 있다:

- **사용자 확인이 전제다.** feature-develop 피드백으로 PRD/ADR을 바꿔야 하면, 먼저 현재 런타임의
  구조화 질문 도구(ClaudeCode는 `AskUserQuestion`)로 **무엇을 어떻게 개정할지 요지와 함께 개정
  여부를 확인**받는다. 확인 없이 사전 승인된 문서의 요구·결정을 임의로 바꾸지 않는다.
- **개정은 본문 편집이다.** 확인받았으면 `prd.md`/`adr.md` 본문을 고친다. status는 `pre-approved`/
  `pre-accepted` 그대로 둔다(승인 축을 다시 만지지 않는다 — `harness:approve`를 개정마다 재실행하지
  않는다). 런타임 가드는 사전 승인된 문서의 **본문 편집을 막지 않는다**(status 플립만 막는다).
- **개정을 기록한다.** `state.md`의 `## 단계 로그`에 "무엇을 왜 바꿨는지 + 사용자가 개정을
  확인했다"를 한 줄로 남긴다. 이게 잠정 승인 아래 개정을 정식 절차로 만드는 지점이다.
- **최종 확정은 `$make-pr`가 한다.** 개정이 쌓인 최종 PRD/ADR을 PR 직전에 `$make-pr`가 **통보**
  하고, make-pr 호출을 근거로 `approved`/`accepted`로 확정한다(되묻지 않는다 — 단, 개정이 사전
  승인된 요구·결정을 뒤집는 수준이면 확정 전 정지해 확인받는다). 그래서 중간 개정은 가볍게 간다.

ADR 결정 자체가 바뀌는 경우(단순 문구 개정이 아니라 다른 구조를 택함)는 개정이 아니라 **새 결정**
이다 — 위 표의 "ADR 결정이 바뀜"을 따라 새 ADR을 작성하거나 기존을 superseded 처리한다.

## Phase 0.5: 실행 레일 선택

레일 분류 기준은 아래 operational 정의를 따른다. **위임은 기본값이 아니라 크기가 정당화할 때만
쓰는 가속기다**(토큰은 유한하다 — `session-start.md` "위임 비용" 참조). 명백히 작으면 메인이
직접, 명백히 크면 레일을 편다. **레일 선택이 모호하면(작게 갈지 fan-out 할지 경계선) 사용자에게
구조화 질문으로 확인한다** — 아끼려다 필요한 분업을 놓치는 것도 실패다.

- 다중 모듈 / 구조 변경: `src/`(또는 동등 최상위 소스 디렉터리) 2개 이상을 건드리거나,
  export된 인터페이스·데이터 계약·영속 포맷을 바꾼다.
- 작은 국소 수정: 한 파일 안의 오타, 링크, 주석, 문서 문장 수준 변경.

| 조건 | 레일 |
| --- | --- |
| 구조, 데이터, engine, dependency, 다중 모듈 변경 | 계획 게이트 필수 |
| 승인된 branch-sized 구현 | role 체인 기본 |
| 오타, 링크, 한 파일의 작은 문서 수정 | solo execute 허용 |

여러 역할의 병렬 분업이 이득인 변경(구조/데이터/경계·다중 모듈)만 `architect →
domain-engineer/ui-engineer/test-engineer → integrator` role 체인으로 펼친다. 단일
관심사(한 모듈·국소 로직·작은 수정)는 메인이 직접 하거나 1~2 역할로 좁힌다. 계획 게이트가
필요한 변경은 `architect` role로 계획과 합의를 먼저 확정하고, 그 결과를 기준으로만 구현한다.

`$ralplan`/`$ralph`가 설치돼 있으면 각각 계획 게이트와 구현 레일의 가속기로 쓸 수
있다(선택). 설치돼 있지 않아도 위 role 체인으로 동일하게 진행하며, 둘의 부재를
이유로 구현을 멈추지 않는다.

하네스 플러그인 업데이트나 adapter 정리는 이 PRD/ADR 기반 기능 개발 레일의
대상이 아니다. 제품 기능 변경과 분리해 작은 프로젝트 운영 작업으로 처리한다.

## 실행 레인: 자율 fan-out과 인간 게이트 분리

구현·테스트·검증처럼 자율적으로 완결되는 작업은 한 번에 fan-out 해 병렬로 실행할 수
있다. **fan-out 할 때는 각 서브에이전트 프롬프트에 Phase 1 계획에서 뽑은 브리핑(관련 결정·수용
기준·건드릴 파일 경로·인터페이스 계약)을 주입한다** — 서브에이전트는 격리 컨텍스트라 브리핑을
안 주면 PRD/ADR·코드를 처음부터 재로드·재탐색해 토큰이 곱으로 는다. 이 자율 실행 구간 안에서는
사용자에게 묻거나 커밋하지 않는다. 전제조건 확인,
계획 합의, 사용자 제품 판단, 커밋 검토·실행 같은 인간 게이트는 오케스트레이터(상호작용
레인)가 맡고, 자율 구간은 결과만 돌려준다. 오케스트레이터는 그 결과로
`npm run harness:gate`를 판정한 뒤에만 커밋 단계로 넘어간다.

자율 실행을 어떤 수단으로 병렬화할지는 도구별 어댑터가 정의한다. 수단과 무관하게 위
분리 원칙(자율 구간 안에서 인간 게이트·커밋 금지)은 동일하게 적용된다.

사용자의 제품 판단이나 승인처럼 질문이 필요한 순간에는 현재 런타임의 구조화 질문
도구를 우선 사용한다. 현재 surface가 실제로 지원할 때만 OMX 구조화 질문 surface를
가속기로 쓰고, 구조화 질문 도구가 없을 때만 간결한 plain-text 질문으로 fallback한다.

## Phase 1: 설계

담당: `architect`

1. feature PRD/ADR을 읽는다(`AGENTS.md`·`docs/wiki/index.md`는 이 컨텍스트에 아직 로드돼
   있지 않을 때만 — 어댑터 '필수 로딩'/`session-start`에서 이미 읽었으면 재판독하지 않는다).
2. 관련 raw unit과 현재 코드 구조를 조사한다.
3. ADR에 아래 결정을 제안으로 기록한다.
   - 채택한 구조
   - 선택지 최소 2개
   - 선택 근거
   - 검증
4. 구현 계획을 notes 또는 별도 계획 섹션에 남긴다. 이 계획이 Phase 2 위임의 **브리핑**이 된다 —
   각 역할은 이걸 받아 재탐색 없이 진행한다(코드 지도는 여기 한 번 남겨 공유한다).
   `guides/code-review-guideline.md`(구현 지침 단일 출처)의 표면 인덱스에서 이 작업이
   건드리는 섹션을 골라 해당 규칙을 브리핑에 발췌 포함한다 — 전체 로드 금지(로딩 규칙은
   그 문서 상단). 서브에이전트는 발췌를 받으므로 지침 파일을 다시 열지 않는다.
   - domain 작업
   - UI 작업
   - 테스트 작업
   - 파일 경계
   - 인터페이스 계약
   - 위험 요소

게이트:

- 이 시점에는 PRD가 이미 `pre-approved`, (ADR 결정이 필요하면) ADR이 `pre-accepted`여야 한다
  (Phase 0의 사전 승인 게이트를 이미 통과했다). **feature-develop은 여기서 사전 승인을 새로 받지
  않는다** — 사전 승인은 `$prd-helper`/`$adr-helper`의 몫이고, 최종 확정은 `$make-pr`의 몫이다.
  에이전트가 직접 frontmatter status를 고치거나 승인을 만들어내지 않는다(런타임 훅과
  `harness:check`가 막는다).
- ADR이 아직 `proposed` placeholder인데 이 유닛이 ADR 결정을 요구하면(빌드 중 뒤늦게 필요해진
  경우 포함) 구현으로 넘어가지 않고 `$adr-helper`로 되돌린다 — 거기서 ADR을 작성하고 `pre-accepted`
  까지 사전 승인받은 뒤 돌아온다.
- 전제(사전 승인)가 미충족이면 구현하지 않고 `$prd-helper`/`$adr-helper`로 되돌린다. "이렇게 하려고
  했어" 같은 의도·아이디어 발화는 사전 승인이 아니다. 모호하면 사전 승인이 아니다.
- 사용자의 제품 판단이 필요한 질문은 숨기지 않고 보고하며, 현재 런타임의 구조화
  질문 도구를 우선 사용한다.

## Phase 2: 구현

담당: `domain-engineer`, `ui-engineer`

구현은 브리핑에 발췌된 구현 지침(`guides/code-review-guideline.md`) 규칙을 대조하며
진행한다 — 지침의 §0 코어 원칙(스펙 동기화·단일 출처·경계 불신·왕복 완성)은 발췌와
무관하게 항상 적용된다.

domain 작업:

- UI framework 의존을 최소화하고 테스트 가능한 핵심 로직으로 작성한다.
- 명령, 이벤트, 상태 변경, 외부 효과, 표시용 상태를 분리한다.
- 확장 규칙은 한 곳의 조건문에 누적하지 않고 명시적인 정책/전략/핸들러로 모델링한다.

UI 작업:

- UI는 domain/application state를 렌더링한다.
- 사용자 입력, 상태 표시, 결과 공유 같은 표면은 domain-specific rule 계산과 분리한다.
- 모바일/데스크톱에서 텍스트와 컨트롤이 겹치지 않아야 한다.

## Phase 3: 테스트

담당: `test-engineer`

- 핵심 로직은 단위 테스트를 우선한다.
- UI 변경은 렌더링/상호작용 테스트 또는 명시적 브라우저 검증을 남긴다.
- 구현 지침에서 선택된 섹션의 검증 항목(극단 케이스: 최장 입력·최소 뷰포트·타 로케일·
  직접 URL 진입·복원 왕복 등)을 테스트 관점에 반영한다.
- 테스트가 아직 없는 영역이면 최소 smoke coverage를 추가하거나, 못 하는 이유를
  notes에 남긴다.
- ADR이 있으면 거기 기록한 결정이 실제 구현에 반영됐는지(결정↔구현 정합성)
  확인한다. 불일치는 담당 role에 돌려준다.

## Phase 3.7: 자체 코드리뷰 (code-review-guideline 렌즈로 1회)

담당: 작성 lane과 분리된 리뷰어 패스

구현·테스트가 끝나면 `$make-pr`로 넘기기 전에 **구현 diff를 `guides/code-review-guideline.md`의
탐지 렌즈로 한 번 자체 리뷰한다.** 이건 `$pr-self-loop`(PR 단계의 전체 loop-until-dry)의 경량
**1회판**이며, 자기 작성물을 같은 컨텍스트에서 self-approve하지 않도록 **작성과 분리된 리뷰어
패스**로 돈다(격리 서브에이전트 권장 — 없으면 최소한 작성과 다른 리뷰 관점으로).

1. diff 표면을 파악한다: `git diff <base>...HEAD --name-only`.
2. `code-review-guideline.md`의 표면 인덱스에서 이 diff가 건드리는 섹션만 골라(전체 로드 금지)
   "이런 diff를 보면 → 이 결함을 의심·확인하라" 탐지기로 diff를 훑는다. 렌즈↔섹션은 그 문서
   부록 A를 따른다. Phase 1 브리핑에 이미 발췌된 섹션이 있으면 재로드하지 않는다.
3. 발견을 심각도로 분류한다: **BLOCKER**(라이브 운영·사용자·데이터에 실제 영향)는 이 단계에서
   고치고, **COSMETIC**(주석·문서 정합·내부 네이밍)은 놓치지 않되 배치로 모아 마지막에 정리한다
   (`$pr-self-loop` 심각도 정책과 동일 축 — 사소한 걸로 흐름을 늘리지 않는다).
4. BLOCKER를 고쳤으면(버그는 실패 테스트로 결함 입증 후 수정) `harness:gate`를 다시 green으로 만든다.

이 패스는 **1회**다(전체 반복 루프가 아니다). PR 단계에서 Codex 자동 리뷰 또는 `$pr-self-loop`가
더 깊은 반복 리뷰를 맡는다 — feature-develop 자체 검증은 명백한 결함을 make-pr 전에 걸러 내고
self-review 품질을 Codex 수준으로 끌어올리는 것이 목적이다.

## Phase 4: 통합

담당: `integrator`

```sh
npm run harness:ingest -- docs/raw/feature/<slug>
npm run harness:gate
```

이 `harness:ingest`는 wiki lineage의 **둘째 touch**다(멱등 — `$prd-helper`의 첫 링크를
중복 없이 재확인). 구현·결정이 확정된 지금 계보를 **큐레이션**한다: 이 결정이 같은 area의
이전 결정을 대체하면 이전 줄에 `_(superseded by …)_`, 이 줄에 `_(현재)_`를 단다
(`wiki-ingest.md` "실행 시점", `adr-helper.md` 참고).

구현·검증·ingest가 끝나고 사용자가 결과에 만족하면 **여기서 최종 확정·커밋하지 않고
`$make-pr`로 넘어간다.** `$make-pr`가 PRD/ADR 최종 확정(`pre-approved`→`approved`,
`pre-accepted`→`accepted`), 명시적 stage, Lore commit, PR 생성을 한 흐름으로 담당한다. 빌드
중 만든 중간 구현 커밋은 자기 브랜치에 둘 수 있지만, PRD/ADR을 `approved`로 올리는 확정 커밋은
`$make-pr`의 몫이다.

## 실패 모드

- **나쁨:** ADR placeholder를 둔 채 구현한다.
- **좋음:** data contract, state model, engine boundary 같은 결정을 ADR에 남긴 뒤 구현한다.

- **나쁨:** 에이전트가 ADR을 작성한 뒤 곧바로 `pre-accepted`/`accepted`로 바꾼다.
- **좋음:** ADR은 `proposed`로 남기고, 사용자 명시 사전 승인 후 `harness:approve --adr`로 `pre-accepted`로 바꾼다(최종 `accepted`는 `$make-pr`).

- **나쁨:** `pre-approved`인 PRD를 빌드 중 PR 없이 스스로 `approved`로 확정하거나, 사용자 확인 없이 요구를 바꿔 버린다.
- **좋음:** 개정은 사용자 확인 후 본문만 고쳐 `pre-approved`로 두고 단계 로그에 남기며, 최종 `approved` 확정은 `$make-pr`에서 받는다.

- **나쁨:** UI가 권한, 가격, 판정, 시뮬레이션 같은 핵심 규칙을 컴포넌트 안에서 직접 계산한다.
- **좋음:** UI는 domain/application result를 렌더링하고 판정은 핵심 로직에 둔다.

- **나쁨:** 새 규칙을 reducer나 component 조건문으로 계속 추가한다.
- **좋음:** 명시적인 rule definition, strategy, trigger/effect 같은 확장 지점으로 분리한다.

## 출력 형식

```md
## 설계 요약
- ADR 결정:
- 선택지/선택 근거:

## 구현 요약
- domain:
- UI:
- tests:

## 검증
- harness:
- lint/build/test:

## 남은 위험
- risk:
```
