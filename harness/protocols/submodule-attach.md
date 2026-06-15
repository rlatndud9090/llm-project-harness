# Submodule Attach 프로토콜

공용 하네스를 소비 프로젝트에 복사하지 않고 `.harness` git submodule로 장착하는
절차다. 소비 프로젝트는 하네스 버전을 submodule commit으로 pin하고, 필요할 때
명시적으로 업데이트한다.

## 원칙

- 하네스 본체는 소비 프로젝트의 `.harness/` submodule에 둔다.
- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- 하네스 공유 규칙은 `.harness/harness/`에서 읽는다.
- 소비 프로젝트 루트의 `.codex/`, `.claude/`, `.agents/`는 프로젝트 소유 adapter
  surface다.
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
```

`attach-submodule.mjs`가 추가하는 하네스 adapter 링크:

```txt
.codex/agents/*       -> .harness/.codex/agents/*
.codex/skills/*       -> .harness/.codex/skills/*
.claude/agents/*      -> .harness/.claude/agents/*
.claude/commands/*    -> .harness/.claude/commands/*
.claude/skills/*      -> .harness/.claude/skills/*
.agents/skills/*      -> .harness/.agents/skills/*
```

생성되는 package scripts는 `.harness/scripts/harness/*.mjs`를 직접 호출한다.

```json
{
  "scripts": {
    "harness:start": "node .harness/scripts/harness/raw-start.mjs",
    "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
    "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
    "harness:gate": "node .harness/scripts/harness/gate.mjs",
    "harness:hooks": "node .harness/scripts/harness/install-hooks.mjs"
  }
}
```

## pre-commit 훅 (선택)

커밋 직전에 `harness:check`를 강제하려면 소비 프로젝트에서 한 번 설치한다. 하네스
저장소가 자동으로 깔지 않으며 opt-in이다.

```sh
npm run harness:hooks
```

설치 스크립트는 현재 git 저장소의 `pre-commit` 훅에 `npm run harness:check`를
건다. 기존 훅이 있으면 보존하고 안내하며, `--force`로만 교체한다(`.local.bak`
백업을 남긴다). retrofit으로 `harness:*`가 `llm-harness:*`로 보존된 프로젝트는
실행할 명령을 직접 지정한다.

```sh
npm run harness:hooks -- --command "npm run llm-harness:check"
```

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
npm run harness:gate
git status --short
git add .harness
git commit
```

attach를 다시 실행하면 새 하네스 어댑터와 package script를 추가하고, 이름이
바뀌거나 제거된 어댑터의 stale symlink를 기본으로 정리한다.

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
