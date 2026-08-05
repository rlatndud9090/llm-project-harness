# Harness Attach 프로토콜 (devDependency)

공용 하네스를 소비 프로젝트에 **npm devDependency**로 장착하는 절차다. 소비 프로젝트는
하네스를 태그(또는 커밋)로 pin하고, 필요할 때 명시적으로 업데이트한다.

> **이름 유지 안내.** 이 파일과 `scripts/harness/attach-submodule.mjs`는 예전 git submodule
> 방식에서 이름을 그대로 물려받았다(참조 안정성·게이트 유지). **더 이상 서브모듈을 쓰지
> 않는다.** 하네스는 devDependency로 설치되고, `.harness`는 설치된 패키지를 가리키는
> 심볼릭 링크다.

## 원칙

- 하네스 본체는 `node_modules/llm-project-harness`(devDependency)에 설치된다.
- `.harness`는 그 패키지를 가리키는 **심볼릭 링크(Windows는 junction)** 다. gitignore되고
  `postinstall`이 매 설치 후 재생성한다(커밋하지 않는다). `.harness/...`를 가리키는 모든
  참조(어댑터·프로토콜·package script)는 링크를 통해 그대로 해결된다.
- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- 하네스 공유 규칙은 `.harness/harness/`에서 읽는다.
- 소비 프로젝트 루트의 `.codex/`, `.claude/`는 프로젝트 소유 adapter surface다.
- 장착 스크립트는 하네스 제공 adapter만 개별 symlink로 추가한다.
- 같은 경로에 로컬 adapter가 이미 있으면 프로젝트 override로 보고 덮어쓰지 않는다.
- `docs/harness`, `docs/raw/_templates`, `scripts/harness` symlink를 만들지 않는다.

## 왜 devDependency인가

- **배포 빌드 오염 제거.** 서브모듈은 소비 프로젝트의 git 워킹트리에 추적되는 소스라
  CF·Vercel 등 배포 빌드가 `.harness`를 끌어왔다. devDependency는 `node_modules`(gitignore)
  안에 있고 앱이 import하지 않으므로 배포 산출물에 안 남는다. 프로덕션 `npm ci --omit=dev`
  이면 아예 설치되지 않는다.
- **워크트리 정리.** 서브모듈이 없으므로 `git worktree remove`가 걸리지 않는다(`--force`
  불필요).
- **무인증 설치.** 하네스 레포는 PUBLIC이라 `github:` git-dep이 npm의 codeload HTTPS
  tarball로 받아진다 — SSH·토큰·npm publish 모두 불필요.
- **핀 재현성.** 태그/커밋으로 pin하고 `package-lock.json`에 해석된 커밋이 기록되므로,
  어떤 프로젝트가 어떤 하네스 버전을 쓰는지 git history로 재현 가능하다(구 서브모듈 커밋
  pin과 동등).

## Windows 사전조건 (어댑터 symlink — 필수)

`.harness` 마운트 자체는 `postinstall`이 **junction**으로 만들어 개발자 모드·`core.symlinks`
없이도 생성된다. 그러나 **하네스 어댑터**(`.claude/*`, `.codex/*`)는 여전히 git에 추적되는
symlink이므로, Git for Windows의 시스템 기본값으로 clone하면 조용히 무너진다.

```sh
git config --show-origin --get core.symlinks   # false면 어댑터가 텍스트 파일로 체크아웃된다
git config --show-origin --get core.autocrlf    # true면 워킹트리가 CRLF가 된다
```

- `core.symlinks=false`: git이 어댑터 symlink 대신 **타겟 경로가 적힌 한 줄짜리 텍스트
  파일**을 체크아웃한다. 인덱스와 내용이 일치하니 `git status`는 깨끗하고, 신호가 없다.
- `core.autocrlf=true`: 워킹트리가 CRLF로 체크아웃돼 frontmatter 검사가 전부 오판한다.
  `.gitattributes`의 `eol=lf`가 이를 막는다(attach가 심는다).

```sh
# 0) Windows 개발자 모드 ON (관리자 권한 없이 symlink 생성)
# 1) 전역 기본값 덮기 (이후 clone에 적용)
git config --global core.symlinks true
git config --global core.autocrlf false
# 2) 이미 clone된 저장소는 local 제거가 필수 (local이 global을 이긴다)
git config --unset core.symlinks
git config --unset core.autocrlf
git config core.symlinks    # true 확인
```

`attach-submodule.mjs`는 첫 어댑터 링크 전에 이를 진단하고, 문제가 있으면 아무것도 바꾸지
않고 중단한다(`--no-env-check` 또는 `HARNESS_SKIP_ENV_CHECK=1`로 끌 수 있으나 권장하지 않음).
텍스트 파일로 깨진 어댑터는 위 1·2단계 뒤 attach 재실행으로 복구된다. `harness:check`도 그
상태를 어댑터 무결성 오류로 보고한다.

## 신규 프로젝트 장착

소비 프로젝트 루트에서 실행한다. 하네스는 PUBLIC 레포라 무인증이며, 재현성을 위해
태그(또는 커밋 SHA)로 pin한다.

```sh
npm i -D github:rlatndud9090/llm-project-harness#<태그 또는 커밋SHA>
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs
npm run harness:check
```

`attach-submodule.mjs`가 하는 일:

- `.harness` 심볼릭 링크 생성(`node_modules/llm-project-harness` 대상; 이미 실제
  디렉터리면 덮어쓰지 않고 경고).
- `.gitignore`에 `.harness`·`node_modules` 추가(없으면 생성).
- package script 추가(없을 때만) — 아래 참고. `postinstall`을 배선한다.
- 없을 때만 생성하는 프로젝트 소유 항목:

```txt
AGENTS.md
docs/raw/
docs/raw/README.md
docs/wiki/
docs/wiki/index.md
package.json
.claude/settings.json
.gitattributes
```

- 하네스 adapter 링크(하네스에 있는 것만 개별 symlink로):

```txt
.codex/agents/*       -> .harness/.codex/agents/*
.codex/skills/*       -> .harness/.codex/skills/*
.claude/agents/*      -> .harness/.claude/agents/*
.claude/commands/*    -> .harness/.claude/commands/*
.claude/skills/*      -> .harness/.claude/skills/*
```

생성되는 package scripts는 `.harness/scripts/harness/*.mjs`를 호출한다(`.harness` 링크로
해결). 여기에 하네스 링크를 매 설치마다 재생성하는 `postinstall`이 더해진다.

```json
{
  "scripts": {
    "postinstall": "node node_modules/llm-project-harness/scripts/harness/link.mjs || true",
    "harness:kickoff": "node .harness/scripts/harness/kickoff.mjs",
    "harness:approve": "node .harness/scripts/harness/approve.mjs",
    "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
    "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
    "harness:sync": "node .harness/scripts/harness/sync.mjs",
    "harness:gate": "node .harness/scripts/harness/gate.mjs",
    "harness:hooks": "node .harness/scripts/harness/install-hooks.mjs"
  }
}
```

`postinstall`의 `|| true`와 `link.mjs`의 never-throw 계약 덕에, 프로덕션 `npm ci --omit=dev`
(하네스 미설치)에서도 설치가 실패하지 않는다 — 마운트만 생성되지 않을 뿐, 앱은 런타임에
하네스가 필요 없으므로 정상이다. 이미 프로젝트에 다른 `postinstall`이 있으면 attach는
덮어쓰지 않고 경고하니, `... link.mjs || true`를 직접 이어 붙인다.

최초 장착 시 `attach-submodule.mjs`는 현재 하네스 CHANGELOG head를 `.harness-sync`에 기록한다
(소비 프로젝트가 현재 버전에서 정합성 맞춘 상태로 시작). 이후 업데이트는 아래 "업데이트"의
정합성 단계를 거친다.

## ClaudeCode background 격리 설정

`attach-submodule.mjs`는 소비 프로젝트의 커밋되는 `.claude/settings.json`에
`worktree.bgIsolation: "none"`을 심는다.

```json
{ "worktree": { "bgIsolation": "none" } }
```

- **이유**: 하네스 소비 프로젝트는 대개 단일 브랜치 개인 레포다. Claude Code 기본값
  `worktree.bgIsolation: "worktree"`는 background 세션을 git worktree로 격리하는데, 이는
  메인 워킹카피에 쓰는 하네스 플로우(`$next-feature` 앵커, `$kickoff` 골격)를 막는다.
  `"none"`은 background 세션이 워킹카피를 직접 편집하게 한다.
- **비파괴 병합**: 기존 설정은 보존하고 `bgIsolation`만 추가한다. 명시 override는
  `--force`로만 덮는다. `--no-claude-settings`로 건너뛴다. Codex엔 대응 설정이 없어 건드리지
  않는다.

## 선택적 외부 가속기

하네스는 `$deep-interview`, `$ralph`, `$ralplan`, `/team` 같은 oh-my-claudecode/OMX 스킬을
배포하지 않는다. 없어도 하네스는 protocol에 정의된 하네스-네이티브 기본 동작
(`architect → domain/ui/test → integrator`)으로 동작한다. protocol이 `$deep-interview`를
명시할 때는 그 스킬을 최우선으로 쓰고, 없으면 현재 런타임의 구조화 질문 도구로 fallback한다.

## git 훅 (선택)

커밋 직전에 `harness:check`와 커밋 메시지의 `관련 문서:` 블록을 강제하려면 소비 프로젝트에서
한 번 설치한다. 하네스가 자동으로 깔지 않으며 opt-in이다.

```sh
npm run harness:hooks
```

`pre-commit`에 `npm run harness:check`, `commit-msg`에 `관련 문서:` 검증을 건다. 기존 훅은
보존하고 `--force`로만 교체한다(`.local.bak` 백업). retrofit으로 `harness:*`가 `llm-harness:*`
로 보존된 프로젝트는 실행할 명령을 직접 지정한다.

```sh
npm run harness:hooks -- --command "npm run llm-harness:check"
```

## CI 강제 (승인 게이트의 durable 계층 — 권장)

로컬 pre-commit 훅과 ClaudeCode PreToolUse 가드는 **클라이언트 사이드 편의 장치**다.
`git commit --no-verify`, Bash 직접 쓰기, 파일 rename, MCP/원격 쓰기로 우회할 수 있다.
승인 게이트를 **우회 불가능하게** 강제하는 유일한 계층은 서버사이드 CI다.

소비 프로젝트는 push/PR마다 `harness:check`(또는 `harness:gate`)를 CI에서 돌리고 main을
보호한다. `npm ci`가 devDependency를 설치하고 `postinstall`이 `.harness` 링크를 만든다 —
**서브모듈 checkout이 필요 없다**(`submodules: true` 제거).

```yaml
# .github/workflows/harness.yml
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
      - run: npm ci # devDependency 설치 + postinstall이 .harness 링크 생성
      - run: npm run harness:check
```

CI가 없으면 승인 게이트는 "모델 규율 + opt-in 로컬 훅"까지로만 보장된다.

## 기존 프로젝트에 붙이기 (retrofit)

이미 진행 중인 프로젝트에는 `--retrofit`을 쓴다. 기존 문서·스킬·에이전트·package script를
프로젝트 자산으로 보존한다. 먼저 dry-run으로 확인한다.

```sh
npm i -D github:rlatndud9090/llm-project-harness#<태그>
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs --retrofit --dry-run
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs --retrofit --report harness-retrofit-report.md
```

retrofit 동작:

- 기존 `AGENTS.md`·`docs/wiki/index.md`는 덮어쓰지 않고 marker block만 추가.
- 기존 adapter는 `kept local override`로 남기고, 하네스 adapter는 `harness-<name>` fallback
  링크로 추가. fallback 경로까지 있으면 자동 교체하지 않고 report에 conflict.
- 기존 `harness:*` package script는 보존하고, 하네스 명령은 `llm-harness:*` fallback으로
  추가. 기존 `postinstall`이 있으면 덮어쓰지 않고 경고(직접 이어 붙인다).

의도적으로 기존 adapter를 하네스 링크로 교체하려면 `--force`를 쓴다.

## 업데이트

소비 프로젝트에서 하네스 최신 버전을 적용할 때 — devDependency 핀을 새 태그/커밋으로 올린다.

```sh
npm i -D github:rlatndud9090/llm-project-harness#<새 태그>   # 또는 package.json 핀 수정 후 npm install
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs --dry-run
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs
npm run harness:sync            # 이후 CHANGELOG 항목의 소비자 조치를 읽는다
# ↳ 각 항목의 소비자 조치를 실제로 반영한다(예: 위키를 최신 정책으로 재작성)
npm run harness:sync -- --ack   # 반영 확인 → .harness-sync를 CHANGELOG head로 갱신
npm run harness:gate
git add package.json package-lock.json .harness-sync .claude .codex
git commit
```

`.harness`는 gitignore되므로 커밋하지 않는다. `package-lock.json`이 해석된 커밋을 pin하니
그것을 함께 커밋해 재현성을 남긴다.

### 정합성 단계 (필수, 기계강제)

핀을 올리면 소비 프로젝트의 `.harness-sync`가 하네스 CHANGELOG head보다 뒤처져
`harness:check`가 실패한다. 반드시 아래를 거친다.

1. `npm run harness:sync` — 마지막으로 맞춘 이후의 CHANGELOG 항목과 **소비자 조치**를 읽는다.
2. 각 항목의 소비자 조치를 실제로 반영한다.
3. `npm run harness:sync -- --ack` — 반영을 확인한다(`.harness-sync`가 head로 갱신).
4. `.harness-sync`를 커밋한다.

attach를 다시 실행하면 새 어댑터·package script를 추가하고, 이름이 바뀌거나 제거된 어댑터의
stale symlink를 기본으로 정리한다(`--no-prune`으로 남길 수 있다). `.harness-sync`는 이미
있으면 건드리지 않으므로 정합성 단계를 우회하지 않는다.

### 최신 여부 알림 (warning)

`harness:check`는 소비 프로젝트에서 하네스 devDependency 핀이 원격 최신 태그보다 뒤처져
있으면 **경고만** 남긴다(best-effort, throttle·오프라인·CI·`HARNESS_SKIP_REMOTE_CHECK`에서는
조용히 건너뜀). 실패시키지 않으므로 작업을 막지 않고, 편한 시점에 위 업데이트 절차로
최신화하도록 알린다.

### 하네스 정비 ride-along (브랜치 규율 예외)

하네스 최신화와 그 정합화는 전용 브랜치·워크트리를 새로 파지 않고 지금 작업 중인 브랜치에
chore 커밋 하나로 태워도 된다(유일한 branch-per-unit 예외). 정비용 raw unit은 아래로 만든다.

```sh
npm run harness:kickoff -- --type chore --slug harness-update --no-branch
```

자세한 규칙은 `commit-protocol.md`의 "하네스 정비 ride-along"을 따른다.

## 서브모듈에서 devDependency로 이관 (기존 프로젝트 1회)

이미 `.harness` git submodule로 붙어 있는 소비 프로젝트를 devDependency 모델로 옮긴다.
**레포마다 한 번**이며, 이 커밋 뒤 배포는 서브모듈 없이 깨끗하게 빌드된다.

```sh
# 1) 서브모듈 완전 제거
git submodule deinit -f .harness
git rm -f .harness
rm -rf .git/modules/.harness            # git이 남기는 서브모듈 메타 청소

# 2) 하네스를 devDependency로 (PUBLIC 레포 → 무인증). 태그/커밋으로 핀
npm i -D github:rlatndud9090/llm-project-harness#<태그 또는 커밋SHA>

# 3) attach 재실행 — .harness 링크 생성 + .gitignore 추가 + postinstall 배선 + 어댑터 재링크
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs

# 4) CI 워크플로에서 submodules: true 제거(있다면)

# 5) 이 CHANGELOG 항목 반영 확인 → 게이트 통과
npm run harness:sync -- --ack
npm run harness:gate

# 6) 커밋: 서브모듈 제거 + package.json(devDep·postinstall) + .gitignore + .harness-sync + 어댑터
git add -A && git commit
```

- 빌드가 하네스 스크립트를 직접 부르면(`prebuild`/`postinstall`) 경로에 `.harness/`가 남았는지
  확인한다 — `.harness` 링크로 그대로 해결되므로 대개 무변경.
- Windows는 `.harness`가 junction이라 개발자 모드·`core.symlinks` 없이 만들어진다. 단 어댑터
  symlink는 위 "Windows 사전조건"이 여전히 적용된다.

## 실패 모드

- **나쁨:** 하네스 파일을 복사해 각 프로젝트에서 제각각 수정한다.
- **좋음:** devDependency 핀을 올려 모든 프로젝트가 같은 source of truth를 참조한다.

- **나쁨:** 소비 프로젝트의 `docs/raw/`나 `docs/wiki/`를 하네스에서 공유한다.
- **좋음:** raw/wiki는 프로젝트별로 소유하고, 하네스는 템플릿과 절차만 공유한다.

- **나쁨:** 루트 `.codex/` 또는 `.claude/` 전체를 하네스 전용으로 만든다.
- **좋음:** 루트 adapter surface는 프로젝트 소유로 두고, 하네스 adapter는 개별 링크로 추가한다.

- **나쁨:** 핀을 floating(`#main`)으로 두고 아무 때나 따라가게 둔다.
- **좋음:** 업데이트 커밋에서 핀 변경(package-lock 포함)과 gate 결과를 함께 남긴다.
