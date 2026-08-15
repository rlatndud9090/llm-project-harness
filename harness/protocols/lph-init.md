# LPH Init 프로토콜 (Claude Code 플러그인)

공용 하네스를 소비 프로젝트에 **Claude Code 플러그인**으로 적용하는 절차다(예전 이름
`harness-init`; 슬래시 진입점은 `/lph-init`, 엔진은 `scripts/harness/init.mjs`). 하네스 엔진
(`scripts/harness/*.mjs`)과 스킬·커맨드·에이전트는 전부 플러그인(이 저장소) 안에만 있고,
소비 저장소에는 **얇은 배선만** 남는다. `.harness` 심볼릭 링크도, devDependency도, 엔진
사본도 없다.

## 원칙

- 하네스 엔진·스킬·커맨드·에이전트는 **플러그인**이 제공한다. 소비 저장소는 엔진을 복사하지
  않는다.
- 소비 저장소의 "하네스 발자국(footprint)"은 다음뿐이다.
  - `.harness.json` — 플러그인이 키로 삼는 **루트 플래그**(적용 표식 + 버전). 이 파일이
    있어야 플러그인의 SessionStart 훅과 consumer-mode 게이트가 발동한다.
  - `.claude/settings.json` — 네이티브 플러그인 활성화(`extraKnownMarketplaces` +
    `enabledPlugins`). 다른 키는 보존하고 두 키만 additive로 병합한다.
  - `.github/workflows/harness.yml` — CI 게이트(공용 composite action 호출).
  - docs 스캐폴드(`AGENTS.md`, `docs/raw/README.md`, `docs/wiki/index.md`).
  - (opt-in) git 훅(`pre-commit`·`commit-msg`).
- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- 하네스 공유 규칙·템플릿·프로토콜은 플러그인이 제공한다(소비 저장소에서 직접 수정하지 않는다).

## 왜 플러그인인가

- **엔진 사본 제거.** 소비 저장소에 엔진 파일이 없으므로 각 프로젝트가 제각각 수정하는
  drift가 원천 차단된다. 모든 프로젝트가 같은 플러그인 버전을 참조한다.
- **배포 빌드 오염 없음.** 소비 저장소 워킹트리에 하네스 소스가 없으니 CF·Vercel 등 배포
  빌드가 하네스를 끌어올 일이 없다.
- **네이티브 활성화.** Claude Code가 마켓플레이스에서 플러그인을 설치·업데이트한다 — 별도
  설치 스텝·심볼릭 링크 재생성이 필요 없다.

## 신규 적용

Claude Code에서 마켓플레이스를 등록하고 플러그인을 켠 뒤, 소비 프로젝트 루트에서
`/lph-init`을 실행한다.

```text
/plugin marketplace add rlatndud9090/llm-project-harness
/lph-init
```

`/lph-init`(엔진: `scripts/harness/init.mjs`)이 하는 일:

- `.harness.json` 루트 플래그 생성(현재 하네스 버전 기록).
- `.claude/settings.json`에 마켓플레이스 + `enabledPlugins` additive 병합(없으면 생성).
- `.github/workflows/harness.yml` 생성(없을 때만).
- 없을 때만 생성하는 프로젝트 소유 항목:

```txt
AGENTS.md
docs/raw/
docs/raw/README.md
docs/wiki/
docs/wiki/index.md
```

- (opt-in) git 훅 설치(`--no-git-hooks`로 끔). 아래 "git 훅" 참고.

멱등하다. 다시 실행해도 이미 있는 파일은 덮지 않고, `.harness.json`은 version만 현재
버전으로 갱신하며, settings.json은 필요한 키만 병합한다.

### 마지막 정합 버전 기록 (lph-doctor의 기준점)

`/lph-init`이 `.harness.json`에 쓰는 `version` 필드는 **이 소비 프로젝트가 마지막으로
정합(reconcile)한 lph 버전**이다. init은 항상 이 값을 현재 플러그인 버전
(`.claude-plugin/plugin.json`)으로 확정한다 — 즉 init이 끝나면 이 프로젝트는 그 버전에
정합된 것으로 기록된다. `$lph-doctor`가 이후 세션에서 이 값과 설치된 플러그인 버전을 비교해
버전 범프·배선 drift를 감지하고, 버전 사이에 쌓인 소비자 정합 조치(`harness/reconcile.md`)를
제시한다. 배선을 바꾸는 버전 업데이트 뒤에는 `/lph-init`을 다시 돌리면(먼저 `--dry-run`) 이
값이 올라가 drift가 해소된다. `.harness.json` 자체가 없으면(아직 한 번도 정합 안 됨)
`$lph-doctor`가 곧장 `/lph-init`을 안내한다.

## 기존 프로젝트에 붙이기 (retrofit)

이미 진행 중인 프로젝트에는 `--retrofit`을 쓴다. 기존 `AGENTS.md`·`docs/wiki/index.md`는
덮어쓰지 않고 marker block만 upsert한다. 먼저 dry-run으로 확인한다.

```text
/lph-init --retrofit --dry-run
/lph-init --retrofit --report lph-init-report.md
```

## git 훅 (선택)

커밋 직전에 `harness:check`와 커밋 메시지의 `관련 문서:` 블록을 강제하려면 훅을 설치한다.
`/lph-init`이 기본으로 설치하며 `--no-git-hooks`로 끈다.

`${CLAUDE_PLUGIN_ROOT}`은 Claude Code 세션 밖(git 훅 실행 시)에서는 정의되지 않으므로, 훅
본문에는 init 시점에 해석한 **플러그인 절대경로**를 구워 넣는다. `pre-commit`은 하네스
아티팩트 검사를, `commit-msg`는 `관련 문서:` 검증을 건다. 기존 훅은 marker로 식별해 비파괴로
갱신하고, 하네스가 아닌 훅이 이미 있으면 덮지 않고 경고만 남긴다.

**버전 결합 주의(재-init 트리거):** 훅에 구워 넣는 절대경로는 init 시점의 플러그인 설치
경로를 가리킨다. 플러그인이 마켓플레이스로 bump되면 엔진·스킬은 자동 갱신되지만 **이 훅
경로는 재-init 전까지 옛 버전을 조용히 가리킨다.** 그래서 세션 시작 시 플러그인이 "설치된
플러그인 버전 > 이 레포에 마지막으로 새긴 배선 버전(`.harness.json` version)"을 감지하면
`/lph-init` 재실행을 넛지한다. **플러그인 bump 후에는 소비 레포에서 `/lph-init`을
다시 돌려 훅 경로를 재-bake하라**(먼저 `--dry-run`으로 확인). 재실행하면 `.harness.json`
version이 올라가 넛지가 저절로 사라진다. 이 훅(로컬)은 CI(우회 불가 계층)의 편의 미러일
뿐이므로, 경로가 잠깐 뒤처져도 승인 게이트의 durable 강제는 CI가 계속 책임진다.

## 로컬 전체 게이트 실행 (개발자용)

플러그인 모델에선 소비 레포에 하네스 npm 스크립트를 두지 않으므로 **`npm run <gate>` 같은
버전-무관 커밋 스크립트는 없다**(커밋된 스크립트가 세션 밖에서 플러그인 경로를 안정적으로 못
찾기 때문 — 그런 shim은 다시 비이식적 baked/탐색 경로를 낳는다). 대신 로컬 전체 게이트는 다음
경로로 돈다.

- **커밋 시 자동** — `pre-commit` 훅이 하네스 아티팩트 검사를 돌린다(위 훅 절대경로 baking).
  개발자가 따로 명령을 외울 필요 없이 `git commit`이 곧 게이트다.
- **수동 즉시 실행** — 커밋 없이 지금 돌리려면 `sh .git/hooks/pre-commit`. (훅에 baked된
  플러그인 절대경로를 그대로 태우므로 세션 밖에서도 동작한다.)
- **세션 내** — `/llm-project-harness:artifact-validation` 스킬(플러그인 엔진 직접 호출).
- **CI(권장)** — `.github/workflows/harness.yml`의 composite action이 **main-타겟 PR마다**
  `check + lint + build + test`를 서버사이드에서 돌린다(문서 전용 PR은 `check`만).

즉 로컬 표준 진입점은 "커밋(=pre-commit 훅)" 또는 "`sh .git/hooks/pre-commit`"이다.

## CI 강제 (승인 게이트의 durable 계층 — 권장)

로컬 pre-commit 훅과 ClaudeCode PreToolUse 가드는 **클라이언트 사이드 편의 장치**다.
`git commit --no-verify`, Bash 직접 쓰기, 파일 rename, MCP/원격 쓰기로 우회할 수 있다.
코드 변경은 전부 PR을 거치므로, **PR을 막는 서버사이드 CI**가 그 변경의 우회 불가 계층이다.
`main`에 **직접** 커밋·push하는 경로는 서버에서 게이트하지 않는다(아래) — 그 경로의 승인·정합
검사는 로컬 pre-commit(`harness:check`)이 막는다.

`/lph-init`이 스캐폴드하는 `.github/workflows/harness.yml`은 **main-타겟 PR마다** 소비자를
checkout하고 공용 composite action(`rlatndud9090/llm-project-harness@main`)으로 하네스 게이트를
돌린다. `push: [main]` 서버 게이트는 두지 않는다 — squash-merge가 main에 올라올 때마다 이미
PR에서 통과한 게이트를 재실행하던 GitHub Actions 분 낭비를 없앤다.

```yaml
# .github/workflows/harness.yml (init이 생성)
name: harness
on:
  pull_request:
    branches: [main] # main-타겟 PR만. main 직접 push는 로컬 pre-commit이 막는다.
concurrency: # 연속 커밋 시 무효화된 중간 게이트를 취소하고 최신 커밋만 게이트
  group: harness-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # git-history 검사(HEAD 대비)·action의 PR base 대비 스코프 판정에 필요
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*' # .nvmrc가 있으면 init이 node-version-file로 대신 생성
          # package-lock.json이 있으면 init이 여기에 `cache: npm`을 더한다
      - uses: rlatndud9090/llm-project-harness@main # docs/ 전용 PR이면 check만, 코드면 full
```

**docs-only 스코프.** action은 PR이 도입한 변경이 `docs/` 하위에만 있으면 `harness:check`만
돌리고(의존성 설치·lint·build·test 건너뜀), 코드 변경·판정 불가·비-PR 이벤트는 full gate를 돈다.
단순 `paths-ignore`로 문서 PR을 통째 스킵하지 않는 이유는 그러면 branch↔raw·승인 원장 정합을 보는
`harness:check`가 함께 누락되기 때문이다 — `harness:check`는 항상 돌리고 lint/build/test만 조건부로 뺀다.

**권장: main 브랜치 보호.** 서버 push 게이트를 뺐으므로, PR이 열릴 땐 green이었지만 머지 시점엔
main보다 뒤처진(behind) 상태로 squash-merge되면 그 **머지 결과**는 재검증되지 않는다. 소비 레포의
`main`에 브랜치 보호 "Require branches to be up to date before merging"(또는 merge queue)을 켜면 이
stale-base 갭이 닫힌다 — PR을 최신 main에 맞춘 뒤에만 머지되므로 PR 게이트가 곧 머지 결과의 게이트가
된다. 승인 원장 정합 자체는 squash가 PR 트리를 쓰므로 `harness:check`가 이미 보장한다(이 갭은
build/test 커버리지에 한정된다).

**노드 버전은 하드코딩하지 않는다.** init은 `.nvmrc`가 있으면 `node-version-file: '.nvmrc'`를, 없으면
최신 LTS(`node-version: 'lts/*'`)를 쓴다. 옛 버전(예: 20)을 못박으면 CI 노드가 소비 프로젝트 런타임보다
낮아 정상 코드를 오탐할 수 있다. 특정 노드가 필요하면 소비 레포에 `.nvmrc`를 두는 것이 단일 진실 소스다.

**기존 소비자 갱신.** 이미 플러그인 CI를 가진 소비 레포의 워크플로는 `/lph-init`이 자동으로 안
바꾼다(손수 넣은 job/matrix 보존). 최신 PR-only 워크플로로 교체하려면 `/lph-init --refresh-workflow`
(먼저 `--dry-run`; 기존은 `.bak` 백업). refresh 없이 재init하면 구버전 CI(서버 push 게이트·concurrency
취소 없음)를 감지해 refresh를 넛지한다.

CI가 없으면 승인 게이트는 "모델 규율 + opt-in 로컬 훅"까지로만 보장된다.

## 옛 설치에서 이관 (devDependency/submodule → 플러그인, 1회)

이미 옛 방식(devDependency 또는 git submodule)으로 하네스를 붙인 소비 프로젝트를 플러그인
모델로 옮긴다. **레포마다 한 번**이다. `/lph-init`이 아래를 자동으로 감지·정리한다
(`--dry-run`으로 미리 확인).

- `.harness` 심볼릭 링크(옛 마운트) 제거.
- `package.json`에서 `llm-project-harness` devDependency, `link.mjs`를 부르는 `postinstall`,
  그리고 **옛 엔진 마운트를 가리키던 하네스 npm 스크립트**(`harness:check`/`harness:gate`/
  `harness:kickoff` 등 — 값이 `.harness/scripts/` 또는 `node_modules/llm-project-harness`를 참조)
  제거. 플러그인 모델에선 소비자가 하네스 npm 스크립트를 두지 않는다(세션=플러그인 스킬,
  CI=composite action). 그 외 스크립트·의존성은 보존한다.
- **lockfile 정합.** `package-lock.json`에서 `llm-project-harness` 항목을 직접 제거한다
  (manifest만 고치고 lock을 두면 `npm ci`가 "lock file does not satisfy package.json"으로
  실패 — action.yml이 lockfile 있으면 `npm ci`를 쓴다). `pnpm-lock.yaml`·`yarn.lock`은
  포맷이 달라 자동 편집하지 않고 재생성(`pnpm install`/`yarn install`)을 경고로 안내한다.
- `.harness-sync`(옛 동기화 원장) 제거.
- 옛 마운트(`.harness`/`node_modules`)를 가리키던 `.codex/`·`.claude/` 어댑터 심볼릭 링크
  제거(실제 로컬 파일은 건드리지 않는다).
- 옛 CI 워크플로(`npm run harness:gate`/`.harness/scripts` 참조)를 composite action 버전으로
  교체(하네스로 안 보이는 커스텀 워크플로는 보존·경고).

### 잔존 참조 리포트 + 수동 후속 (init이 자동 수정하지 않는 것)

위 자동 정리로도 남는 것이 있다 — 라이브 문서·설정·프로즈에 박힌 옛 참조는 **무엇을 어떻게
고칠지 문맥 판단이 필요**해 기계가 함부로 못 고친다. `/lph-init`은 마지막에 tracked 파일을
스캔해 **"Residual references (manual followup)"** 섹션으로 `file:line`을 나열한다(`--report`에
기록되고, `--dry-run`에서도 적용 전 미리 나온다). 전형적으로 손봐야 하는 것:

- `AGENTS.md`·`README.md`·`DEPLOY.md`의 stale 서술("mounted at `.harness`", "서브모듈…",
  `.harness/harness/protocols/…` 경로) → 플러그인 모델 문구로 정정.
- `docs/wiki/index.md` front-matter `authoring_rules`의 `.harness/…` 경로 → 플러그인 경로로.
- 설정 파일(`.gitignore`·`.gitattributes`·`eslint.config.js`·`vite.config.ts`·`vercel.json`)의
  죽은 `.harness` 경로 항목(무해하지만 정리 권장).
- **라이브 프로젝트 스킬**(`.claude/skills/<local>/SKILL.md`)이 `npm run harness:*`를 에이전트가
  실행할 리터럴 명령으로 지시하는 곳 → 소비자 스텝으로 교정(안 고치면 **실행 파손**).

**불변 이력 보존 규칙(가장 틀리기 쉬운 지점):** `docs/raw/**/*.md`(PRD/ADR/notes/state)는
append-only 이력이라 **당시 사실인 `.harness`/`harness:sync` 언급을 그대로 두는 게 정답**이다.
특히 `docs/raw/chore/harness-*/notes.md`는 이전 마이그레이션 기록 그 자체이고, 거기로 향하는
`docs/wiki/index.md` 링크도 의도된 navigation이다. 그래서 잔존 참조 스윕은 `docs/raw/**`를
**의도적으로 제외**한다 — 이 트리는 청소 대상이 아니다.

git submodule로 붙어 있던 경우엔 이관 전에 서브모듈을 먼저 제거한다.

```sh
git submodule deinit -f .harness
git rm -f .harness
rm -rf .git/modules/.harness
```

그 뒤 마켓플레이스 등록 → `/lph-init` 순으로 진행하면 위 정리가 함께 수행된다.

## 실패 모드

- **나쁨:** 하네스 파일을 복사해 각 프로젝트에서 제각각 수정한다.
- **좋음:** 모든 프로젝트가 같은 플러그인 버전을 참조한다.

- **나쁨:** 소비 프로젝트의 `docs/raw/`나 `docs/wiki/`를 하네스에서 공유한다.
- **좋음:** raw/wiki는 프로젝트별로 소유하고, 플러그인은 템플릿과 절차만 공유한다.

- **나쁨:** `.harness.json` 없이 게이트만 돌린다(플러그인이 이 프로젝트를 하네스 대상으로 인식하지 못한다).
- **좋음:** `/lph-init`으로 플래그·활성화·CI를 함께 배선한다.
