# 하네스 CHANGELOG

이 하네스는 **Claude Code 플러그인**으로 배포된다. 엔진(`scripts/harness/*.mjs`)·스킬·커맨드·
에이전트·훅은 전부 플러그인 안에 있어 **마켓플레이스 업데이트만으로 자동 반영**된다:

1. `/plugin marketplace update llm-project-harness` — 플러그인을 최신 버전으로 갱신한다.

**대부분의 항목은 이걸로 끝이다(소비자 조치: 없음).** 예외는 둘뿐이다:

- **프로젝트 산출물 조치** — 항목이 각 프로젝트가 자기 산출물에 반영할 내용을 요구할 때만(예:
  위키 재작성, frontmatter 추가). 마켓플레이스 갱신과 무관하게 프로젝트가 손으로 반영한다.
- **배선 변경** — 항목이 소비 레포에 직접 커밋된 "배선"(git훅의 baked 경로·`.github/workflows/harness.yml`·
  `.harness.json`·`.claude/settings.json`)의 형태를 바꿀 때. 배선은 플러그인 업데이트로 자동으로 안 바뀌므로
  소비 레포 루트에서 `/lph-init`을 다시 실행한다(훅 재-baking·`.harness.json` version 갱신). 세션 시작 시
  플러그인이 배선이 뒤처졌음을 감지하면 재실행을 넛지하고, `/lph-doctor`가 버전 drift와 정합 조치를 진단한다.

플러그인 모델에는 옛 `.harness-sync` 정합화 원장이 없다 — 모든 소비 프로젝트가 같은 플러그인 버전을
참조하므로 갱신이 마켓플레이스로 일원화된다. 버전별 소비자 정합 조치는 `harness/reconcile.md`(버전 키)로
추적하고 `/lph-doctor`가 소비 레포의 마지막 정합 버전(`.harness.json` version)과 대조해 제시한다.

**작성 규칙**: 하네스의 공용 표면(`harness/`, `scripts/harness/`, `commands/`, `agents/`,
`skills/`, `hooks/`, `.claude-plugin/`)을 바꾸는 모든 커밋은 이 파일 맨 위에 `## <YYYY-MM-DD>
<slug>` 항목을 추가한다(newest-first). 각 항목은 **변경**과 **소비자 조치**를 적고, 조치가
없으면 "소비자 조치: 없음"으로 명시한다. 배선(git훅·CI 워크플로·`.harness.json`·settings) 형태를
바꾸는 항목은 소비자 조치에 "`/lph-init` 재실행"을 명시한다. **버전을 올리는 커밋**은 셋(`package.json`·
`.claude-plugin/plugin.json`·`.claude-plugin/marketplace.json`)의 version을 함께 올리고, `harness/reconcile.md`
맨 위에 그 버전 항목을 추가한다(조치 없으면 `- (없음)`; provider `harness:check`가 현재 버전 항목을 강제).

## 2026-08-22 v2.4.1 pr-review-loop-numeric-owner-repo-graphql

**변경 (pr-review-check-loop watch helper가 순수 숫자 소유자/저장소 이름에서 무한 poll-error에 빠지던 버그 수정)**

`skills/pr-review-check-loop/scripts/pr_review_watch.py`의 GraphQL 조회 두 곳
(`fetch_recent_reviews`, `fetch_unresolved_codex_threads`)이 `owner`/`repo`를 `gh api graphql -F`
(타입 추론 필드)로 넘기고 있었다. `gh`의 `-F`는 **값이 순수 숫자면 JSON 정수로 변환**하는데
(실증: `-F x=123` → `{"x":123}`), 쿼리 변수는 `$owner`/`$repo:String!`로 선언돼 있다. 그래서
소유자나 저장소 이름이 순수 숫자면(GitHub에서 합법 — `users/0`·`1`·`12`·`123`이 실제로 존재하고
저장소 이름은 `owner/123`처럼 얼마든지 숫자만으로 가능) GitHub가 `Could not coerce value 123 to
String`으로 거부한다.

- **연쇄 효과**: 이 에러가 `gh_json`에서 `RuntimeError`로 튀어 `fetch_watch_state`가 실패하고,
  watch 루프의 `try/except`가 매 폴마다 `poll-error`로 삼킨 뒤 continue한다. 리뷰 본문(무이슈
  판정의 핵심 소스)을 영영 못 읽어, Codex가 무이슈를 내도 감지 못 하고 전 예산을 poll-error로
  소진 → timeout → 재개를 무한 반복한다. 순수 숫자 소유자/저장소에서 루프가 사실상 종료 불능.
- **수정**: GraphQL 문자열 변수(`owner`/`repo`/`cursor`)는 `-f`(raw, 항상 문자열)로, 정수 변수
  (`$number`/`$count`:Int!)만 `-F`를 유지한다. REST 경로(`repos/{owner}/{repo}/…`)·`pr view
  --repo`는 문자열 보간이라 원래 안전했고, 결함은 이 두 GraphQL 조회의 `-F`가 유일했다.
- **검증**: read-only 대비 실증(`-F owner=123`/`-F repo=123` → coerce 에러, `-f` → 타입 통과) +
  두 helper 함수를 순수 숫자 소유자/저장소로 직접 호출해 타입 통과 확인 + provider 게이트 4종 green.

**소비자 조치**: 없음. helper는 플러그인 안에 있어 마켓플레이스 갱신만으로 자동 반영된다
(배선/산출물 조치 없음). (버전 키 조치는 `harness/reconcile.md` 2.4.1 참조.)

## 2026-08-15 v2.4.0 ci-pr-only-and-docs-scoped-gate

**변경 (CI 게이트를 PR-only로 개편 + 문서 전용 PR은 harness:check만 — GitHub Actions 분 절감)**

소비 프로젝트의 하네스 CI가 GitHub Actions 무료 한도를 빠르게 태우던 원인 세 갈래를 걷어낸다.
게이트 본체(승인 원장·정합·lint·build·test)의 커버리지 손실은 0이고, **낭비 실행만** 제거한다.

- **서버 push 게이트 제거(소비자 템플릿).** `/lph-init`이 심는 워크플로가 이제 `pull_request:
  branches: [main]`에서만 돈다. 옛 `push: branches: [main]` 트리거를 뺐다 — 코드 변경은 전부 PR을
  거쳐 PR 게이트가 full로 커버하므로, squash-merge가 main에 올라올 때마다 **이미 통과한 게이트를
  재실행하던 낭비**(형님이 지적한 "merge 후 한 번 더 도는 CI")가 사라진다. main 직접 push의
  승인·정합 검사는 로컬 pre-commit(`harness:check`)이 계속 막는다. (프로바이더 저장소 자신은
  main 직행 워크플로라 `push: [main]` 게이트를 유지한다 — 소비자와 별개.)
- **concurrency 취소.** 같은 PR의 이전 실행을 취소해(`cancel-in-progress`), 연속 커밋 시 무효화된
  중간 커밋의 게이트가 끝까지 도는 낭비를 막고 최신 커밋만 게이트한다.
- **setup-node cache:npm(lockfile 있을 때만).** 매 실행 npm 패키지 전량 재다운로드 대신 `~/.npm`
  캐시를 복원한다. `package-lock.json`이 있을 때만 켠다(없으면 setup-node 캐시 키 생성이 실패).
- **문서 전용 PR은 harness:check만(엔진 `action.yml` + 새 `ci-scope.mjs`).** PR이 도입한 변경이
  `docs/` 하위에만 있으면 의존성 설치·lint·build·test를 건너뛰고 `harness:check`만 돌린다. 단순
  `paths-ignore: docs/**`로 통째 스킵하지 않는 이유는, 그러면 branch↔raw·승인 원장 정합을 보는
  `harness:check`가 함께 누락되기 때문이다 — `harness:check`(외부 npm 의존성 없는 순수 node)는
  **항상** 돌리고, 코드가 안 바뀐 PR에서 결과가 달라질 수 없는 lint/build/test만 조건부로 뺀다.
  스코프 판정 근거가 없거나(비-PR 이벤트·base sha 미해결) 애매하면 언제나 full로 떨어진다(fail-safe).
  분기는 엔진에 감춰 소비자 워크플로는 `uses: …@main` 한 줄로 얇게 유지한다 — 소비자는 재설치
  없이 마켓플레이스 갱신만으로 이 로직을 받는다.
- **`/lph-init --refresh-workflow`.** 이미 플러그인 CI를 가진 소비 레포의 워크플로는 자동으로 안
  바뀐다(손수 넣은 job/matrix 보존). 이 플래그로 최신 PR-only 워크플로로 교체한다(먼저 `--dry-run`;
  기존은 `.bak` 백업). refresh 없이 재init하면 init이 구버전 CI(서버 push 게이트·concurrency 취소
  없음)를 감지해 refresh를 넛지한다.

**소비자 조치**: `/lph-init --refresh-workflow`를 소비 레포 루트에서 실행해 `.github/workflows/harness.yml`을
최신 PR-only 워크플로로 교체한다(먼저 `--dry-run`, 기존은 `.bak` 백업). 교체 전에도 문서 전용 PR
최적화는 마켓플레이스 갱신만으로 자동 반영되지만, 서버 push 게이트 제거·concurrency 취소는 refresh가
필요하다. (버전 키 조치는 `harness/reconcile.md` 2.4.0 참조.)

## 2026-08-14 v2.3.2 design-mockup-cp-edit-no-scaffold-reemit

**변경 (디자인 시안 HTML은 cp 복사 후 목업만 Edit — 스캐폴딩 재출력 제거)**

adr-helper 디자인 결정 레인이 비교 HTML(`design-options.html`)을 만들 때, 에이전트가 파일 전체를
`Write`로 다시 써 CSS·JS·패널 등 형식이 고정된 ~9KB 스캐폴딩을 매번 **출력 토큰으로 재생성**하던
낭비를 없앴다. 이제 템플릿을 `cp`로 목적지에 그대로 복사한 뒤 **채우기 구역만 `Edit`**한다
(`{제목}`·`data-label`·라디오 `value`·`.name`·`.mockup`). 목업(진짜 작업물)만 출력 토큰을 쓰므로
이 단계 출력 토큰이 대략 5~8배 줄어든다. 템플릿 파일 자체(스캐폴딩·계약)는 그대로다.

- **프로토콜/역할 강제.** `adr-helper.md` Phase 3.5 step 2와 `designer.md`(Constraints·
  Investigation_Protocol)를 "cp 복사 → 목업 구역만 Edit, 스캐폴딩 Write 재출력 금지"로 재작성했다.
- **템플릿 주석 각인 + stale 교정.** `design-options.html` 상단·fill-zone 주석에 cp+Edit 규약을
  명시하고, 실제 마크업과 어긋나던 주석(`value는 opt-a/opt-b 유지` → `value·data-label·.name을
  대안 이름으로 함께 일치`)을 바로잡았다.
- **어댑터 drift 정리.** `agents/designer.md`가 아직 "ASCII 와이어프레임으로 비교"라던 것을 HTML
  비교 파일(cp+Edit) 우선으로 맞췄다(ASCII는 순수 CLI fallback).

**소비자 조치: 없음** (마켓플레이스 갱신으로 자동 반영 — 배선/산출물 조치 없음).

## 2026-08-13 v2.3.1 markdown-link-for-local-paths

**변경 (사용자에게 로컬 경로·링크를 마크다운 링크+절대경로로 제시)**

사용자가 직접 열어야 하는 로컬 파일 경로(디자인 비교 HTML·화면 스크린샷 등)를 raw 경로로
나열하면 워크트리 격리·일부 터미널에서 하이픈 때문에 링크가 잘려 클릭해도 안 열리는 문제를
고쳤다. 이제 이런 경로는 마크다운 링크 문법 `[한국어 설명](절대경로)`으로, 절대경로로 제시한다
(마크다운 링크는 뷰어로 떠도 온전히 클릭돼 브라우저까지 이어진다).

- **공통 규약 단일 출처.** `session-start.md` "출력"에 "사용자에게 로컬 경로·링크를 제시하는
  규약" 소섹션을 신설했다 — 모든 세션이 참조하는 단일 출처. 커밋 본문의 `관련 문서:` 링크처럼
  기계가 파싱하는 자리에는 적용하지 않는다(사용자에게 화면으로 보여 주는 경로에 한함).
- **발동 지점 강제.** 디자인 비교 HTML을 제시하는 `adr-helper.md`(Phase 3.5)·`designer.md`
  (Investigation_Protocol·Output_Format), 화면 스크린샷을 제시하는 `ui-verification.md`가 각각
  raw 경로 대신 `[설명](절대경로)` 마크다운 링크로 주도록 명시했다.

**소비자 조치: 없음** (마켓플레이스 갱신으로 자동 반영 — 배선/산출물 조치 없음).

## 2026-08-11 v2.3.0 skill-fixes-lph-doctor-and-review-guideline

**변경 (플러그인 전환 후 스킬 동작 교정 배치 · v2.3.0)**

플러그인 전환 후 몇몇 스킬이 의도대로 안 돌던 문제를 묶어 고치고, 버전 정합 진단(`/lph-doctor`)과
코드리뷰 가이드라인을 신설했다.

- **kickoff 워크트리 리네이밍 생략 (작업 1·2).** kickoff은 항상 `EnterWorktree`로 격리하되, Claude
  Code가 만든 브랜치 `worktree-<type>+<slug>`(프리픽스 + `/`→`+`)를 canonical로 **되돌리지 않는다**
  (불필요 churn·ExitWorktree 정리를 깸). `parseWorkBranch`가 이 형태도 파싱해 raw 유닛으로 정합하므로
  branch↔raw 게이트가 그대로 통과한다. `EnterWorktree` 실패 시 원인을 사용자에게 보고하고 멈춘다 —
  `git worktree add`·`--checkout` 같은 우회 생성 금지(merge-and-clean의 ExitWorktree 정리를 위해).
- **`/lph-init` 리네이밍 + 마지막 정합 버전 기록 (작업 7).** `harness-init` 스킬/프로토콜을 `lph-init`으로
  리네이밍(엔진 파일은 그대로 `scripts/harness/init.mjs`). init은 완료 시 `.harness.json` version을 현재
  플러그인 버전으로 확정한다(= 이 프로젝트의 "마지막 정합 버전").
- **`/lph-doctor` 신설 (작업 6).** 소비 프로젝트의 마지막 정합 버전과 설치 플러그인 버전을 비교해
  fresh/behind/ahead/uninitialized를 진단하고, 버전 사이 소비자 조치(`harness/reconcile.md`)를 제시한다.
  정합된 적 없으면(`.harness.json` 없음) `/lph-init`을 안내한다. 엔진 `scripts/harness/doctor.mjs`, 버전-키
  원장 `harness/reconcile.md`, provider 게이트 `assertReconcileLedgerCurrent`.
- **adr-helper 디자인 결정 = 비교 HTML 파일 (작업 3).** 디자인 결정 레인이 ASCII 대신 자기완결 **비교
  HTML 파일**(`harness/templates/design/design-options.html`)을 `docs/raw/<type>/<slug>/`에 떨군다 —
  대안 나란히 비교·베이스 라디오 선택·수정요청 작성·"요약 생성→복사"로 루프를 닫는다. Claude 아티팩트
  아님. ASCII는 브라우저 없는 순수 CLI의 degenerate fallback.
- **prd/adr-helper의 deep-interview 진입 판단 강화 (작업 4).** Phase 1을 "강제 기본값"이 아니라
  **진입 판단**으로 재작성했다: 이번 작업의 범위·깊이와 kickoff에서 받은 사용자 컨텍스트만으로 이미
  명확한지(그대로 수용 기준으로 옮겨 통과/실패 판정 가능한지)를 가늠해 deep-interview 진입 여부를
  정한다 — 모호/큰 결정이면 실제 호출→crystallize→PRD/ADR 매핑(실행 브리지는 안 탐), 명확·좁으면 단발
  구조화 질문, 경계면 사용자에게 1줄 질의. 미설치 런타임은 구조화 질문 fallback.
- **wiki-ingest 큰 방향성 갱신 넛지 (작업 5).** 의미 있는 ingest 뒤 "이 작업이 프로젝트의 큰 방향성을
  바꿨다면 index.md의 `## 큰 방향성`도 갱신하라"를 한 줄 리마인드(의미 판단이라 게이트 강제 아님).
- **code-review-guideline.md 신설·최신화 (작업 8·9).** `implementation-guidelines.md`를 리네이밍하고, 두
  소비 레포 자동 리뷰 **391건(P1 57건)**을 재클러스터링해 "리뷰어가 diff에서 무엇을 잡아내야 하는가"의
  탐지 렌즈 + R1–R7 근본 실패 계층으로 정립했다. 코퍼스 high-water mark(pokequiz-hub #127, cross-wars #75)를
  기록해 다음 갱신 시 그 이후 PR만 확인한다. feature-develop에 자체 코드리뷰 Phase 3.7을 추가하고,
  pr-self-loop 렌즈가 이 가이드(부록 A 매핑)를 단일 출처로 삼도록 배선했다.

**소비자 조치**: **이미 이관한 소비 레포는 `/lph-init`을 다시 실행**한다(슬래시 진입점이 `/harness-init`
→ `/lph-init`으로 바뀌었고 `.harness.json` version을 2.3.0으로 올린다; 먼저 `--dry-run`). git훅 baked 경로·
CI·settings 형태 자체는 안 바뀌므로 게이트는 재실행 없이도 통과하나, 재실행 전까지 `/lph-doctor`가 drift로
표시한다. 그 외(adr HTML·deep-interview·wiki 넛지·code-review-guideline)는 마켓플레이스 갱신으로 자동 반영
(소비 산출물 조치 없음). 상세는 `harness/reconcile.md`의 `## 2.3.0`.

## 2026-08-10 pr-review-loop-initial-bare-trigger

**변경 (스킬 동작 — Codex 자동리뷰 비활성 설정 대응)**

Codex가 PR 생성 시 자동리뷰를 더 이상 붙이지 않는 설정에 맞춰 `pr-review-check-loop`을
고쳤다. 루프 **최초 진입에 처리할 리뷰가 없으면**, 먼저 **설명·요약 없는 bare `@codex review`
한 줄**을 달고 곧장 live-watch에 진입한다(빈 첫 조회를 clean으로 오판하지 않음).

- 최초 트리거(반영 전)는 **한 줄 `@codex review`만**, 재리뷰 트리거(코멘트 반영·푸시 후)만
  "반영 내용" 요약 불릿을 붙이도록 SKILL.md·protocol.md에서 분리했다. 최초 사이클은 답글
  대상이 없어 7.1(답글)을 건너뛴다.
- 옛 "PR 생성 자동리뷰" 가정을 **기본 경로에서 변형(§2.1b)으로 강등**했다 — 자동리뷰를 여전히
  쓰는 저장소가 있을 수 있어 `pr-body-auto-review` ack 경로와 helper 기능은 보존한다.
- `pr-review-check-once`는 어차피 리뷰 유무를 매번 확인하므로 손대지 않았다. helper
  (`pr_review_watch.py`)도 `acknowledged` 경로를 이미 지원해 변경 없음.

**소비자 조치**: 없음(마켓플레이스 업데이트로 자동 반영).

## 2026-08-10 skills-unprefixed-drop-duplicate-commands

**변경 (표면 정리 — 모든 스킬을 프리픽스 없이 호출 가능하게)**

같은 이름이 슬래시 커맨드와 스킬 양쪽에 등록되면 Claude Code가 스킬 호출에 플러그인
프리픽스를 강제한다(`/kickoff` → `/llm-project-harness:kickoff`). 이 충돌을 없애 **모든 스킬이
unprefixed로 호출**되게 했다.

- **중복 커맨드 3종 제거.** `commands/kickoff.md`·`commands/wiki-ingest.md`·`commands/harness-init.md`
  삭제. 이들은 대응 스킬(`skills/{kickoff,wiki-ingest,harness-init}`)이 `node …/*.mjs` 실행·옵션·
  워크트리 격리·이슈 분류까지 **완전히 포함**하던 순수 중복이었다. 슬래시 진입점은 그대로다 —
  `/kickoff`·`/wiki-ingest`·`/harness-init`은 이제 (커맨드가 아니라) 동명 스킬을 발동한다.
- **동명 커맨드↔스킬 금지 게이트 신설.** `artifact-check`(provider 모드)이 `commands/<name>.md`와
  `skills/<name>/`이 이름을 공유하면 실패한다. 스킬이 프리픽스 없이 유지되는 성질을 기계강제한다.
  슬래시 커맨드가 필요하면 스킬과 **다른 이름**을 쓴다(예: `artifact-check` 커맨드 ↔
  `artifact-validation` 스킬 — 이 쌍은 충돌하지 않으므로 유지).

**소비자 조치**: 없음(마켓플레이스 업데이트로 자동 반영, 배선 변경 아님). 슬래시 호출 방식은
그대로 동작한다.

## 2026-08-10 harness-init-migration-hardening

**변경 (실사용 이관 피드백 반영 — `/harness-init` 완결성·이식성)**

실제 소비 레포(pokequiz-hub)를 플러그인 모델로 이관하며 드러난, init이 손대지 않아 수동으로
메꿔야 했던 갭을 배치로 닫았다.

- **CI 노드 하드코딩 제거(A7).** `.github/workflows/harness.yml`이 `node-version: 20`을
  못박던 것을, 소비 레포에 `.nvmrc`가 있으면 `node-version-file: '.nvmrc'`, 없으면 최신
  LTS(`node-version: 'lts/*'`)로 바꿨다. 옛 20이 소비 프로젝트 런타임(예: node 22)보다
  낮아 정상 코드를 CI에서 오탐하던 실증 실패(신 ICU 전용 `Intl.NumberFormat` 옵션 →
  구 node `RangeError`)를 막는다.
- **lockfile 정합(A2).** devDependency를 `package.json`에서만 지우고 `package-lock.json`을
  두면 `npm ci`(action.yml이 lockfile 있으면 이걸 씀)가 즉시 실패하던 것을 고쳤다. 이관 시
  package-lock의 `llm-project-harness` 항목(v1/v2·v3 트리 모두)을 직접 제거하고,
  pnpm/yarn lock은 재생성을 경고로 안내한다.
- **죽은 스크립트 정리 확장(A1).** 옛 하네스 npm 스크립트 제거가 `.harness/scripts/`뿐
  아니라 `node_modules/llm-project-harness`(devDep 시대 마운트)를 가리키는 것도 잡는다.
- **잔존 참조 리포트(A4/A5·C2).** 이관 후 tracked 파일에 남은 옛 `.harness` 마운트/
  `harness:*` 스크립트 참조를 `file:line`으로 나열하는 "Residual references" 섹션을
  요약·`--report`·`--dry-run`에 추가했다. **`docs/raw/**`(append-only 불변 이력)는
  의도적으로 제외**한다. 자동 수정은 하지 않는다(라이브 문서·설정·스킬 지시는 문맥 판단 필요).
- **플래그 스키마 정리(A6).** `.harness.json`의 vestigial한 `areas`/`sections` 빈 배열을
  걷어냈다(신규 생성은 제외, 기존은 version bump 시 strip). area 계보는 wiki index의 `### `
  헤딩이 진실이라 게이트는 플래그의 그 배열을 읽지 않는다.
- **프로토콜 문서(B1/B2/B3·C1).** `harness-init.md`에 수동 후속 체크리스트, 불변 이력
  보존 규칙(`docs/raw/**` 편집 금지), git 훅 버전 결합 주의(bump 후 재-init), "로컬 전체
  게이트 실행법"(pre-commit 훅/`sh .git/hooks/pre-commit`/스킬/CI — `npm run` 진입점은
  의도적으로 없음)을 명문화했다.

**소비자 조치**: 신규 이관은 자동. **이미 이관한 소비 레포는 `/harness-init`을 다시 실행**한다
(배선 변경 — CI 노드 정책·`.harness.json` 스키마·lockfile 정합이 갱신되고, 재실행 시 잔존 참조
리포트가 남은 수동 후속을 짚어준다). 먼저 `--dry-run`으로 확인.

## 2026-08-08 harness-init-migration-completeness

**변경 (버그픽스 — 옛 설치 이관 완결성)**

`/harness-init`의 옛 devDependency/`.harness` 설치 이관이 두 잔재를 놓쳐 이관 후 CI/스크립트가
깨지던 것을 고쳤다.

- **옛 CI 워크플로 교체.** `.github/workflows/harness.yml`이 이미 있어도, `npm run harness:gate`나
  `.harness/scripts`를 참조하는 옛 하네스 워크플로면 composite action(`uses: rlatndud9090/llm-project-harness@…`)
  버전으로 교체한다(삭제된 `.harness` 마운트를 가리켜 CI가 깨지던 것). 하네스로 안 보이는 커스텀 워크플로는 보존·경고.
- **죽은 `harness:*` 스크립트 정리.** package.json에서 `.harness/scripts/…`를 가리키는 스크립트
  (`harness:check`/`harness:gate`/`harness:kickoff` 등)를 걷어낸다. 플러그인 모델에선 소비자가 하네스 npm
  스크립트를 두지 않는다(세션=플러그인 스킬, CI=composite action).

**소비자 조치**: 신규 이관은 자동. **2.1.1 이전에 이미 `/harness-init`으로 이관한 소비 레포**는 위 두 잔재가
남아 있을 수 있으니 `/harness-init`을 한 번 다시 실행한다(배선 변경).

## 2026-08-08 bundle-pr-workflow-skills

**변경**

PR/머지 워크플로 스킬 4종을 플러그인에 번들했다(개인 프로필에서 이관, 공유용으로 중립화):
`merge-and-clean`(PR squash 머지 + 워크트리/브랜치 정리 + base ff 최신화),
`pr-review-check-loop`·`pr-review-check-once`(Codex 자동 리뷰 수렴 감시·반영),
`pr-self-loop`(Codex 미가용 시 격리 리뷰어 셀프 루프). 계정 하드코딩·개인 호칭·`env -u
GITHUB_TOKEN` 우회를 제거하고, 파괴적 쓰기 전 gh 인증 계정·repo 호스트를 확인하는 일반
가드로 중립화했다(gh 우선 + `mcp__github__*` MCP 폴백, 안전 의도·fail-closed 게이트는 보존).
번들 helper는 `${CLAUDE_PLUGIN_ROOT}/skills/…`로 해석한다. 플러그인이 활성화된 곳이면
어디서나 `/llm-project-harness:merge-and-clean` 등으로 호출한다.

**소비자 조치**: 없음(마켓플레이스 업데이트로 자동 반영).

## 2026-08-08 claude-code-plugin-migration

**변경 (BREAKING — 배포 방식 전환)**

하네스 배포를 **npm devDependency + `.harness` 심볼릭 링크 → Claude Code 플러그인**으로 전환했다.
Codex/크로스 에이전트 지원은 **폐기**하고 Claude Code 전용이 됐다. 엔진(`scripts/harness/*.mjs`)과
스킬·커맨드·에이전트는 전부 플러그인(이 저장소) 안에만 있고, 소비 저장소에는 얇은 배선만 남는다.

- **플러그인 구조.** 컴포넌트가 저장소 루트로 올라왔다(`commands/`·`agents/`·`skills/`), 플러그인
  매니페스트(`.claude-plugin/plugin.json`·`marketplace.json`)·훅(`hooks/hooks.json`)·CI용 composite
  action(`action.yml`)을 신설했다. 엔진은 세션 안에서 `${CLAUDE_PLUGIN_ROOT}`로, CI에서는 composite
  action으로 호출된다.
- **제거.** `.codex/`, `attach-submodule.mjs`, `link.mjs`, `sync.mjs`, `submodule-attach` 스킬·
  프로토콜, `.harness-sync`/devDependency freshness 메커니즘을 전부 삭제했다.
- **소비 발자국.** 소비 저장소에는 `.harness.json`(루트 플래그+버전), `.claude/settings.json`(플러그인
  활성화), `.github/workflows/harness.yml`(CI 게이트), docs 스캐폴드만 남는다 — 엔진 사본도, `.harness`
  심볼릭 링크도, devDependency도 없다.

**소비자 조치 (필수)**

마켓플레이스에서 플러그인을 갱신하고 `/harness-init`을 실행한다. `/harness-init`이 옛
devDependency/`.harness` 설치를 **자동으로 이관**한다(레포마다 한 번): `.harness` 심볼릭 링크 제거,
`package.json`의 devDependency와 `link.mjs` postinstall 제거, `.harness-sync` 제거.

```text
# 신규 적용
/plugin marketplace add rlatndud9090/llm-project-harness
/harness-init

# 기존(devDependency/submodule) 설치 이관 — /harness-init이 자동 감지·정리(먼저 --dry-run 권장)
/harness-init --dry-run
/harness-init
```

git submodule로 붙어 있던 경우엔 이관 전에 서브모듈을 먼저 제거한다(상세는
`harness/protocols/harness-init.md`의 "옛 설치에서 이관").

## 2026-08-06 kickoff-worktree-first

**변경**

`$kickoff`을 "워크트리 우선"으로 재정의했다. 주 워킹트리(main-wt)를 개발자가 직접
작업·확인하는 자리로 **예약**하고, kickoff은 main-wt 상태(clean/dirty·어느 브랜치 위인지)와
무관하게 항상 origin/main을 베이스로 한 **전용 워크트리** 안에서 돈다.

- **`scripts/harness/kickoff.mjs`: base(main/master)에서의 자동 브랜치 전환을 제거.**
  이전에는 `main + clean`이면 그 자리(main-wt)에서 `git checkout -b`로 작업 브랜치를 만들어
  전환했다. 이제는 어떤 경우에도 main-wt를 자동 전환하지 않고, base에서 격리 없이 부르면
  "origin/main 기준 워크트리로 격리하라"는 힌트만 낸다. branch-first(이미 `<type>/<slug>`
  위), 목표 브랜치 존재 힌트, `--checkout`(현재 위치 강제 생성), `--no-branch`는 유지.
  `treeCleanForKickoff`(kickoff 산출물 제외 clean 판정)은 자동 전환과 함께 제거했다.
- **어댑터·프로토콜에 워크트리 격리 절차 명문화.** `harness/protocols/kickoff.md`의 "브랜치
  처리"를 워크트리-우선 모델로 재작성하고, `.claude`/`.codex` kickoff 어댑터와 `/kickoff`
  커맨드에 격리 순서를 추가했다(ClaudeCode: `EnterWorktree` 이름 `<type>/<slug>`; Codex:
  `git worktree add -b <type>/<slug> <path> origin/main`).
- **freshness/sync 문구를 devDependency 기준으로 정리.** freshness 로직은 이미 devDep 태그
  비교로 전환돼 있었고(핀 `#v1.2.3` vs 원격 최신 태그), 남아 있던 "submodule" 표현만
  `lib.mjs`·`artifact-check.mjs`·`sync.mjs`·`commit-protocol.md`에서 devDependency로 맞췄다.
  동작 변화는 없다.

**소비자 조치 (필수)**

- kickoff으로 작업을 시작할 때 **항상 origin/main 기준 전용 워크트리로 격리**한다(주 워킹트리
  main-wt는 건드리지 않는다). ClaudeCode는 `EnterWorktree`(이름 `<type>/<slug>`), Codex는
  `git worktree add -b <type>/<slug> <path> origin/main`. base에서 격리 없이 kickoff을 부르면
  이제 브랜치가 자동으로 생기지 않고 힌트만 나온다 — 워크트리로 격리하거나, 정말 현재
  위치(main-wt)에 파야 하면 `--checkout`을 쓴다.
- 문구 정리(submodule→devDependency)는 동작 변화가 없어 별도 조치가 필요 없다.

## 2026-08-05 devdependency-mount

**변경**

하네스 배포 방식을 **git submodule → npm devDependency**로 전환했다. `.harness`라는 마운트
이름과 그것을 가리키는 모든 참조(`.harness/harness/...`, `.harness/scripts/...`, 어댑터
symlink, package script)는 **그대로 유지**되고, `.harness`의 *실체*만 서브모듈에서 설치된
`node_modules/llm-project-harness` 패키지로의 **심볼릭 링크(Windows는 junction)** 로 바뀐다.

동기: 서브모듈이 소비 프로젝트의 git 워킹트리에 추적되는 소스라서 (1) CF·Vercel 등
배포 빌드가 `.harness`를 끌어오고, (2) `git worktree remove`가 서브모듈에 걸려 `--force`를
요구했다. devDependency는 `node_modules`(gitignore) 안에 있고 앱이 import하지 않으므로 배포
산출물에 안 남고, 서브모듈이 아니므로 워크트리 삭제도 걸리지 않는다. 하네스 레포는 PUBLIC
이라 `github:` git-dep이 HTTPS tarball로 무인증 설치된다(npm publish 불필요).

- **`.harness` = devDependency로의 심볼릭 링크(`lib.mjs` `ensureHarnessLink`, 신규
  `link.mjs`).** 소비 프로젝트 `postinstall`이 매 설치 후 `.harness` 링크를 재생성한다
  (`node node_modules/llm-project-harness/scripts/harness/link.mjs || true`). `|| true`와
  링크 스크립트의 never-throw 계약으로 프로덕션 `npm ci --omit=dev`(하네스 부재)에서도
  설치가 실패하지 않는다. `.harness`가 이미 실제 디렉터리(옛 서브모듈)면 절대 덮어쓰지 않고
  경고한다.
- **`attach-submodule.mjs`가 devDep 모델로 동작.** 실행 시 `.harness` 링크를 먼저 만들고,
  `.gitignore`에 `.harness`·`node_modules`를 추가하고, `postinstall`을 배선한다. 어댑터
  symlink·docs 스캐폴드·`.harness-sync` 시드·`.claude/settings.json`(bgIsolation) 로직은
  불변. package script는 여전히 `.harness/scripts/...`를 호출한다(링크로 해결).
- **`artifact-check`의 freshness nudge를 devDep 태그 비교로 재작성.** 서브모듈 커밋 대신
  package.json의 하네스 핀(`#v1.2.3`)을 원격 최신 태그와 비교해 뒤처지면 경고한다(warning-only,
  throttle·best-effort 불변). 어댑터 무결성 복구 안내도 `npm ci` + attach 재실행으로 갱신.
- 정합성 게이트(`.harness-sync` ↔ CHANGELOG head)와 승인 게이트는 그대로. `findHarnessRoot`는
  `.harness` → `node_modules/llm-project-harness` 순으로 하네스를 찾아 링크가 없어도 스크립트가
  동작한다.

**소비자 조치 (필수)**

기존 `.harness` 서브모듈 소비 프로젝트는 아래로 devDependency 모델로 이관한다. **레포마다
한 번**이며, 이 커밋 뒤 CF·Vercel 재배포는 서브모듈 없이 깨끗하게 빌드된다.

```sh
# 1) 서브모듈 완전 제거
git submodule deinit -f .harness
git rm -f .harness
rm -rf .git/modules/.harness            # git이 남기는 서브모듈 메타 청소

# 2) 하네스를 devDependency로 (PUBLIC 레포 → 무인증). 재현성 위해 태그/커밋으로 핀
npm i -D github:rlatndud9090/llm-project-harness#<태그 또는 커밋SHA>

# 3) attach 재실행 — .harness 링크 생성 + .gitignore 추가 + postinstall 배선 + 어댑터 재링크
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs

# 4) CI 워크플로에서 submodules: true 제거(있다면). npm ci가 postinstall로 .harness를 만든다

# 5) 이 CHANGELOG 항목 반영 확인 → 게이트 통과
npm run harness:sync -- --ack
npm run harness:gate

# 6) 커밋: 서브모듈 제거 + package.json(devDep·postinstall) + .gitignore + .harness-sync + 어댑터
git add -A && git commit
```

- 빌드 파이프라인이 하네스 스크립트를 직접 부르면(`prebuild`/`postinstall`에 `harness:*`)
  경로에 `.harness/`가 남았는지 확인한다 — `.harness` 링크로 그대로 해결되므로 대개 무변경.
- Windows는 junction이라 개발자 모드·`core.symlinks` 없이도 `.harness`가 만들어진다. 단
  어댑터 symlink는 종전처럼 `core.symlinks=true`가 필요하다(`submodule-attach.md` 참고).
- 하네스를 계속 서브모듈로 유지하려면 이 항목은 "서브모듈 제거 없이 그대로 두기"로
  간주하고 `--ack`만 해도 된다(구 모델도 당분간 동작). 단, 배포·워크트리 문제는 이관해야
  해소된다.

## 2026-08-04 make-pr-token-efficiency

**변경**

스킬별 토큰 사용량 1위였던 `make-pr`의 토큰 효율 패스. make-pr는 위임 없이 전 과정을 메인
컨텍스트에서 돌기 때문에(지침 로딩 ~23KB + gate 전체 출력 판정 + 커밋 + PR), 로딩·출력 양쪽을
줄였다. 기능·게이트 강도는 불변.

- **`harness:gate` 성공 출력 압축(`gate.mjs`)** — 성공한 스텝의 출력을 `[harness:gate] <step> ok`
  요약으로 줄이고(테스트 스텝은 `Tests …` 요약 라인과 no-tests WARNING만 표면화), **실패한 스텝은
  종전처럼 전문을 출력**한 뒤 status를 전파한다. 성공 로그는 판정에 기여하지 않으면서 게이트 1회당
  수 KB를 에이전트 컨텍스트로 흘려보내던 순수 노이즈였다. 전체 로그가 필요하면
  `HARNESS_GATE_VERBOSE=1`(또는 `--verbose`)로 강제한다. 이 압축은 gate를 쓰는 모든 스킬
  (`feature-develop`·`commit-protocol`·`make-pr`)에 공통 이득이다. 캡처 전환에 따르는 견고성도
  함께 잡았다: 실패 덤프가 `process.exit`의 stdio 미flush로 잘리지 않게 `process.exitCode` 자연
  종료로 바꾸고, maxBuffer 초과(ENOBUFS)를 "패키지 매니저 실행 실패"로 오진하지 않고 부분
  출력과 함께 구분 보고한다. 요약/전문/verbose/ENOBUFS 계약을 고정하는 회귀 테스트 6건 추가.
- **make-pr 재판독 조건부화(P1)** — 어댑터·정본이 `commit-protocol.md` 정본과 PRD/ADR **전문**을
  "이 컨텍스트에 아직 로드돼 있지 않을 때만" 읽도록 바꿨다(같은 세션에서 빌드까지 마치고 넘어온
  경우의 중복 재판독 제거). 승인 상태의 원장인 `state.md`는 계속 무조건 먼저 읽는다.
  flow-token-efficiency-pass-1과 같은 런타임 중립 문구라 격리 서브에이전트는 여전히 읽는다.
- **make-pr 어댑터 재진술 축약(P2)** — 정본을 읽는데도 어댑터가 절차를 통째로 재진술하던 산문을
  압축했다(`.claude`/`.codex` 대칭 편집, parity green). load-bearing(state.md 먼저·
  `harness:approve --transport make-pr --final` 명령·호출=최종승인·뒤집는 개정 정지·직접 status
  편집 금지·ingest→gate 순서·gh 우선 폴백·PR URL 보고·FleetView 제목 불변·`[pr]` result prefix)은
  전부 보존.

**소비자 조치 (필수)**

- 없음. gate 실패 시에는 종전처럼 전체 로그가 나오므로 디버깅 절차 변화 없음. CI 등에서 항상
  전체 로그를 원하면 `HARNESS_GATE_VERBOSE=1`을 설정한다.

## 2026-08-04 implementation-guidelines-guide

**변경**
- **구현 지침 단일 출처 신설: `harness/guides/implementation-guidelines.md`.** 두 소비
  프로젝트의 PR 76건을 조사해 그중 56건에 달린 자동 코드리뷰 인라인 지적 264건(P1 41건)
  을 전수 클러스터링(커버리지 264/264)하고, 리뷰 18사이클을 돈 PR의 수렴 교훈 문서를
  병합해 **구현 시점 예방 규칙**을 10개 표면(스펙·문서 동기화 / 단일 출처·파생 일관성 /
  경계 입력 검증 / 상태 기계·종결 / 영속화·복원·동시 쓰기 / 비동기·타이머 / 레이아웃·
  뷰포트·기하 / 접근성·포커스·IME / 데이터 파이프라인·캐시 / 게이트·릴리스·전환)으로
  문서화했다. 전체 로드는 금지 — §0 코어 원칙 + 표면 인덱스로 해당 섹션만 골라 브리핑에
  발췌하는 로딩 규칙을 문서 상단에 명시했다. 수렴 교훈 문서 중 리뷰 루프 운영 교훈
  (재리뷰 트리거·완료 판정)은 구현 시점 지침 스코프 밖이라 의도적으로 병합하지 않았다
  (PR 리뷰 스킬 소관).
- `commit-protocol` 메시지 형식 보강: 제어문자가 섞일 수 있는 메시지는 HEREDOC 대신
  파일 + `git commit -F`로 전달(raw NUL → `InputValidationError` 예방, 지침 §10 위생
  규칙 상호 참조).
- `feature-develop` 프로토콜 배선: Phase 1 설계가 표면 인덱스로 섹션을 골라 브리핑에
  발췌 포함, Phase 2 구현이 발췌 규칙을 대조(§0은 항상 적용), Phase 3 테스트가 극단
  케이스 검증 항목을 반영.
- role 배선: `domain-engineer`(§2–§5)·`ui-engineer`(§6–§8)·`test-engineer`(검증 항목)에
  얇은 단일 출처 참조 추가.
- `.codex`/`.claude` feature-develop 어댑터 "필수 로딩"에 지침 섹션 선택 로딩 항목 추가
  (parity 동일).
- `AGENTS.md` Repository Shape와 `harness/README.md`에 `guides/` 네임스페이스 등재.

**소비자 조치**: 없음(서브모듈 업데이트 후 다음 `$feature-develop` 실행부터 자동 적용).

## 2026-08-04 make-pr-no-fleet-title-override

**변경**
- **`make-pr` 스킬이 FleetView(agents 화면) 세션 제목을 덮어쓰지 않도록 수정.** make-pr는 이미
  `kickoff`으로 착수·구현까지 끝난 작업 단위의 마지막 PR 단계인 **단계(phase) 스킬**인데,
  단계 스킬 중 혼자만 `set-fleet-title.mjs --label "make-pr"`를 호출해 kickoff이 심어둔 작업명
  (예: `main layout`)이나 one-shot 세션의 `one-shot` 제목을 마지막 단계에서 지워, 목록에서
  어느 작업의 PR인지 알 수 없게 만들었다. `.claude/skills/make-pr/SKILL.md`의 세션 제목 설정
  블록을 제거하고 `feature-develop`·`prd-helper`·`adr-helper`·`commit-protocol`과 동일하게
  `[pr]` result prefix만 남겼다(재도입 금지 근거 명시). 세션 제목 설정은 세션-시작 스킬
  (`next-feature`·`kickoff`·`one-shot`)의 몫이라는 분류를 문서화했다.
- `set-fleet-title.mjs`는 Claude/FleetView 전용이라 `harness/` 정본·`.codex/` 어댑터엔 대응
  블록이 없다 → 이 수정은 `.claude` 어댑터 전용, parity 무관.

**소비자 조치: 없음** (Claude Code FleetView 전용 편의 조정 — 산출물·게이트·문서 규약 영향 없음)

## 2026-08-01 kickoff-protocol-gh-first-leftover-cleanup

**변경**
- **`harness/protocols/kickoff.md` 이슈 조회 절차의 잔재 문장 제거.** 직전 `github-adapters-gh-first`
  에서 이 항목을 "`gh` CLI 우선·미가용 시 GitHub 통합 폴백"으로 바꿨는데, 바로 뒤의 옛 문장
  "`gh` CLI로 셸아웃하지 않는다(소비 프로젝트가 명시 허용한 경우에만 예외)"를 지우지 않아, 같은
  항목 안에서 "gh 우선"과 "gh 셸아웃 금지"가 충돌했다. 그 잔재 문장을 삭제해 `make-pr` 정본과
  동일하게 gh-우선→폴백 한 방향으로 정합화했다. 어댑터(`.claude`/`.codex`/commands)엔 잔재가
  없어 손대지 않았다.

**소비자 조치**: 없음(정본 문구 정합화만, 동작·게이트 불변). 서브모듈을 올린 소비자는 실제 반영할
게 없고 `npm run harness:sync --ack`로 head만 맞추면 된다.

## 2026-08-01 github-adapters-gh-first

**변경**
- **make-pr·kickoff 어댑터(`.claude`/`.codex`)의 GitHub 접근 정책을 "GitHub MCP 우선 / `gh`
  가용성 가정 안 함" → "`gh` CLI 우선, 미설치·미인증 시 GitHub MCP 폴백"으로 바꿨다.** 이유:
  MCP 응답은 필드 투영이 안 돼 조회 시 토큰을 많이 먹고, `gh`는 `--json`/`--jq` 서버사이드
  투영으로 훨씬 가볍다(같은 일을 더 적은 토큰으로).
  - kickoff 이슈 조회: `gh issue view <N> --repo <O>/<R> --json title,body,labels` 우선, 폴백 MCP.
  - make-pr PR 생성: `gh pr create --base … --head … --title … --body …` 우선, 폴백
    `mcp__github__create_pull_request`.
- **정본(`harness/protocols/{make-pr,kickoff}.md`)은 최소 변경.** 원래 "수단은 도구별 어댑터가
  정의한다"는 런타임-불가지론적 문구였으므로, "gh 우선·미가용 시 GitHub 통합 폴백"으로 수단
  선호만 명확히 하고 절차·게이트는 그대로 뒀다.
- **이식성 유지:** 어댑터엔 개인 환경 전용 장치(`env -u GITHUB_TOKEN`·특정 계정 가드)를 넣지
  않는다 — `gh` 인증·토큰 처리는 소비 환경 소관이다.

**소비자 조치**: 없음(`gh`가 없어도 MCP 폴백으로 그대로 동작). `gh`를 설치·인증해 두면 이슈
조회·PR 생성이 토큰-효율적으로 돈다. GitHub Enterprise 등 비-github.com 호스트 소비자는 그
호스트로 `gh`가 인증돼 있어야 gh 경로가 쓰이며, 아니면 MCP 폴백으로 동작한다.

## 2026-07-31 fleet-title-no-prefix-and-make-pr-final-approval

**변경**
- **FleetView(agents 화면) 세션 제목에서 `<프로젝트 약어>` prefix를 제거.** 이제 제목은 작업내역
  요약(label)만 남긴다. `set-fleet-title.mjs`가 git 루트 폴더명에서 약어를 계산해 `<ABBR> label`로
  찍던 것을 `label` 그대로 세팅하도록 바꿨다(`--abbr` 플래그·약어 계산 로직 삭제). 이유: (1)
  워크트리 세션에선 git 루트가 워크트리 폴더라 약어가 브랜치명에서 엉뚱하게 나왔고, (2) agents
  화면을 디렉터리별로 정렬하면 프로젝트가 드러나 prefix가 중복이었다. next-feature/kickoff/
  make-pr/one-shot 스킬의 제목 안내 문구도 함께 갱신.
- **`$make-pr` 호출 자체를 명시적 최종 승인으로 규정.** 그동안 make-pr가 최종 확정 전 승인을
  다시 되묻던 마찰을 없앴다. 이제 사용자가 `$make-pr`를 부른 행위가 "최종 PRD/ADR을 이대로
  확정하고 PR을 올려라"는 최종 승인 의사표시이며, make-pr는 최종본을 통보한 뒤 그 호출 발화를
  verbatim `--quote`로, `--transport make-pr`로 확정한다(one-shot 정직성 장치와 동일 — 감사
  원장 transport 컬럼에 "개별 되물음이 아닌 명시 호출로 부여"임을 남긴다). 단, 빌드 중 개정이
  사전 승인된 요구·결정을 **뒤집는** 수준이면 확정 전 정지해 확인받는다.
- **`approve.mjs`의 transport 화이트리스트에 `make-pr`를 추가**(`ALLOWED_TRANSPORTS`, `--final`
  전용). make-pr 프로토콜 정본과 `.claude`/`.codex` 어댑터 쌍을 함께 갱신했다.

**소비자 조치**
- 없음. 제목 prefix 제거는 표시 편의 변경이고, make-pr 최종 승인 규정은 기존 2단계 승인 흐름을
  그대로 두되 최종 확정의 방아쇠를 "`$make-pr` 호출"로 명시한 것이다. 승인 게이트(state.md 원장·
  `harness:approve`·frontmatter status 직접수정 금지)는 그대로다.

## 2026-07-30 one-shot-unattended-pipeline

**변경**
- **무인 파이프라인 스킬 `one-shot`을 추가.** 확정된 작은 작업 단위를 `$kickoff`→(feature면
  `$prd-helper`→`$adr-helper`)→`$feature-develop`→`$make-pr`→PR 리뷰 수렴까지 사용자 개입
  없이 한 흐름으로 진행한다. 승인 게이트는 없애지 않고, **`$one-shot` 호출 자체를 사용자의
  포괄 사전위임으로 간주해** 자동 부여한다: 각 게이트에서 `harness:approve`를 사용자 위임
  발화 verbatim(`--quote`) + `--transport one-shot`으로 호출한다. 발화를 합성하지 않고,
  transport 컬럼이 "개별 승인이 아닌 포괄 위임 자동 부여"임을 감사 원장에 드러낸다.
- **`approve.mjs`의 transport 화이트리스트에 `one-shot`을 추가**(`ALLOWED_TRANSPORTS`).
  `state.md` 승인 이벤트 transport 컬럼에 `one-shot`이 유효하게 기록된다.
- **PR 리뷰 수렴·머지/정리는 선택적 외부 가속기로 조건부 참조.** one-shot은 그 스킬 이름을
  하드코딩하지 않고 역할로 가리킨다(`$deep-interview` 관용구와 동일) — 설치돼 있으면 쓰고,
  없으면 건너뛴다. 종착점은 **리뷰 clean에서 정지**이며, 머지는 되돌리기 어려운 외부 작업
  이라 무인 범위 밖(담당 스킬이 있으면 안내만, 실행은 사용자 확인 후).
- 어댑터 쌍(`.claude`/`.codex`)과 `artifact-check`의 `requiredSurfaces` 등록, README/
  session-start 진입 안내를 함께 추가했다.

**소비자 조치**
- 없음. `one-shot`은 옵트인 스킬이다 — 부르지 않으면 기존 단계별 흐름이 그대로다. 무인
  진행이 필요할 때만 확정된 작은 작업에 대해 명시적으로 호출한다.

## 2026-07-30 artifact-address-neutrality-and-profile-aware-fleet-title

**변경**
- **산출물 사람 지칭 중립화(페르소나 누수 금지)를 단일 출처로 도입.** PRD·ADR·notes·bugfix
  문서는 사람을 중립 역할어(`사용자`/`개발자`/`검증자`/`독자`)로만 지칭하고, 운영자 개인
  호칭·별명(예: `형님`, `~님`, 실명)은 넣지 않는다 — 런타임 개인/전역 설정이 사용자를 그렇게
  부르라 해도 그 페르소나는 대화에만 적용된다. 규칙 정본은 `templates/examples/README.md` §5,
  이를 `feature-prd`/`feature-adr`/`notes`/`bugfix` 템플릿 콜아웃, `prd-helper`/`adr-helper`
  리뷰 체크리스트, `prd-writer`/`architect`/`researcher` 역할이 **얇게 참조**한다(복제 금지).
- **`set-fleet-title.mjs`가 프로필을 인식하도록 수정.** 기존에는 job 디렉터리를 `~/.claude/jobs`
  로 하드코딩해, `CLAUDE_CONFIG_DIR`로 대체 프로필(예: `.claude-mine`)을 쓰는 세션에서는 현재
  job을 못 찾아 FleetView 제목이 조용히 안 바뀌었다. 이제 `CLAUDE_JOB_DIR`→`CLAUDE_CONFIG_DIR`
  →`~/.claude` 순으로 현재 세션의 프로필 jobs 디렉터리를 판별한다(Claude/FleetView 전용, Codex
  parity 무관).

**소비자 조치**
- 지칭 중립화는 **신규 작성분에 적용**한다. 앞으로 PRD/ADR/notes/bugfix에 개인 호칭·별명을 넣지
  않는다. 기존 산출물 마이그레이션은 필수 아님(발견 시 중립어로 바꾸는 정도 권장).
- fleet-title 수정은 자동·하위호환이라 별도 조치 없음.

## 2026-07-29 two-tier-approval-and-make-pr

**변경**
- 승인을 **2단계**로 나눴다. ① **사전 승인(pre-approval)** — PRD `pre-approved`/ADR `pre-accepted`가
  feature-develop 진입 게이트다(기존 1단계 승인의 자리). ② **최종 확정(final approval)** — PRD
  `approved`/ADR `accepted`는 새 `$make-pr`에서 PR 직전에 이뤄진다.
- `harness:approve`의 **기본 동작이 사전 승인(review→pre-approved)으로 바뀌었다.** 최종 확정은
  `harness:approve --final`(pre-approved→approved)로 한다. state.md 승인 이벤트도 `PREAPPROVAL`/
  `APPROVAL` 두 종류로 나뉜다.
- 상태값 추가: PRD `pre-approved`, ADR `pre-accepted`. 스테이지 추가: `pre-approved`. `harness:check`가
  각 티어의 이벤트 backing·state↔status 정합·2티어 stage coherence·되감기 금지를 기계강제한다.
  런타임 승인 가드(claude-approval-guard)도 네 상태(pre-approved/approved/pre-accepted/accepted)
  플립을 모두 막는다. 사전 승인된 문서의 **본문 편집(빌드 중 개정)은 허용**된다.
- 새 스킬/프로토콜 `make-pr`(정본 `harness/protocols/make-pr.md`, `.codex`/`.claude` 어댑터): 최종
  확정 → 커밋 → PR 생성. ClaudeCode 어댑터는 result에 `[pr]` prefix를 붙이고 PR URL을 출력해
  FleetView에 링크로 노출하며 PR 생성은 GitHub MCP를 우선 사용한다(gh 가정 안 함).
- feature-develop은 진입 게이트를 `pre-approved`로 완화하고 "빌드 중 사용자 확인 개정"을 정식화했다
  (본문만 고치고 status 유지, state.md 단계 로그에 기록). prd-helper/adr-helper는 사전 승인을 담당한다.

**소비자 조치 (필수)**
- 진행 중이던 작업의 승인 흐름이 바뀐다: 이제 **사전 승인으로 빌드에 진입**하고 **`$make-pr`에서
  최종 확정+PR**을 한다. 기존에 `approved`/`accepted`로 굳은 유닛은 그대로 유효하다(하위호환).
- `$make-pr` 스킬이 새로 노출된다. PR을 만들 때 이 스킬을 사용한다.
- 기존 `review`/`approved` PRD·ADR 아티팩트는 마이그레이션이 필요 없다(레거시 state.md의
  "(아직 승인 없음 …)" placeholder도 approve가 그대로 인식한다).

## 2026-07-26 browser-tool-token-efficiency

**변경**

브라우저 가속기(디자인 hi-fi 목업 비교·UI 검증)를 쓸 때 **토큰 효율이 가장 좋은 인터페이스를
최우선**하도록 명세했다. 지금까지 `designer`/`adr-helper`는 예시로 "Playwright MCP"를 못박아,
매 단계 전체 접근성 스냅샷을 되돌리는 브라우저 제어 MCP가 기본값처럼 읽혔다. 브라우저 제어
MCP는 스텝마다 풀 스냅샷을 컨텍스트로 끌어와 토큰의 몸통이 되는데, 부분 스냅샷·스크린샷만
되받는 CLI 드라이버(예: Playwright CLI; depth 제한·부분 스냅샷·raw 스트립)가 같은 검증을
훨씬 싸게 해낸다. 특정 런타임 개인 MCP(예: claude-in-chrome) 이름은 공용 harness에 박지 않고,
"CLI 드라이버 기본값 / 브라우저 제어 MCP는 CLI로 도저히 안 될 때만"이라는 토큰 효율 축의
보편 원칙만 넣었다.

- **`harness/roles/designer.md`·`harness/protocols/adr-helper.md`** — hi-fi 비교 가속기 문구를
  CLI 우선으로 교체(Playwright MCP 예시 제거).
- **`harness/protocols/ui-verification.md`** — 스냅샷/스크린샷 절차에 CLI 우선 원칙 인라인.
- **어댑터 parity** — `.claude`/`.codex`의 `designer`·`ui-verification`을 동일 문구로 동기화.

**소비자 조치:** 없음. 정보성 명세 변경이며 게이트·frontmatter 스키마에 영향 없다.

## 2026-07-25 cost-aware-delegation-gate

**변경**

토큰이 유한하다는 전제를 흐름 전반에 명시했다. 서브에이전트 fan-out과 워크플로우가 각 단계
토큰의 몸통인데(각 서브에이전트가 격리 컨텍스트에서 파일·코드를 재로드·재탐색), 지금까지는
"역할에 위임한다"가 무조건 톤이었고 `feature-develop` Phase 0.5는 심지어 "모호하면 무거운 쪽을
택한다"였다. 위임을 "기본값이 아니라 크기가 정당화할 때만 쓰는 가속기"로 재정의했다.

- **`session-start.md`에 "위임 비용(항상 인지)" 정본 섹션 신설** — bugfix·chore·한 파일 국소
  수정·단순 문서/PRD는 메인이 직접 작게 수행하고, feature도 fan-out 폭을 규모에 비례시키며,
  검증·리뷰 라운드도 중대도에 비례한다. ultracode 같은 철저함 모드에서도 유지(철저함은 fan-out
  폭이 아니라 판단의 깊이로).
- **각 단계 프로토콜에 위임 판정 규율 인라인** — `next-feature`(후보 추리기가 단순하면 메인
  직접), `prd-helper`(단순 PRD는 메인 직접), `adr-helper`(단순 결정은 메인 직접), `feature-develop`
  Phase 0.5(role 체인은 병렬 분업이 이득인 변경에만; 단일 관심사는 메인 직접/1~2 역할).
  `feature-develop` 어댑터 실행 원칙도 대칭 반영(`.claude`/`.codex` parity 유지).
- **모호할 때 확인 가드레일(과잉 절약 방지)** — 아끼려다 필요한 fan-out을 놓치는 것도 실패다.
  세 갈래로 정리했다: **명백히 작으면 직접, 명백히 크면 fan-out, 모호하면(경계선) 구조화 질문
  으로 사용자에게 확인**. 명백한 경우까지 묻지 않아 질문 폭탄은 피하고, 확인은 자율 실행(워크플로우)
  바깥 오케스트레이터에서 위임 착수 전에 한다. `session-start.md` "위임 비용" + `feature-develop`
  Phase 0.5에 반영.
- **컨텍스트 브리핑 주입(fan-out 시 재탐색 제거)** — 서브에이전트는 격리 컨텍스트라 오케스트레이터가
  읽은 것을 물려받지 못해, 방치하면 N명이 각자 PRD/ADR·코드를 처음부터 재로드·재탐색한다(토큰 몸통).
  위임 프롬프트에 **브리핑(관련 결정·수용 기준·건드릴 파일 경로+역할·인터페이스 계약)** 을 주입하고,
  코드 지도는 한 번 만들어(plan/notes) 여러 역할이 공유하도록 규율화했다. `session-start.md` "위임
  비용" 공용 원칙 + `feature-develop` 실행 레인·Phase 1 계획 산출물 + 어댑터 Workflow 골격에 반영.

강도는 산문 규율(모델 재량)이다 — 작업 크기 판정은 의미 판단이라 기계 하드게이트로 강제하기
부적합하고, "구조는 기계강제·의미는 모델재량" 철학과 정합한다. 기계강제 축은 불변.

**소비자 조치**: 없음. 위임 규율은 에이전트 행동 가이드라 소비 프로젝트가 별도로 반영할 산출물이
없다. 다만 이 방향을 소비 프로젝트에서도 적용하려면 자기 `AGENTS.md`가 fan-out을 과하게 권하지
않는지 점검하면 좋다.

## 2026-07-25 flow-token-efficiency-pass-1

**변경**

`next-feature → kickoff → prd-helper → adr-helper → feature-develop` 흐름의 토큰 효율을
개선했다(중복 로드 제거, 기능·게이트 불변). 세 갈래다.

- **세션제목 스크립트 추출** — next-feature/kickoff 어댑터에 near-verbatim으로 복제돼 있던
  ~50줄 bash+python 세션제목 스크립트를 공용 헬퍼 `scripts/harness/set-fleet-title.mjs`
  하나로 뽑았다. 어댑터는 `[ -f .harness/scripts/harness/set-fleet-title.mjs ] && node … || true`
  실패관용 호출 1줄로 축약한다(agents 세션 아니거나 `.harness` 부재 시 조용히 no-op, 절대
  하드페일 없음). 헬퍼는 `--label`/`--slug`(하이픈→공백)/`--abbr`(약어 오버라이드)를 받는다.
- **어댑터 절차·필드 재진술 축약** — 어댑터가 프로토콜을 읽으면서(어댑터 1단계) 그 프로토콜
  규칙을 다시 산문으로 재진술하던 이중 로드를 줄였다. next-feature 어댑터의 후보 필드 열거를
  프로토콜 포인터로 바꾸고(`.next-unit` 앵커는 4필드 `<type>/<slug> | <제목> | <영역> | <섹션>`로
  프로토콜과 정합화), feature-develop 어댑터의 필수 로딩·승인 게이트·실행 원칙을 압축했다.
  load-bearing(먼저 `state.md`·`harness:check`·`harness:approve` 명령·"의도≠승인"·자율레인
  분리·`harness:gate`·`commit-protocol`)은 전부 보존한다. `.claude`/`.codex` 대칭 편집으로
  parity 유지(`harness:check`의 `assertAdapterParity` green).
- **컨텍스트 재판독 조건부화** — `AGENTS.md`·`docs/wiki/index.md`·`README`를 스테이지마다 다시
  읽으라던 지시를 "이 컨텍스트에 아직 로드돼 있지 않을 때만(session-start에서 이미 읽었으면
  재판독 금지)"으로 바꿨다(next-feature Phase 0, feature-develop Phase 1 + 어댑터 필수 로딩).
  런타임 중립 문구라 격리 서브에이전트는 여전히 안전하게 읽고(로드 안 돼 있으므로), 오케스트레이터
  재판독만 준다.

기계강제 축(`state.md` 원장·`harness:approve`·PreToolUse 가드·CI `harness:check`·어댑터 parity)과
의도적으로 폐기된 하드게이트는 건드리지 않았다. 순수 중복 산문/스크립트 정리다.

**소비자 조치**: 없음. 서브모듈을 업데이트하면 새 헬퍼가 함께 따라오고, 구버전 `.harness`라도
어댑터 호출이 파일 부재 시 no-op이라 깨지지 않는다. `.next-unit` 앵커를 직접 파싱하는 소비자
자동화가 있으면 4번째 필드(섹션, 선택)를 허용하도록 확인만 하면 된다.

## 2026-07-25 windows-environment-fixes

**변경**

GitHub 이슈 #1·#2·#3(전부 Windows 환경 파손)을 해소했다. 세 문제 모두 리눅스 CI에서는
재현되지 않고 저장소에 흔적도 남지 않아, Windows 소비 프로젝트에서만 조용히 터졌다.

- **#1 `harness:gate`가 첫 스텝에서 ENOENT로 죽음** — `gate.mjs`가 `npm`을 shell 없이
  spawn했다. 이슈가 제안한 처방(`npm.cmd`)은 **실제로는 통하지 않는다**: Node
  18.20.2/20.12.2/21.7.3의 CVE-2024-27980 대응 이후 `.cmd`를 shell 없이 띄우면 EINVAL이
  난다(Node 22.12.0/win32 실측). 그래서 `npm_execpath`가 가리키는 패키지 매니저 JS
  진입점을 `process.execPath`로 직접 실행하고, 그 변수가 없을 때만 win32에서 shell을
  경유한다(pnpm·yarn 소비 프로젝트는 자기 매니저를 그대로 쓴다). spawn 실패와 스텝
  실패를 갈라 보고해, 원인 메시지 없이 죽던 문제도 함께 닫았다.
- **#2 CRLF 워킹트리에서 frontmatter 파서 전멸 + `harness:approve`가 파일 손상** —
  `lib.mjs`의 `readText`/`gitShow`에서 EOL·BOM을 정규화하고, frontmatter 경계 판정을
  `frontmatterBounds` 한 곳으로 모아 CRLF를 허용했다. `setFrontmatterField`는 파일이
  쓰던 EOL을 보존해 수술적 편집 계약을 지킨다(예전에는 CRLF 파일에서 "frontmatter
  없음"으로 오판해 기존 블록 위에 새 블록을 얹었고, approve 한 번에 state.md에 블록이
  3개 쌓였다). `claude-approval-guard`도 같은 정규화를 타게 해, CRLF 파일에서 literal
  치환이 빗나가 승인 플립을 놓치던 fail-open 우회를 닫았다.
- **#3 symlink 어댑터가 조용히 텍스트 파일이 됨** — `attach-submodule.mjs`가 첫 링크
  전에 환경을 진단한다(`core.symlinks`·`core.autocrlf`의 값과 **출처**, 실제 symlink
  생성 프로브). 문제가 있으면 아무것도 바꾸지 않고 중단하고, `.git/config`에 값이
  박힌 경우에는 `--global`로 안 고쳐진다는 사실과 `--unset` 처방을 함께 낸다
  (`--no-env-check` / `HARNESS_SKIP_ENV_CHECK=1`로 opt-out). 소비 프로젝트에
  `.gitattributes`(`* text=auto eol=lf` + 바이너리 명시)를 심어 CRLF 유입을 원천
  차단한다. 이미 텍스트 파일로 깨진 어댑터는 attach 재실행으로 복구하고(내용이 정확히
  하네스 타겟을 가리킬 때만 교체 — 프로젝트 override는 불변), `harness:check`에
  어댑터 무결성 검사를 추가했다(소비 모드 전용, 내용 기반 판정).
- 함께 고친 Windows 파손: `attach-submodule.mjs`의 경로 출력이 백슬래시를 뱉어
  Windows에서 attach 테스트 4/8이 실패하던 것(POSIX 정규화), `kickoff`의 첫 줄 unit
  경로가 백슬래시로 나와 커밋 링크·ingest 인자로 그대로 흘러가던 것, `docs/wiki`의
  `desktop.ini`/`Thumbs.db` 때문에 `harness:check`가 빨개지던 것.
- 회귀 테스트: CRLF/BOM frontmatter 단위 케이스, CRLF 워킹트리 end-to-end(approve가
  블록을 쌓지 않는지 · check가 통과하는지), gate의 매니저 해석과 실패 status 전파,
  어댑터 stand-in 탐지·복구·override 불변, `.gitattributes` 시딩. 전부 플랫폼 독립이라
  리눅스 CI에서도 돈다.
- 이 저장소 자체도 CRLF에 오염돼 있어(추적 파일 113개) `harness:check`가 어댑터
  divergence 11건으로 실패 중이었다. `.gitattributes` 추가 + 워킹트리 재정규화로 green.

**소비자 조치**

1. Windows에서 작업하는 소비 프로젝트는 `.harness/harness/protocols/submodule-attach.md`의
   **"Windows 사전조건"** 절차를 실행한다. 특히 이미 clone된 저장소는
   `git config --unset core.symlinks && git config --unset core.autocrlf`가 **필수**다
   (`--global`만으로는 실효값이 바뀌지 않는다).
2. `attach`를 다시 실행한다. `.gitattributes`가 없으면 새로 심기고, 텍스트 파일로
   깨져 있던 어댑터는 symlink로 복구된다. 진단이 중단시키면 메시지의 처방을 먼저 따른다.
3. 워킹트리가 이미 CRLF라면 `.gitattributes` 반영 후
   `git rm --cached -rq . && git reset --hard`로 재정규화한다(작업 트리가 깨끗할 때만).
4. `npm run harness:check`와 `npm run harness:gate`가 통과하는지 확인한다. Windows에서
   `harness:gate`가 처음부터 돌아가는 것이 이 항목의 핵심 확인점이다.

## 2026-07-23 prd-adr-altitude-examples

**변경**

- **`harness/templates/examples/`를 신설했다.** 채워진 PRD/ADR **짝 예시**(`notification-prd.md`,
  `notification-adr.md`)와 "무엇이 어디에 사는가" **고도 가이드**(`README.md`)를 담았다. 가이드는
  3층 고도표(PRD/ADR/구현), 누수 **self-check 3문항**(실제 요구 판정·구현 결합 판정·고유명사 소거
  판정), 누수 **부검 대조표**, 과대 ADR 경계를 이 하네스의 **단일 출처**로 정의한다. "구조는
  기계강제·의미는 모델재량" 철학에 따라, 코드레벨 디테일이 PRD에 새는 문제(의미 품질)는 리터럴
  게이트가 아니라 이 서술 루브릭 + self-review로 다룬다.
- **`prd-helper.md` Phase 4**의 느슨한 "구현 세부를 과하게 박지 않았는가?" 1줄을 **3문항 이진
  self-check + 모호(과소명세) 방지 + 루프 종료 조건**으로 강화하고, 상세는 examples/README를
  단일 출처로 참조하게 했다(복제 금지).
- **`adr-helper.md`·`architect.md`**에 **과대 ADR**(코드 스니펫·전체 설계문서를 본문에 욱여넣기)
  경계선을 추가했다(코드 누수의 ADR 쪽 대칭).
- **`prd-writer.md`**에 **고유명사 소거 판정**(에이전트가 코드베이스를 읽은 뒤 타입·필드명을 그대로
  요구에 옮기는 누수를 겨냥)과 good/bad 대조를 추가했다.
- **`feature-prd.md`/`feature-adr.md` 템플릿**에 작성 고도 힌트를 추가하고, `feature-prd.md` 비기능
  예시의 "저장소 구조" 문구를 "저장소가 만족해야 할 조건"으로 교정했다(템플릿 문구 자체의 누수
  유인 제거).

**소비자 조치**

- 없음(추가·강화만; 게이트·frontmatter·구조 불변). `templates/examples/`는 `harness:check`가
  스캔하지 않는 교육 자료이며 **존재를 기계강제하지 않는다**(교육 자료의 존재를 소비 프로젝트
  게이트로 강제하는 층위 혼동을 피함). 새 고도 가이드는 공유 프로토콜/역할을 통해 자동 적용되므로,
  원하면 팀에 `.harness/harness/templates/examples/README.md`를 공유하면 된다.

## 2026-07-23 kickoff-github-issue-arg

**변경**

- **`$kickoff`에 GitHub 이슈 번호 진입점을 추가했다.** 사용자가 다른 말 없이 이슈 번호(또는
  이슈 URL) 하나만 인자로 주면(`/kickoff 42`) "이 이슈로 kickoff"로 해석한다. 이슈를 읽고
  유형(feature/bugfix/chore)을 판정해 slug·제목을 도출하는 **의미 판단은 스킬(에이전트)의
  몫**이고, 스크립트는 골격 생성과 provenance 기록만 한다(구조는 기계, 의미는 모델). 판정
  절차·라벨 힌트를 `harness/protocols/kickoff.md`의 새 "GitHub 이슈로 시작" 섹션과 3개 어댑터
  (`.claude/commands/kickoff.md`, `.claude/skills/kickoff`, `.codex/skills/kickoff`)에 명문화했다.
- **`kickoff.mjs`에 `--issue <번호|#번호|URL>` 옵션을 추가했다.** 이 작업 단위가 나온 이슈를
  durable provenance로 남긴다: feature/bugfix는 `prd.md`/`bugfix.md` frontmatter의 `issue:`에,
  모든 유형은 `state.md` 단계 로그의 kickoff 줄에 기록한다(chore는 primary artifact가 없어
  state 원장에만). URL은 URL로, 번호는 `#<번호>`로 정규화한다(`lib.normalizeIssueRef`, 순수·
  테스트 가능). 해석 불가한 값은 골격을 만들기 전에 실패한다.
- **이슈 번호를 스크립트에 직접 넘기면 실패한다.** `harness:kickoff -- 42`처럼 이슈-형태
  positional이 오면 유형 판정을 건너뛴 골격 생성을 막기 위해 실패하고 "먼저 이슈를 조회·
  분류하라"는 힌트를 낸다.

**소비자 조치**

- 없음(기능 추가). 이슈 번호로 kickoff하려면 런타임에 GitHub MCP 도구가 설정되어 있어야
  한다(없으면 기존처럼 `--type/--slug/--title`로 직접 kickoff하면 된다). `--issue` frontmatter
  필드는 선택이라 기존 게이트에 영향을 주지 않는다.

## 2026-07-23 kickoff-own-artifacts-not-dirty

**변경**

- **`$kickoff`의 main+clean auto-checkout 판정이 kickoff 자신의 산출물을 dirty로 세지 않도록
  고쳤다.** 지금까지 clean 판정은 `git status --porcelain`(untracked 포함)이 비어야 했는데,
  `$next-feature`가 방금 남긴 `docs/raw/.next-unit` 앵커가 untracked라 tree를 dirty로 만들어,
  `main`에 있어도 auto-checkout이 막히고 프로토콜상 에이전트가 "워크트리 vs checkout"을 물으며
  **raw 골격 생성·`.next-unit` 소비까지 블록**되던 자기충돌이 있었다. 이제 clean 판정은 kickoff이
  소비할 `.next-unit` 앵커와 대상 unit의 raw 디렉터리(`docs/raw/<type>/<slug>/`, 재실행 잔재
  포함)만 남은 트리를 clean으로 본다. 무관한 WIP가 하나라도 섞이면 여전히 dirty로 남아 워크트리
  vs checkout 선택 경로를 탄다.
- `lib.mjs`에 `workingTreeChangedPaths()`(porcelain 경로 목록, 오류 시 null)를 추가하고
  `isWorkingTreeClean()`을 그 위에 재정의했다(동작 동일). `kickoff.mjs`는 이 목록에서 자기
  산출물을 제외해 판정한다. 프로토콜 문서(`kickoff.md`·`next-feature.md`)도 정합화했다.

**소비자 조치**

- 없음(동작만 확장·수정). `$next-feature → $kickoff` 정상 플로우가 더는 앵커 때문에 막히지
  않는다. `main`에서 kickoff 산출물 외에 깨끗하면 이전처럼 작업 브랜치가 자동 생성된다.

## 2026-07-22 wiki-strip-authoring-and-harness-freshness

**변경**

- **위키 템플릿을 얇은 골격으로 재설계.** `harness/templates/wiki/index.md`에서 '위키 작성 규칙'
  설명(상단 안내 blockquote, `## Raw Units` 아래 "영역이란/영역 설계 원칙/읽는 법" 설명 문단,
  하단 `## Maintenance` 섹션)을 전부 제거했다. 이제 템플릿에는 frontmatter 포인터(`summary`·
  `authoring_rules`), `## 큰 방향성`, `## Raw Units (영역별 계보)` 헤딩만 남는다. 작성 규칙은
  정본인 `harness/protocols/wiki-ingest.md`로 이관했다(위키 파일 내용 계약 섹션 신설).
- **`assertWikiNoAuthoringGuidance` 게이트 신설(하드 에러, 소비자 전용).** `docs/wiki/*.md`에
  옛 작성-규칙 boilerplate가 남아 있으면 `harness:check`가 sentinel로 감지해 실패시킨다. sentinel은
  그 boilerplate에만 나타나는 고정밀 문구다(lib `WIKI_AUTHORING_SENTINELS`).
- **`attach --retrofit`의 위키 주입 정리.** 기존엔 `## Harness Maintenance` 규칙 블록을 소비자
  위키에 주입했는데, 규칙 대신 `wiki-ingest.md`를 가리키는 sentinel-free 포인터만 주입하도록 바꿨다.
- **서브모듈 최신 여부 warning.** `harness:check`가 소비 프로젝트에서 `.harness`가 원격보다
  뒤처졌으면 경고만 남긴다(best-effort·타임아웃, 오프라인/CI/`HARNESS_SKIP_REMOTE_CHECK`는 skip).
- **하네스 정비 ride-along 예외 명문화.** `.harness` 최신화와 그 정합화는 전용 브랜치 없이 현재
  브랜치에 chore 커밋 하나로 태워도 된다(`kickoff --type chore --no-branch`). `commit-protocol.md`·
  `submodule-attach.md`에 규칙을 추가했다. 기계 게이트는 이 ride-along을 막지 않는다.

**소비자 조치 (필수)**

1. **`docs/wiki/index.md`(및 분리된 섹션 파일)에서 '위키 작성 규칙' 문구를 삭제한다.** 구체적으로
   상단 안내 blockquote(`이 한 장은 에이전트가…` / `이 문서는 항상 로딩되는…`), `## Raw Units`
   아래의 설명 문단(`각 ### <영역>은 앱의…`, `영역 설계 원칙`, `읽는 법 —` 및 예시 코드블록),
   하단 `## Maintenance` 섹션을 제거한다. **`## 큰 방향성`과 `### <영역>`별 계보 링크는 그대로
   유지**한다. 삭제 후 `harness:check`가 green이면 완료다(남은 잔재는 sentinel 에러로 알려준다).
2. (선택) 위키 최상단에 `summary`·`authoring_rules` frontmatter 포인터를 새 템플릿처럼 추가하면
   "이 파일이 무엇이고 규칙은 어디에 있는지"가 명확해진다.
3. `npm run harness:sync -- --ack`로 이 항목 반영을 확인한다(`.harness-sync` 갱신).

서브모듈 최신 여부 warning과 ride-along 예외는 추가 동작이라 별도 소비자 조치가 없다.

## 2026-07-21 kickoff-branch-situational

**변경**

- `$kickoff`이 raw 골격을 만들기 **전에** 작업 브랜치를 상황에 따라 정리한다. `main`/`master`에서
  작업 트리가 깨끗하면 `<type>/<slug>` 브랜치를 **자동 생성·전환**(`git checkout -b`)하고, 이미 그
  작업 브랜치 위면 그대로 둔다(branch-first). 다른 브랜치·커밋 안 된 변경·detached HEAD·비-git,
  또는 목표 브랜치가 이미 존재하면 브랜치를 건드리지 않고 힌트만 남긴다.
- 새 플래그 `--checkout`(현재 위치에서 강제 생성·전환)과 `--no-branch`(브랜치 로직 완전 끔, 둘이
  겹치면 `--no-branch` 우선)를 추가했다.
- 지금까지 kickoff은 브랜치를 전혀 만들지 않았는데 프로토콜 문서·state 원장은 "브랜치 생성"을
  약속해 문서↔동작이 어긋나 있었다. 실제 동작에 맞춰 `session-start.md`·`next-feature.md`·
  `kickoff.md`와 state 원장 로그줄(feature 템플릿 + bugfix/chore 인라인)을 정정했다.

**소비자 조치**

- 없음(동작만 확장). 기존 branch-first 습관은 그대로 동작한다. `main`/`master` + clean 상태에서
  kickoff하면 이제 작업 브랜치가 자동으로 생기니, 그게 싫으면 `--no-branch`를 쓴다. 다른 브랜치나
  dirty 상태에서는 kickoff이 자동 전환하지 않고 워크트리 격리 vs 현재 위치 checkout을 선택하도록 안내한다.

## 2026-07-21 extracth1-frontmatter-title

**변경**

- `wiki-ingest`가 위키 제목을 뽑을 때 쓰는 `extractH1`이 선두 frontmatter 블록을 건너뛴 뒤 본문 H1을
  찾도록 고쳤다. 이전에는 frontmatter 안의 `# section(섹션, 선택): …` 같은 안내 주석 줄을 H1로 오인해,
  최신 kickoff 템플릿을 쓴 unit의 위키 줄에 실제 제목 대신 주석 텍스트가 박혔다.

**소비자 조치**

- 이번 수정은 **앞으로의 ingest만** 바로잡는다. `harness:ingest`는 이미 링크된 unit의 제목을 다시
  만들지 않으므로(멱등 skip), 기존 위키에 `# section(…)`류 가짜 제목이 박힌 줄이 있으면
  `docs/wiki/*.md`에서 **손으로 실제 제목으로 교정**한다. 이후 신규 ingest는 정상 렌더된다.

## 2026-07-21 fleetview-title-agents-guard

**변경**

- `$kickoff`·`$next-feature`의 agents 화면(FleetView) 제목 설정 스크립트에 **선-체크 가드**를
  추가했다. 스크립트 맨 앞에서 agents 세션인지(`~/.claude/jobs/*/state.json` 존재)를 먼저
  확인하고, job state.json이 하나도 없으면(= agents 모드가 아닌 대화형 세션) python을 아예
  호출하지 않고 조용히 정상 종료한다(exit 0). job은 있으나 현재 세션과 매칭되는 항목이 없는
  경우도 `sys.exit(<문자열>)`(exit 1) 대신 `SystemExit(0)`으로 no-op 처리한다.
- 이전에는 매칭되는 state.json이 없을 때마다 exit code 1로 빠져서, 그 실패를 "제목 설정
  건너뜀"으로 해석해 넘어가야 했다. 이제 비-agents 세션에서도 실패 신호 없이 깔끔히 no-op이 된다.

**소비자 조치**

- 없음. Claude Code 어댑터 전용 동작 개선으로 공용 `harness/` 표면·소비자 아티팩트에 영향이
  없다. FleetView 제목 갱신은 agents 세션에서 종전과 동일하게 동작한다.

## 2026-07-08 adr-helper-design-decision-lane

**변경**

- **`designer` 역할 신설**(`harness/roles/designer.md` + `.codex`/`.claude` 어댑터). UI-significant
  유닛에서 화면 배치·구성·상호작용 어포던스·시각 위계의 **대안을 제안**하고 채택 결정을
  근거와 함께 남긴다. 빌드는 하지 않는다(구현은 `ui-engineer`).
- **`$adr-helper`에 디자인 결정 레인(Phase 3.5)** 추가. `$prd-helper`가 "다투는 화면 배치"를
  ADR 필요 사유로 넘기면, `designer`가 배치 대안을 **최소 2개 ASCII 와이어프레임**으로 비교하고,
  채택안·기각 사유·시각 위계 근거를 **ADR `## 선택지`/`## 결정`/`## 선택 근거`에** 남긴다(별도
  아티팩트·게이트 없음). 배치 선택은 구조화 질문(ClaudeCode `AskUserQuestion` preview 등)으로
  받아 PRD·ADR 통합 승인으로 흡수한다.
- **게이팅**: `$prd-helper`의 "ADR 필요 여부" 판단에 "디자인 결정 필요 여부"를 포함. 배치가
  실제 다투는 결정인 UI 유닛에만 발동하고, 단순 화면은 build-first 유지.
- 기본 경로는 tool-free ASCII(Codex/ClaudeCode 양쪽 동작). `frontend-design` 스킬·브라우저 도구
  (Playwright MCP: 목업 hi-fi 스크린샷 비교)·컴포넌트 라이브러리 MCP는 **있으면 쓰는 optional
  가속기**로만 참조하며 없어도 동작한다.

**소비자 조치**

- **없음(옵트인).** 새 `designer` 역할과 디자인 결정 레인은 UI-significant 유닛에서만 발동하는
  선택 경로다. 단순 화면은 종전대로 build-first다. 서브모듈 업데이트 후 `.harness`의 `designer`
  어댑터가 노출되며, hi-fi 목업 비교를 쓰려면 Playwright MCP를 연결하면 된다(없으면 ASCII).

## 2026-07-08 kickoff-window-settled-gating

**변경**

- **kickoff 직후 `harness:check` green 보장.** feature/bugfix 골격은 첫 ingest(2-touch의
  `$prd-helper` PRD→review 시점) 전까지 wiki에 링크되지 않는데, `assertRawUnitsLinked`와
  `assertAreaGrouping`이 그 전부터 링크를 요구해 kickoff↔prd-helper 창에서 빨간불이었다
  (kickoff.md 완료조건 check-green과 상충). 두 게이트가 이제 `unitIsSettled`(feature=prd
  review/approved, bugfix=bugfix review/fixed)가 아닌 unit을 **면제**한다. 링크 요구 자체는
  review+에서 그대로 유지된다.
- **chore는 kickoff이 즉시 링크.** chore는 review 라이프사이클이 없고 area/section이 필요
  없어(운영 버킷) `kickoff.mjs`가 골격 생성 직후 wiki-ingest를 best-effort로 실행한다. 따라서
  chore도 kickoff 직후 green이고 링크 게이트는 엄격하게 유지된다.
- **`collectDeclaredSections`가 settled 유닛의 섹션만 카운트.** 아직 review 전인 draft가
  시드된 `section:`만으로 유령 split(2섹션 판정→허브 없음→`assertSectionLayout`/`assertWikiShape`
  빨간불)을 만들던 문제를 함께 제거. 두 섹션이 실제 review+ingest될 때 분리가 일어난다. ingest는
  현재 처리 중인 unit의 섹션을 명시적으로 카운트에 더하므로 status 순서와 무관하게 안전하다.

**소비자 조치**

- **없음.** 이 변경은 오탐(false red)을 줄이는 방향의 순수 개선이라 하위호환이다. 서브모듈
  업데이트 후 kickoff 직후 `harness:check`가 green이 되고, `kickoff --type chore`가 chore를
  자동으로 위키 운영 버킷에 링크한다(수동 `harness:ingest` 불필요). review 이상 unit의 링크
  요구는 그대로다.

## 2026-07-07 wiki-section-axis-and-auto-split

**변경**

- wiki에 **area 상위의 `section`(섹션) 축**을 도입. 계층은 `## 섹션 > ### 영역(area) >
  시간순 bullet`. 섹션은 `prd.md`/`bugfix.md` frontmatter `section:`(단일 값)에 durable
  선언한다(area는 콤마 다중, 섹션은 단일).
- **자동 분리**: 선언된 distinct 섹션이 1개 이하면 모든 area가 `docs/wiki/index.md` 한 장에
  남고(현행 동일), **2개 이상이 되는 순간 `harness:ingest`가** 각 섹션을 `docs/wiki/<섹션>.md`로
  분리하고 `index.md`를 `## 섹션` 링크 허브로 재작성한다. 첫 섹션의 기존 계보 블록은
  navigation 라벨(`_(현재)_`/`_(superseded by …)_`)을 보존한 채 도구가 원자적·멱등으로 이관한다.
  이미 분리된 뒤 새 섹션은 파일 생성 + 허브 링크 추가로 처리된다.
- `harness:check`가 섹션 축을 기계강제: `docs/wiki`에는 `index.md`와 선언된 섹션 파일만 존재,
  각 unit은 자기 섹션 파일에만 링크(교차 링크 차단), 선언 섹션 2개 이상이면 index가 허브여야
  하고 2개 미만이면 허브가 없어야 함, 허브 링크 유효성, broad 섹션 이름 금지. 기존 area 게이트
  (grouping/timeline/currency/linked/taxonomy)는 모두 다중 wiki 파일 순회로 확장.
- `kickoff --section`, next-feature 앵커 4번째 필드(section)로 `section:` 시드 지원. wiki-ingest는
  `--section`을 받고, frontmatter가 진실원이다. 분리된 프로젝트에서 섹션 미선언 feature/bugfix
  ingest는 실패한다.

**소비자 조치**

- **없음(옵트인).** 섹션을 선언하지 않으면 wiki는 기존 그대로 `index.md` 한 장으로 동작한다.
  여러 페이지/섹션으로 커져 wiki를 나누고 싶을 때 `prd.md`/`bugfix.md` frontmatter `section:`에
  섹션을 선언하기 시작하면 된다. 두 번째 섹션이 선언되는 순간 다음 `harness:ingest`가 자동으로
  분리하므로 수동 마이그레이션은 필요 없다.

## 2026-07-06 ingest-timing-and-backlog-fixes

**변경**

- wiki-ingest **실행 시점을 2-touch로 정본화**: 첫 링크는 `$prd-helper`(PRD review 시,
  모든 raw unit 링크 요구 충족), 계보 큐레이션(`_(현재)_`/`_(superseded by …)_`)은 통합/커밋
  시점. kickoff/prd-helper/feature-develop/next-feature/adr-helper 프로토콜을 이 모델로 정리.
- 증분 area 판단 보강: `$prd-helper`/`$next-feature`가 `docs/wiki/index.md`의 `### 헤딩`을
  읽어 기존 영역을 재사용하도록 안내. ingest는 기존 영역이 있는데 **새 영역을 만들면 경고**로
  기존 목록을 보여 오타 중복(`A화면`≠`A 화면`)을 막는다.
- PRD 상위 계보: `feature-prd.md` frontmatter에 `parent_prd`(선택) 추가 +
  `assertPrdReferences`가 링크 유효성 검증(ADR `related_prd`와 대칭).
- 소비 프로젝트에서 발견한 버그 수정: (1) `harness:approve`가 `state.md` 규칙 문단의 백틱
  헤딩 리터럴을 실제 헤딩으로 오인해 단계 로그/승인 이벤트를 문단 중간에 삽입하던 것을 줄-앵커
  탐색으로 수정; (2) PRD 선승인(`stage: approved`) 후 ADR 단계 진입(`approved`→`adr-draft`/
  `adr-review`)이 regression으로 막히던 것을 허용; (3) `assertNoPlaceholders`가 accepted 문서
  본문의 코드 중괄호(`Phase { … }`)를 미치환 토큰으로 오탐하던 것을 코드 span 제외로 수정.

**소비자 조치**

- **필수 조치 없음** — 모두 하위호환 개선/버그 수정이라 기존 위키·문서를 다시 고칠 필요는 없다.
- (선택) 상위 PRD를 세부화하는 후속 feature는 `prd.md` frontmatter `parent_prd`로 계보를 이을
  수 있다. (선택) `attach-submodule.mjs`를 다시 실행하면 갱신된 템플릿/스크립트가 반영된다.

## 2026-07-06 wiki-area-lineage-and-sync

**변경**

- 위키 작성 체계를 **area(영역)별 시간순 계보 + 현재 결정 포인터**로 개편했다. area는
  `prd.md`/`bugfix.md` frontmatter에 콤마 구분 리스트로 선언하고(다중 영역 지원),
  `harness:ingest`가 각 영역 `### 헤딩` 아래 `YYYY-MM-DD` 날짜 접두로 시간순 삽입한다.
  `harness:check`가 선언==렌더 일치·date-parity·현재 포인터 구조 불변식·broad 금지를
  기계강제한다(레거시 unit은 선언/dated 줄만 대상이라 무파손). `--category`는 레거시 별칭.
- **커밋별 CHANGELOG + 소비자 sync 정합성 게이트**를 도입했다(`harness:sync`,
  `.harness-sync`, `assertHarnessSync`). 이 항목이 그 첫 적용이다.

**소비자 조치 (필수)**

1. **`docs/wiki/index.md`를 새 area 체계로 전면 재작성한다.** 기존 넓은 카테고리를 앱의
   좁은 기능/구조 영역(화면·플로우·엔진 등)으로 재편하고, 각 영역 `### <영역>` 아래에 그
   영역의 작업 단위를 다음 형태로 **오래된 → 최신** 시간순 나열한다:

   ```md
   - `YYYY-MM-DD` **제목** — [PRD](../raw/<type>/<slug>/prd.md) · [ADR](…) _(superseded by …)_
   - `YYYY-MM-DD` **제목** — [PRD](…) · [ADR](…) _(현재)_
   ```

   날짜는 각 unit frontmatter `date`와 일치해야 하고, 대체된 결정은 `_(superseded by …)_`,
   영역의 현재 최신 결정은 `_(현재)_`(영역당 최대 1개)로 표시한다. 상세 규칙은
   `.harness/harness/protocols/wiki-ingest.md` 참고. 재작성 후
   `npm run harness:ingest -- <각 unit> --area "<영역>"`로 재정렬을 검증할 수 있다.

2. 기존 feature `prd.md`·bugfix `bugfix.md` frontmatter에 `area: "<영역>"`(여러 개는 콤마)을
   추가한다. 값은 위키 `### 헤딩` 문자열과 정확히 일치해야 한다(`harness:check`가 강제).

3. `package.json`에 `"harness:sync": "node .harness/scripts/harness/sync.mjs"`를 추가한다
   (`.harness/scripts/harness/attach-submodule.mjs`를 다시 실행하면 자동 추가·`.harness-sync`도 생성).
   그 뒤 `npm run harness:sync --ack`로 이 항목 반영을 확인한다.
