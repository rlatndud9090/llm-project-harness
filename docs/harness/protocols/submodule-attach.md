# Submodule Attach 프로토콜

공용 하네스를 소비 프로젝트에 복사하지 않고 git submodule로 장착하는 절차다.
소비 프로젝트는 하네스 버전을 submodule commit으로 pin하고, 필요할 때 명시적으로
업데이트한다.

## 원칙

- 하네스 본체는 `.harness/` submodule에 둔다.
- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- `docs/harness/`, `scripts/harness/`, Codex/Claude adapter는 `.harness`를
  바라보는 symlink로 둔다.
- 하네스 업데이트는 submodule pointer bump로 추적한다.
- linked harness 파일을 소비 프로젝트에서 직접 수정하지 않는다.

## 신규 프로젝트 장착

소비 프로젝트 루트에서 실행한다.

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:check
```

`attach-submodule.mjs`가 생성하거나 연결하는 항목:

```txt
docs/harness          -> .harness/docs/harness
scripts/harness       -> .harness/scripts/harness
docs/raw/_templates   -> .harness/docs/raw/_templates
.codex/agents/*       -> .harness/.codex/agents/*
.codex/skills/*       -> .harness/.codex/skills/*
.claude/agents/*      -> .harness/.claude/agents/*
.claude/commands/*    -> .harness/.claude/commands/*
.claude/skills/*      -> .harness/.claude/skills/*
```

프로젝트에 `AGENTS.md`, `docs/wiki/index.md`, `docs/raw/README.md`,
`package.json`이 없으면 기본 파일을 만든다. 이미 있으면 덮어쓰지 않는다.

## 기존 프로젝트에 붙이기

기존 파일과 충돌이 있으면 기본 실행은 실패한다. 먼저 기존 파일을 읽고 보존할
내용을 프로젝트 소유 파일로 옮긴 뒤 다시 실행한다.

```sh
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --dry-run
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
```

의도적으로 기존 adapter를 하네스 링크로 교체하려면 `--force`를 사용한다.
`--force`는 경로를 삭제하고 symlink로 대체하므로 staged diff를 반드시 확인한다.

## 업데이트

소비 프로젝트에서 하네스 최신 버전을 적용할 때:

```sh
git submodule update --remote .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:gate
git status --short
git add .harness
git commit
```

하네스 submodule은 floating latest가 아니라 commit pin으로 관리한다. 어떤 프로젝트가
어떤 하네스 버전을 쓰는지 git history에 남겨야 재현 가능하다.

## Package Scripts

장착 스크립트는 아래 script가 없으면 추가한다.

```json
{
  "scripts": {
    "harness:start": "node scripts/harness/raw-start.mjs",
    "harness:ingest": "node scripts/harness/wiki-ingest.mjs",
    "harness:check": "node scripts/harness/artifact-check.mjs",
    "harness:gate": "node scripts/harness/gate.mjs"
  }
}
```

소비 프로젝트는 자기 stack에 맞는 `lint`, `build`, `test:run`을 따로 제공해야
한다. `harness:gate`는 그 세 명령을 순서대로 호출한다.

## 실패 모드

- **나쁨:** 하네스 파일을 복사해 각 프로젝트에서 제각각 수정한다.
- **좋음:** `.harness` submodule을 bump해 모든 프로젝트가 같은 source of truth를 참조한다.

- **나쁨:** 소비 프로젝트의 `docs/raw/`까지 하네스에서 공유한다.
- **좋음:** raw/wiki는 프로젝트별로 소유하고, 하네스는 템플릿과 절차만 공유한다.

- **나쁨:** submodule을 자동으로 최신 branch HEAD에 항상 따라가게 둔다.
- **좋음:** 업데이트 PR/커밋에서 submodule pointer 변경과 gate 결과를 함께 남긴다.
