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
```

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

## 실패 모드

- **나쁨:** 하네스 파일을 복사해 각 프로젝트에서 제각각 수정한다.
- **좋음:** `.harness` submodule을 bump해 모든 프로젝트가 같은 source of truth를 참조한다.

- **나쁨:** 소비 프로젝트의 `docs/raw/`나 `docs/wiki/`를 하네스에서 공유한다.
- **좋음:** raw/wiki는 프로젝트별로 소유하고, 하네스는 템플릿과 절차만 공유한다.

- **나쁨:** 루트 `.codex/` 또는 `.claude/` 전체를 하네스 전용으로 만든다.
- **좋음:** 루트 adapter surface는 프로젝트 소유로 두고, 하네스 adapter는 개별 링크로 추가한다.

- **나쁨:** submodule을 자동으로 최신 branch HEAD에 항상 따라가게 둔다.
- **좋음:** 업데이트 PR/커밋에서 submodule pointer 변경과 gate 결과를 함께 남긴다.
