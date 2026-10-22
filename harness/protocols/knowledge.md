# Knowledge 프로토콜

소비 프로젝트가 **코드만 봐서는 알 수 없는 레포 고유 지식**을 `docs/knowledge/`에 쌓고, 코드를
고치기 전에 **관련된 것만** 꺼내 보는 절차의 정본이다. 두 종류를 둔다.

- **Gotcha (G)**: 실제로 한 번 당한 함정. "이렇게 하면 깨진다/이렇게 해야 한다"는 규칙 + 왜.
- **Invariant (INV)**: 승인된 PRD/ADR/bugfix에서 나온, 작업자가 지켜야 할 규범. 근거는 출처 문서가 지닌다.

소급 도입(이미 하네스로 많이 진행한 프로젝트)은 `knowledge-bootstrap.md`가 정본이다.

## 레이아웃과 활성화

```
docs/knowledge/
  index.md            # 활성화 마커. lph-knowledge: 1 · knowledge_schema: 1 · bootstrap: not-needed|complete
  _tombstones.md      # 비활성 ID 표 | ID | 상태 | 대체 | 사유 |  (상태: 통합|폐기|대체)
  bootstrap.md        # 소급 부트스트랩 원장 (있을 때만)
  gotchas/<파일>.md    # frontmatter area: <영역>  (파일명 = 영역의 섹션 파일명, 공통 = _common.md)
  invariants/<파일>.md
```

- **활성화 = `docs/knowledge/index.md`의 `lph-knowledge: 1`.** 마커가 없으면 지식 게이트는 전부
  건너뛴다. 버전만 올려서 `harness:check`가 깨지는 일은 없다.
- 다른 형식의 기존 파일(예: 프로젝트 자체 gotchas 문서)은 건드리지 않는다. 흡수하고 싶으면
  부트스트랩의 시드 소스로 쓴다.
- **마커가 없는 프로젝트**에서 `--unit`/`--feedback`은 지식 파일을 만들지 않는다. 남길 후보가 있으면 단위
  `notes.md`의 `## 지식 후보`에만 적는다(make-pr의 지식 등록 절은 마커가 없으면 통째로 건너뛴다).
- 이력이 적은 프로젝트는 `seed`로 빈 마커만 만들고(`bootstrap: not-needed`), 이력이 많으면
  부트스트랩으로 간다. `lph-doctor`가 어느 쪽인지 안내한다.

## 어디에 넣나 (G vs INV)

| 질문 | G | INV |
|---|---|---|
| 무엇인가 | 겪은 일에서 나온 "하지 마라/이렇게 해라" | 승인된 결정이 낳은 "이 규범을 지켜라" |
| 출처 | PR·커밋·raw 문서 등 어떤 것이든 | **최소 1개는 final 상태의 raw PRD/ADR/bugfix** (PR·커밋만으로는 불가) |
| 근거 서술 | `왜:`에 실제로 생긴 일 | 쓰지 않는다 — 출처 문서가 근거다. `위반 시:` 한 줄만 |
| 확인 안 된 것 | 제목 끝 ` (미확인)` / `왜:`에 `(추정)` | 출처가 final이면 `(미확인)` 불필요 |

둘 다 **코드가 가리키는 앵커**(`코드:`)를 가진다. 앵커가 없으면 `없음(사유)`를 쓴다.

## 넣지 않는 것 (라우팅 표)

등록 전에 먼저 걸러낸다. 아래에 해당하면 G/INV로 만들지 않는다.

| 대상 | 보낼 곳 |
|---|---|
| 고치면 사라지는 결함 | bugfix 단위 (원인·회귀 방지는 bugfix.md에) |
| 어느 레포에나 통하는 범용 리뷰 지적 | `→guideline` 판정만 남긴다 (코드 리뷰 가이드라인 코퍼스의 입력). G로 복제 금지 |
| lint·tsc·테스트가 이미 막는 것 | 적지 않는다 |
| 결정의 이유 | ADR |
| 현재 구조 설명 | wiki (area 계보) |
| 명령·환경·빌드 방법 | AGENTS.md |

판단 기준: "이 프로젝트의 코드를 처음 보는 작업자가 **놓칠 만하고**, **놓치면 실제로 깨지며**,
**다른 도구가 대신 잡아주지 않는가**"를 모두 만족해야 G다.

## 항목 스키마

Gotcha:

```markdown
### G-261022-retry-idempotency: {명령형 규칙 한 문장}
> 발견: 2026-10-22 · 유형: 규칙부재 · area: 결제 · 출처: docs/raw/bugfix/pay-dup/bugfix.md, PR#123, `abc1234` · 코드: `src/pay/retry.ts`, `src/pay/api.ts:submit`

**규칙:** 해야 할 것 / 하면 안 되는 것

**왜:** 실제로 생긴 일 (근거가 추정이면 "(추정)")
```

Invariant:

```markdown
### INV-261022-pay-retry-once: {작업자가 지킬 규범 한 문장}
> area: 결제 · 출처: docs/raw/feature/pay-retry/adr.md#결정-2 · 코드: `src/pay/retry.ts:scheduleRetry` · 봉인: `src/pay/retry.test.ts` | 없음

**위반 시:** 무엇이 깨지는가 (한 줄)
```

- 헤딩: `### (G|INV)-YYMMDD-slug: 제목` — slug는 소문자 ascii kebab, 32자 이하. 날짜 6자리는 **등록일**이다.
- 제목 끝에 ` (미확인)`을 붙일 수 있다(코드/사람으로 확인 안 됨). 확인되면 뗀다.
- 메타는 헤딩 바로 뒤 첫 비어있지 않은 줄, `> `로 시작, 필드는 ` · `로 구분한다.
  - G 필수: `발견`(YYYY-MM-DD) · `유형`(규칙부재|규칙불충분|잘못된추론|외부제약) · `area` · `출처` · `코드`
  - INV 필수: `area` · `출처` · `코드` · `봉인`
- `area`는 콤마로 여러 개 가능하며 **첫 area가 파일의 area**다. 프로젝트의 raw 단위가 선언한 area여야
  하고(없으면 `_common`), 선언 안 된 area는 `scaffold`가 거부한다.
- `코드`: 콤마로 나눈 백틱 경로(`path` 또는 `path:symbol`) 또는 `없음(사유)`.
- `봉인`: 이 규범을 지키는 테스트의 백틱 경로(+선택 "이름") 또는 `없음`.
- 한 항목은 12줄 이내로 쓴다. 길어지면 규범을 쪼개거나 ADR로 보낸다.
- 본문에는 **활성 항목만** 둔다. 비활성은 `_tombstones.md`로 옮긴다(`retire`).
- raw 본문(prd/adr/bugfix)에는 G·INV ID를 쓰지 않는다. raw → 지식 연결은 `state.md`의 KNOWLEDGE 이벤트가 맡는다.

## ID 규칙

- ID = 등록일(YYMMDD) + slug. 전역에서 유일하다(활성+묘비 통틀어). 날짜가 들어가므로 연속번호나
  renumber가 없다.
- **절대 재번호하지 않고 지우지 않는다.** 폐기·통합·대체는 `retire`로 묘비 행을 남긴다.
  `harness:check`가 기존 ID가 사라진 것을 error로 막는다.
- 상태: `통합`(다른 항목에 합침, 대체 필수) · `대체`(새 항목이 이어받음, 대체 필수) · `폐기`(사유 필수).
  대체 사슬은 활성 ID 또는 폐기로 끝나야 하고 순환할 수 없다.
- AGENTS.md나 docs에서 ID를 인용해도 되지만 활성 또는 묘비에 있는 ID여야 한다(`refs`로 확인).

## 출처와 fragment 문법

출처(`출처:`)는 콤마로 여러 개 쓴다. raw 문서는 repo-relative로 `docs/raw/<type>/<slug>/(prd|adr|bugfix).md[#fragment]`.
`#fragment`는 아래 셋 중 하나다(엔진이 실재를 검사한다).

- `#결정-N` — ADR 본문에 `### 결정 N.` 헤딩이 있어야 한다. 새 ADR은 `## 결정` 아래를 이 형식으로 쓴다.
- `#d-N` — 번호 헤딩이 없는 옛 ADR: `## 결정` 섹션의 N번째 최상위 항목(`- ` 또는 `1. ` 시작 줄).
  기존 accepted ADR 본문은 불변이므로 옛 ADR은 이 앵커로 가리킨다.
- 그 밖 — 본문 헤딩의 slug(소문자화, 앞뒤 공백 제거, 글자·숫자·공백·`_`·`-` 외 제거, 공백→`-`).

출처 단위가 **final**이어야 INV 출처로 쓸 수 있다: feature는 prd `approved`(ADR 출처는 `accepted`),
bugfix는 `fixed`. 작성 중·사전 승인 단계 단위는 출처가 될 수 없다. 출처 ADR이 (부분) supersede되면
그 INV는 재판정 대상이다 — 새 ADR을 출처에 추가하거나 `retire`한다.

## 등록 시점

등록은 별도 작업이 아니라 흐름 안의 정해진 순간에 일어난다. 사람에게 매번 묻지 않는다.

1. **make-pr** — `approve --final` **직후** 단위를 기록한다.

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" record --unit docs/raw/<type>/<slug> --auto --via make-pr
   ```

   엔진이 `auto: none(auto) 기록`이라고 답하면 끝이다. 이미 이벤트가 있는 단위는 다시 판정하지 않고
   `already-recorded`를 낸다(make-pr 재시도·세션 재개에 안전). (chore이거나, notes `## 지식 후보`가 비어 있고
   accepted ADR도 bugfix도 아닌 경우). `needs-judgment`면 그 단위의 발췌(ADR `## 결정`, bugfix
   `## 원인`·`## 회귀 방지`, notes `## 지식 후보`)로 증류한다: 라우팅 표로 걸러 → `scaffold`로 골격 생성
   → 본문 채움 → `record --invariants <..> --gotchas <..>`(없으면 `none`). PR 본문에는 `## 지식 등록` 절에
   `brief --ids <신규 ID>` 출력을 그대로 넣는다(없으면 생략).
2. **리뷰 지적** (`--feedback`) — pr-codex-once/loop·pr-self-loop에서 **이 레포 고유**의 함정이
   드러났을 때. 범용 지적은 `→guideline` 판정이 맞다. `scaffold` → 채움 → 이벤트 append의 순서이며, 리뷰
   스킬에서는 **수정과 같은 gate·커밋에 들어가도록 gate 전에** 한다. 이벤트는 다음 형태다.

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" record --unit docs/raw/<type>/<slug> --gotchas <ID> --invariants none --via feedback
   ```

   `--unit`은 PR head 브랜치가 가리키는 단위(브랜치 `<type>/<slug>`)다. 대응 단위가 없거나 `state.md`가 없으면
   `record`는 건너뛰고 항목만 등록한다. PR이 이미 열려 있으면 푸시 뒤 PR 본문의 `## 지식 등록` 절을 갱신한다.
3. **one-shot** — 무인 구간에서 등록하는 G는 **제목에 `(미확인)`을 기본으로 붙인다(`scaffold --unconfirmed`).** 사람이 개입하는
   다음 단위에서 확인해 뗀다. `via=one-shot`.
4. **주기 정리** (`--consolidate`) — `pending`(final인데 KNOWLEDGE 이벤트가 없는 단위)이 쌓였거나 항목이
   비대해졌을 때. 단위별로 3단계 증류를 반복하고, 중복·낡은 항목은 `retire`로 정리한다. `via=consolidate`.
5. **doctor 넛지** — `pending >= 1`이면 `--consolidate`를 제안한다. session-start는 부트스트랩이 진행
   중일 때만 한 줄을 내고 pending은 세지 않는다(세션 시작 hot path). 넛지는 실행이 아니라 안내다.

`harness:check`는 final 단위에 KNOWLEDGE 이벤트가 없으면 **warning**으로 make-pr 단계를 상기시킨다.
이벤트 존재를 hard로 강제하지는 않는다(소유권은 엔진 자동 기록이 닫는다).

## 등록은 승인 게이트가 아니다

G/INV 등록은 사용자 승인 대상이 아니고 승인 상태를 바꾸지도 않는다. **근거 결정의 승인은 출처
PRD/ADR이 이미 담당한다.** 그래서 등록할 때마다 `AskUserQuestion`으로 묻지 않고, `approve.mjs`/`state.md`의
승인 줄을 건드리지 않는다(KNOWLEDGE 줄은 승인 이벤트가 아니다). 사람의 검토 지점은 PR diff와 PR 본문의
`## 지식 등록` 절이다.

## 조회 규칙

- 조회 명령은 `brief`다. **파일이 아니라 경로로** 묻는다.

  ```sh
  node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" brief --paths <파일…>
  ```

  순위는 코드 앵커 경로 정확일치 > 같은 디렉터리 > 상위 경로 공유, 동점은 최신순이다. 기본 12항목·약
  6000바이트 상한이며 넘치면 `+N건 생략`이 나온다. 전문이 필요하면 `show <ID>`.
  영역 단위는 `brief --area <영역>`, 특정 ID는 `brief --ids <ID,…>`.
- **흐름 안의 조회 지점**(정해진 곳은 아래 5곳):
  1. `feature-develop` 설계 브리핑 — 계획에 적힌 파일 경로.
  2. `pr-codex-once`/`pr-codex-loop`/`pr-self-loop` 지적 반영 직전 — 지적 대상 파일.
  3. `pr-self-loop` 격리 리뷰어 프롬프트 — diff 파일의 brief를 주입한다. 리뷰어가 `위반: INV-…`로 인용하면
     `refs`를 통과한 ID만 유효하다(환각 ID는 버린다).
  4. `make-pr` 진입 — diff 파일.
  5. `prd-helper`/`adr-helper` — 해당 area brief로 기존 불변식과 모순되는지 점검(넛지, 강제 아님).
- **전체 카탈로그를 통째로 읽지 않는다.** 무엇이 있는지 보려면 `status`(영역별 개수)로 충분하다.
- **서브에이전트에는 슬라이싱해서 준다.** 메인이 brief를 한 번 읽고, 각 서브태스크의 파일과 겹치는
  항목만 그 프롬프트에 붙인다. 서브에이전트가 직접 brief를 다시 부르게 하지 않는다.
- 흐름 밖의 상시 조회 두 가지: AGENTS.md 마커 블록의 "코드 수정 전 `brief --paths <파일…>`" 한 줄(init이
  upsert)과, `knowledge-distill`이 `--feedback`/`--consolidate`에서 중복을 피하려고 대상 경로로 먼저 보는 조회.
- 경로는 저장소 기준 상대경로가 기본이지만 절대경로도 받는다(저장소 밖 경로는 무시하고 알린다). 디렉터리
  경로와 디렉터리 앵커(`` `src/pay` ``)도 매칭된다.

## 크기 넛지

모두 warning이다(막지 않는다). 항목 12줄 초과, area당 활성 25개 초과, 파일 300줄 초과. 넘으면 make-pr 단계에서
한 줄로 알리고 `--consolidate`로 쪼개거나 `retire`한다. 코드 경로가 사라져 앵커가 끊기면 error이며,
`reanchor`가 git rename 이력으로 새 경로를 제안한다(`--apply`로 치환, 못 찾으면 retire 검토). 아직 커밋하지
않고 `git mv`로 스테이지만 한 이름 변경도 따라가므로, 이동과 같은 커밋에서 pre-commit이 K6로 막히면 그 자리에서
`reanchor --apply` 후 다시 커밋한다.

## CLI와 단계 대응

| 단계 | 명령 |
|---|---|
| 활성화 | `seed` (빈 마커 + 묘비), 소급은 `bootstrap ...` |
| 조회 | `brief --paths/--area/--ids`, `show <ID…>`, `refs <ID…>`, `status` |
| 등록 | `scaffold --kind G\|INV --area <a> --slug <s> [--title ".."] [--unconfirmed]` → 본문 채움 |
| 기록 | `record --unit <경로> (--auto \| --invariants <..> --gotchas <..>) --via <..>` |
| 검증 | `check` (지식 게이트 K1–K11만 실행; `harness:check`의 일부와 같은 구현) |
| 정리 | `retire --id <ID> --state 통합\|폐기\|대체 [--to <ID>] --reason ".."`, `reanchor [--apply]`, `pending` |

모든 호출은 소비 프로젝트 루트에서 `node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" <sub> ...`로 한다.
마커가 없고 부트스트랩도 아니면 조회 명령은 `(지식 계층 미활성 — /lph-doctor 참고)` 한 줄만 낸다.
