# Harness Init 프로토콜 (Claude Code 플러그인)

공용 하네스를 소비 프로젝트에 **Claude Code 플러그인**으로 적용하는 절차다. 하네스 엔진
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
`/harness-init`을 실행한다.

```text
/plugin marketplace add rlatndud9090/llm-project-harness
/harness-init
```

`/harness-init`(엔진: `scripts/harness/init.mjs`)이 하는 일:

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

## 기존 프로젝트에 붙이기 (retrofit)

이미 진행 중인 프로젝트에는 `--retrofit`을 쓴다. 기존 `AGENTS.md`·`docs/wiki/index.md`는
덮어쓰지 않고 marker block만 upsert한다. 먼저 dry-run으로 확인한다.

```text
/harness-init --retrofit --dry-run
/harness-init --retrofit --report harness-init-report.md
```

## git 훅 (선택)

커밋 직전에 `harness:check`와 커밋 메시지의 `관련 문서:` 블록을 강제하려면 훅을 설치한다.
`/harness-init`이 기본으로 설치하며 `--no-git-hooks`로 끈다.

`${CLAUDE_PLUGIN_ROOT}`은 Claude Code 세션 밖(git 훅 실행 시)에서는 정의되지 않으므로, 훅
본문에는 init 시점에 해석한 **플러그인 절대경로**를 구워 넣는다. `pre-commit`은 하네스
아티팩트 검사를, `commit-msg`는 `관련 문서:` 검증을 건다. 기존 훅은 marker로 식별해 비파괴로
갱신하고, 하네스가 아닌 훅이 이미 있으면 덮지 않고 경고만 남긴다.

## CI 강제 (승인 게이트의 durable 계층 — 권장)

로컬 pre-commit 훅과 ClaudeCode PreToolUse 가드는 **클라이언트 사이드 편의 장치**다.
`git commit --no-verify`, Bash 직접 쓰기, 파일 rename, MCP/원격 쓰기로 우회할 수 있다.
승인 게이트를 **우회 불가능하게** 강제하는 유일한 계층은 서버사이드 CI다.

`/harness-init`이 스캐폴드하는 `.github/workflows/harness.yml`은 push/PR마다 소비자를
checkout하고 공용 composite action(`rlatndud9090/llm-project-harness@main`)으로 하네스
게이트를 돌린다.

```yaml
# .github/workflows/harness.yml (init이 생성)
name: harness
on:
  push:
    branches: [main]
  pull_request:
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # git-history 기반 검사(전이/불변/stage 후퇴)가 HEAD 대비 비교하므로 필요
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: rlatndud9090/llm-project-harness@main
```

CI가 없으면 승인 게이트는 "모델 규율 + opt-in 로컬 훅"까지로만 보장된다.

## 옛 설치에서 이관 (devDependency/submodule → 플러그인, 1회)

이미 옛 방식(devDependency 또는 git submodule)으로 하네스를 붙인 소비 프로젝트를 플러그인
모델로 옮긴다. **레포마다 한 번**이다. `/harness-init`이 아래를 자동으로 감지·정리한다
(`--dry-run`으로 미리 확인).

- `.harness` 심볼릭 링크(옛 마운트) 제거.
- `package.json`의 `llm-project-harness` devDependency와 `link.mjs`를 부르는 `postinstall`
  스크립트 제거(다른 스크립트·의존성은 보존).
- `.harness-sync`(옛 동기화 원장) 제거.
- 옛 마운트(`.harness`/`node_modules`)를 가리키던 `.codex/`·`.claude/` 어댑터 심볼릭 링크
  제거(실제 로컬 파일은 건드리지 않는다).

git submodule로 붙어 있던 경우엔 이관 전에 서브모듈을 먼저 제거한다.

```sh
git submodule deinit -f .harness
git rm -f .harness
rm -rf .git/modules/.harness
```

그 뒤 마켓플레이스 등록 → `/harness-init` 순으로 진행하면 위 정리가 함께 수행된다.

## 실패 모드

- **나쁨:** 하네스 파일을 복사해 각 프로젝트에서 제각각 수정한다.
- **좋음:** 모든 프로젝트가 같은 플러그인 버전을 참조한다.

- **나쁨:** 소비 프로젝트의 `docs/raw/`나 `docs/wiki/`를 하네스에서 공유한다.
- **좋음:** raw/wiki는 프로젝트별로 소유하고, 플러그인은 템플릿과 절차만 공유한다.

- **나쁨:** `.harness.json` 없이 게이트만 돌린다(플러그인이 이 프로젝트를 하네스 대상으로 인식하지 못한다).
- **좋음:** `/harness-init`으로 플래그·활성화·CI를 함께 배선한다.
