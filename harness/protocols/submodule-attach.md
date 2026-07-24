# Submodule Attach 프로토콜

공용 하네스를 소비 프로젝트에 복사하지 않고 `.harness` git submodule로 장착하는
절차다. 소비 프로젝트는 하네스 버전을 submodule commit으로 pin하고, 필요할 때
명시적으로 업데이트한다.

## 원칙

- 하네스 본체는 소비 프로젝트의 `.harness/` submodule에 둔다.
- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- 하네스 공유 규칙은 `.harness/harness/`에서 읽는다.
- 소비 프로젝트 루트의 `.codex/`, `.claude/`는 프로젝트 소유 adapter surface다.
- 장착 스크립트는 하네스 제공 adapter만 개별 symlink로 추가한다.
- 같은 경로에 로컬 adapter가 이미 있으면 프로젝트 override로 보고 덮어쓰지 않는다.
- `docs/harness`, `docs/raw/_templates`, `scripts/harness` symlink를 만들지 않는다.

## Windows 사전조건 (필수)

하네스 어댑터는 `.harness` 안을 가리키는 **symlink**다(프로젝트당 수십 개). Git for
Windows는 시스템 gitconfig에 아래 두 값을 심어서 배포되므로, 이 상태로 clone하면
장착이 **조용히** 무너진다. 아무 경고도 뜨지 않고 `git status`도 깨끗하다.

```sh
git config --show-origin --get core.symlinks   # file:C:/Program Files/Git/etc/gitconfig  false
git config --show-origin --get core.autocrlf   # file:C:/Program Files/Git/etc/gitconfig  true
```

- `core.symlinks=false`: git이 symlink 대신 **타겟 경로가 적힌 한 줄짜리 텍스트
  파일**을 체크아웃한다. 인덱스와 내용이 일치하니 `git status`는 깨끗하고, 스킬
  설명 자리에 링크 경로가 그대로 찍히는 것 말고는 신호가 없다.
- `core.autocrlf=true`: 워킹트리가 CRLF로 체크아웃된다. 하네스의 frontmatter
  검사가 전부 "frontmatter 없음"으로 오판하고, `harness:approve`는 기존 블록 위에
  새 블록을 얹어 PRD/ADR/state를 실제로 손상시킨다. 리눅스 CI는 인덱스(LF)만 보므로
  재현되지 않는다.

`attach-submodule.mjs`는 첫 링크를 만들기 전에 이 조건을 진단하고, 문제가 있으면
**아무것도 바꾸지 않고 중단한다**(절반만 장착된 상태를 남기지 않는다). 진단은 설정
값과 그 **출처**를 함께 보고, 실제로 임시 symlink를 만들어 본다(프로젝트 루트에
`.harness-symlink-probe-*`를 잠깐 만들고 지운다). `--no-env-check` 또는
`HARNESS_SKIP_ENV_CHECK=1`로 끌 수 있지만 권장하지 않는다.

```sh
# 0) Windows 개발자 모드 ON — 설정 > 개인 정보 및 보안 > 개발자용 > 개발자 모드
#    (관리자 권한 없이 symlink를 만들려면 필수)

# 1) 전역 기본값을 덮는다. 이후 clone에 적용된다
git config --global core.symlinks true
git config --global core.autocrlf false

# 2) 이미 clone된 저장소는 local 설정 제거가 필수다
git config --unset core.symlinks
git config --unset core.autocrlf
git config core.symlinks    # true로 나오는지 반드시 확인
```

> **⚠ 전역 설정만으로는 이미 clone된 저장소가 고쳐지지 않는다.** clone 시점에 git이
> 그 값을 저장소의 `.git/config`에 **복사해 둔다.** local이 global을 이기므로
> `--global`을 넣어도 실효값은 여전히 `false`다. 2단계를 빠뜨리면 symlink 재생성이
> 전부 실패한다.

이미 깨진 저장소를 복구할 때는 위 1·2단계 뒤에 아래를 순서대로 실행한다. 4·5단계는
작업 트리가 깨끗할 때만 안전하다.

```sh
git submodule update --init --recursive                                   # 3) 서브모듈 확보
git ls-files -s | awk '$1 == 120000 { print $4 }' | xargs -r rm -f        # 4) 깨진 링크 제거
git checkout -- .                                                        #    인덱스에서 재생성
git rm --cached -rq . && git reset --hard                                 # 5) CRLF 제거(.gitattributes 작성 후)
npm run harness:hooks                                                    # 6) 훅 설치
npm run harness:check                                                    #    검증
```

**순서 주의:** 훅을 먼저 설치하면 안 된다. `pre-commit`이 `npm run harness:check`를
실행하는데 `.harness`가 비어 있으면 스크립트를 찾지 못해 **그 저장소에서 커밋이 전부
막힌다.** 서브모듈 복구(3단계)가 반드시 선행돼야 한다.

`attach`를 다시 실행하면 텍스트 파일로 남은 어댑터는 symlink로 **복구된다**(내용이
정확히 하네스 타겟을 가리킬 때만 교체하므로 프로젝트가 손으로 둔 override는 건드리지
않는다). `harness:check`도 이 상태를 어댑터 무결성 오류로 보고한다.

`.harness`가 빈 디렉터리로 남은 경우(`git clone`에서 `--recurse-submodules`를 빠뜨림)
최종 증상은 "스킬이 안 보인다"로 같다. `git submodule status`의 선행 `-`가 미초기화
표시다. 두 원인이 겹칠 수 있으므로 서브모듈부터 확인한다.

## 신규 프로젝트 장착

소비 프로젝트 루트에서 실행한다.

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:check
```

`attach-submodule.mjs`가 없을 때 생성하는 프로젝트 소유 항목:

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

`.gitattributes`에는 `* text=auto eol=lf`와 바이너리 명시를 심는다. `eol=lf`가
`core.autocrlf`를 이기므로, Windows 기본 설정이 무엇이든 워킹트리가 LF로 체크아웃된다
(위 "Windows 사전조건"의 CRLF 손상을 원천에서 끊는다). 이미 `.gitattributes`가 있으면
덮어쓰지 않고, EOL을 고정하지 않았을 때만 경고한다.

이때 `docs/wiki/index.md`의 초기 골격은
`.harness/harness/templates/wiki/index.md`를 그대로 사용한다. 소비 프로젝트는 이
파일을 출발점으로 삼되, 자기 제품의 방향성과 분류 체계에 맞게 TODO와 카테고리를
채운다. 특히 feature 분류는 다른 프로젝트 taxonomy를 복사하지 말고, 자기 제품에
맞는 세부 카테고리를 필요할 때마다 추가해 간다.

`attach-submodule.mjs`가 추가하는 하네스 adapter 링크:

```txt
.codex/agents/*       -> .harness/.codex/agents/*
.codex/skills/*       -> .harness/.codex/skills/*
.claude/agents/*      -> .harness/.claude/agents/*
.claude/commands/*    -> .harness/.claude/commands/*
.claude/skills/*      -> .harness/.claude/skills/*
```

생성되는 package scripts는 `.harness/scripts/harness/*.mjs`를 직접 호출한다.

```json
{
  "scripts": {
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

최초 장착 시 `attach-submodule.mjs`는 현재 하네스 CHANGELOG head를 `.harness-sync`에
기록한다(소비 프로젝트가 현재 버전에서 정합성 맞춘 상태로 시작). 이후 업데이트 때는
아래 "업데이트"의 정합성 단계를 거친다.

## ClaudeCode background 격리 설정

`attach-submodule.mjs`는 소비 프로젝트의 커밋되는 `.claude/settings.json`에
`worktree.bgIsolation: "none"`을 심는다.

```json
{
  "worktree": {
    "bgIsolation": "none"
  }
}
```

- **이유**: 하네스 소비 프로젝트는 대개 단일 브랜치 개인 레포다. Claude Code의 기본값
  `worktree.bgIsolation: "worktree"`는 background 세션을 git worktree로 강제 격리하는데,
  이는 메인 워킹카피에 쓰는 하네스 플로우(예: `$next-feature`의 `docs/raw/.next-unit`
  anchor 기록, `$kickoff` 골격 생성)를 background에서 막는다. `"none"`은 background
  세션이 워킹카피를 직접 편집하도록 허용한다.
- **비파괴 병합**: 기존 `.claude/settings.json`의 다른 설정은 보존한다. `worktree`
  아래 다른 키(예: hooks/permissions와 무관한 worktree 옵션)도 유지하고
  `bgIsolation`만 추가한다.
- **명시 override 존중**: 이미 `worktree.bgIsolation`이 다른 값으로 지정돼 있으면
  그 값을 그대로 두고 경고만 남긴다. `--force`로만 `"none"`으로 덮어쓴다.
- **opt-out**: `--no-claude-settings`로 이 설정 주입을 건너뛴다.
- Codex에는 대응 설정이 없으므로 `.codex`는 건드리지 않는다.
- worktree 다중 브랜치 워크플로가 필요한 프로젝트(예: 여러 브랜치를 동시에 다루는
  레포)라면 이 값을 프로젝트에서 `"worktree"`로 되돌리거나 `--no-claude-settings`로
  장착한다.

## 선택적 외부 가속기

하네스는 `$deep-interview`, `$ralph`, `$ralplan`, `/team` 같은 oh-my-claudecode/OMX
스킬을 배포하지 않는다. 이들이 설치돼 있지 않아도 하네스는 protocol에 정의된
하네스-네이티브 기본 동작으로 동작한다. protocol이 `$deep-interview`를 명시할 때는
그 스킬을 최우선으로 사용하고, 질문 transport는 deep-interview 내부에서 현재
surface에 맞게 선택한다. `$deep-interview`가 없을 때만 현재 런타임의 구조화 질문
도구로 직접 fallback하고, 그마저 없을 때만 간결한 명시 질문을 사용한다. 구현
레일은 기본적으로 `architect → domain/ui/test → integrator` role 체인으로 진행한다.

## git 훅 (선택)

커밋 직전에 `harness:check`와 커밋 메시지의 `관련 문서:` 블록을 강제하려면 소비
프로젝트에서 한 번 설치한다. 하네스 저장소가 자동으로 깔지 않으며 opt-in이다.

```sh
npm run harness:hooks
```

설치 스크립트는 현재 git 저장소의 `pre-commit` 훅에 `npm run harness:check`를,
`commit-msg` 훅에 `관련 문서:` 블록 검증(verify-commit-msg)을 건다. 기존 훅이
있으면 보존하고 안내하며, `--force`로만 교체한다(`.local.bak` 백업을 남긴다).
retrofit으로 `harness:*`가 `llm-harness:*`로 보존된 프로젝트는 pre-commit이
실행할 명령을 직접 지정한다.

```sh
npm run harness:hooks -- --command "npm run llm-harness:check"
```

## CI 강제 (승인 게이트의 durable 계층 — 권장)

로컬 pre-commit 훅과 ClaudeCode PreToolUse 가드는 **클라이언트 사이드 편의 장치**다.
`git commit --no-verify`, Bash 직접 쓰기(`sed`/`tee`/redirect), 파일 rename, 또는
MCP/원격 API 쓰기로 우회할 수 있다. 승인 게이트(승인 이벤트 없는 `approved`/`accepted`
차단, `state.md` 정합성)를 **우회 불가능하게** 강제하는 유일한 계층은 서버사이드 CI다.

소비 프로젝트는 push/PR마다 `harness:check`(또는 `harness:gate`)를 CI에서 돌리고
main 브랜치를 보호한다. 하네스 저장소의 `.github/workflows/harness.yml`을 출발점으로
쓸 수 있다.

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
          submodules: true
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run harness:check
```

CI가 없으면 승인 게이트는 "모델 규율 + opt-in 로컬 훅"까지로만 보장된다. 진짜
아무도 우회 못 하게 하려면 CI + branch protection이 필요하다.

## 기존 프로젝트에 붙이기

이미 진행 중인 프로젝트에는 `--retrofit`을 사용한다. 신규 프로젝트 장착 경로와
달리 기존 문서, 스킬, 에이전트, package script를 프로젝트 자산으로 보고 보존한다.
먼저 dry-run으로 어떤 항목이 생성, 링크, 보존되는지 확인한다.

```sh
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --dry-run
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --report harness-retrofit-report.md
```

retrofit 동작:

- 기존 `AGENTS.md`와 `docs/wiki/index.md`는 덮어쓰지 않고 marker block만 추가한다.
- 기존 adapter가 있으면 `kept local override`로 남기고, 하네스 adapter는
  `harness-<name>` fallback 링크로 추가한다.
- fallback 링크 경로까지 이미 있으면 자동 교체하지 않고 report에 conflict를 남긴다.
- 기존 `harness:*` package script가 있으면 보존하고, 해당 하네스 명령은
  `llm-harness:*` fallback script로 추가한다.
- 기존 docs 구조를 강제로 옮기지 않는다. 새 작업부터 `docs/raw/`와
  `docs/wiki/index.md` 규칙을 적용한다.

`--json`은 operation/conflict/warning을 기계가 읽기 쉬운 형태로 출력한다.

```sh
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --json
```

검증 명령은 script 충돌 여부에 따라 다르다.

```sh
npm run harness:check
# 또는 retrofit 중 기존 harness:check를 보존한 경우
npm run llm-harness:check
```

의도적으로 기존 adapter를 하네스 링크로 교체하려면 `--force`를 사용한다.
`--force`는 경로를 삭제하고 symlink로 대체하므로 staged diff를 반드시 확인한다.

## 업데이트

소비 프로젝트에서 하네스 최신 버전을 적용할 때:

```sh
git submodule update --remote .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --dry-run
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:sync            # 이후 CHANGELOG 항목의 소비자 조치를 읽는다
# ↳ 각 항목의 소비자 조치를 실제로 반영한다(예: 위키를 최신 정책으로 재작성)
npm run harness:sync -- --ack   # 반영 확인 → .harness-sync를 CHANGELOG head로 갱신
npm run harness:gate
git status --short
git add .harness .harness-sync
git commit
```

### 정합성 단계 (필수, 기계강제)

서브모듈을 최신 커밋으로 올리면 소비 프로젝트의 `.harness-sync`가 하네스
CHANGELOG head보다 뒤처진다. 이때 `harness:check`가 실패한다(정합성 미완료). 반드시
아래를 거친다.

1. `npm run harness:sync` — 마지막으로 맞춘 이후의 CHANGELOG 항목과 **소비자 조치**를 읽는다.
2. 각 항목의 소비자 조치를 실제로 반영한다. 예: 이번 area-lineage 개편은
   `docs/wiki/index.md`를 **영역(area)별 시간순 계보 체계로 전면 재작성**하고, 기존
   `prd.md`/`bugfix.md` frontmatter에 `area:`를 추가하도록 요구한다.
3. `npm run harness:sync -- --ack` — 반영을 확인한다(`.harness-sync`가 head로 갱신).
4. `.harness-sync`를 서브모듈 pointer와 함께 커밋한다.

이 게이트는 서브모듈만 bump하고 정책 변화를 놓치는 drift를 우회 불가능하게 막는다
(로컬 훅과 달리 `harness:check`/CI에서 강제된다).

attach를 다시 실행하면 새 하네스 어댑터와 package script를 추가하고, 이름이
바뀌거나 제거된 어댑터의 stale symlink를 기본으로 정리한다. (`.harness-sync`는 이미
있으면 건드리지 않으므로 정합성 단계를 우회하지 않는다.)

- stale 정리는 기본 동작이라 별도 플래그가 필요 없다.
- 정리 대상은 이전 attach가 만든 symlink 중 하네스에서 타겟이 사라진 것뿐이다.
- 로컬 파일이나 하네스 밖을 가리키는 프로젝트 override는 절대 건드리지 않는다.
- `--dry-run`으로 무엇이 추가/제거되는지 먼저 확인한다.
- stale 링크를 일부러 남기려면 `--no-prune`을 쓴다(경고만 표시한다).
- retrofit으로 장착한 프로젝트는 업데이트도 `--retrofit`을 함께 쓴다.

하네스 submodule은 floating latest가 아니라 commit pin으로 관리한다. 어떤 프로젝트가
어떤 하네스 버전을 쓰는지 git history에 남겨야 재현 가능하다.

### 최신 여부 알림 (warning)

`harness:check`는 소비 프로젝트에서 `.harness`가 원격보다 뒤처져 있으면 **경고만** 남긴다
(best-effort, 네트워크 실패·오프라인·CI·`HARNESS_SKIP_REMOTE_CHECK`에서는 조용히 건너뛴다).
실패시키지 않으므로 작업을 막지 않고, 편한 시점에 위 업데이트 절차로 최신화하도록 알려주는
용도다.

### 하네스 정비 ride-along (브랜치 규율 예외)

서브모듈 최신화와 그 정합화는 **전용 브랜치·워크트리를 새로 파지 않고 지금 작업 중인 브랜치에
chore 커밋 하나로 태워** 반영해도 된다(유일한 branch-per-unit 예외). 정비용 raw unit은 아래로
만든다.

```sh
npm run harness:kickoff -- --type chore --slug harness-update --no-branch
```

`--no-branch`가 브랜치 로직을 꺼서 현재 브랜치를 그대로 둔다. 커밋은 notes-only
(`[Notes](docs/raw/chore/harness-update/notes.md)`)로 남긴다. 자세한 규칙은
`commit-protocol.md`의 "하네스 정비 ride-along"을 따른다.

## 실패 모드

- **나쁨:** 하네스 파일을 복사해 각 프로젝트에서 제각각 수정한다.
- **좋음:** `.harness` submodule을 bump해 모든 프로젝트가 같은 source of truth를 참조한다.

- **나쁨:** 소비 프로젝트의 `docs/raw/`나 `docs/wiki/`를 하네스에서 공유한다.
- **좋음:** raw/wiki는 프로젝트별로 소유하고, 하네스는 템플릿과 절차만 공유한다.

- **나쁨:** 루트 `.codex/` 또는 `.claude/` 전체를 하네스 전용으로 만든다.
- **좋음:** 루트 adapter surface는 프로젝트 소유로 두고, 하네스 adapter는 개별 링크로 추가한다.

- **나쁨:** submodule을 자동으로 최신 branch HEAD에 항상 따라가게 둔다.
- **좋음:** 업데이트 PR/커밋에서 submodule pointer 변경과 gate 결과를 함께 남긴다.
