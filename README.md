# LLM Project Harness

여러 웹앱, 모바일앱, 게임, 도구 프로젝트에 공통으로 장착할 수 있는 LLM 협업
하네스입니다. Codex, ClaudeCode, 그리고 유사한 에이전트 런타임이 같은
raw/wiki, PRD/ADR, 검증, 커밋 규칙을 따르도록 만드는 공용 제어면입니다.

이 저장소는 제품 앱이 아니며, 소비 프로젝트의 `docs/`를 소유하지 않습니다.
소비 프로젝트가 자기 `docs/raw/`, `docs/wiki/`, `AGENTS.md`, 제품별 스킬과
에이전트를 유지하고, 이 저장소는 `.harness` git submodule로 장착됩니다.

## 구성

```txt
harness/            공용 프로토콜, 역할 정의, raw 템플릿
scripts/harness/    장착, raw 생성, wiki ingest, artifact check, gate 스크립트
.codex/             Codex용 shared skill/agent 어댑터
.claude/            ClaudeCode용 shared command/skill/agent 어댑터
```

`docs/` 네임스페이스는 소비 프로젝트 전용입니다. 이 하네스 저장소 안에는
`docs/harness`, `docs/raw`, `docs/wiki`를 두지 않습니다.

## 소비 프로젝트에 장착하기

소비 프로젝트 루트에서:

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:check
```

장착 스크립트는 없을 때만 아래 프로젝트 소유 파일을 만듭니다.

```txt
AGENTS.md
docs/raw/README.md
docs/wiki/index.md
package.json
```

그리고 런타임이 발견할 수 있도록 root adapter surface에 하네스 제공 항목을
개별 symlink로 노출합니다.

```txt
.codex/agents/*
.codex/skills/*
.claude/agents/*
.claude/commands/*
.claude/skills/*
```

기존 로컬 스킬이나 에이전트는 기본적으로 덮어쓰지 않습니다. 같은 경로에 로컬
파일이 있으면 그것을 프로젝트 override로 보고 보존합니다.

## 기존 프로젝트에 중도 장착하기

이미 진행된 프로젝트에는 `--retrofit`을 사용합니다. 이 모드는 기존
`AGENTS.md`, `docs/wiki/index.md`, 로컬 스킬/에이전트, package script를
프로젝트 고유 자산으로 보존하고 하네스 안내만 marker block 또는 fallback 이름으로
추가합니다.

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --dry-run
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --report harness-retrofit-report.md
npm run harness:check
```

기존 `harness:check` 같은 script가 이미 있으면 하네스 명령은
`llm-harness:check`처럼 `llm-harness:*` fallback으로 추가됩니다. 같은 이름의 로컬
adapter가 있으면 로컬 adapter를 우선하고 하네스 adapter는 `harness-<name>` 링크로
노출합니다.

## 생성되는 package scripts

소비 프로젝트의 `package.json`에는 없을 때만 아래 script를 추가합니다.

```json
{
  "scripts": {
    "harness:kickoff": "node .harness/scripts/harness/kickoff.mjs",
    "harness:ingest": "node .harness/scripts/harness/wiki-ingest.mjs",
    "harness:check": "node .harness/scripts/harness/artifact-check.mjs",
    "harness:gate": "node .harness/scripts/harness/gate.mjs",
    "harness:hooks": "node .harness/scripts/harness/install-hooks.mjs"
  }
}
```

소비 프로젝트는 자기 stack에 맞는 `lint`, `build`, `test:run`을 별도로 제공해야
합니다. `harness:gate`는 harness check 뒤에 그 명령들을 순서대로 실행합니다.

`harness:hooks`는 선택 사항입니다. 실행하면 현재 git 저장소의 `pre-commit` 훅에
`harness:check`를 걸어 정합성이 깨진 커밋을 막습니다. 하네스가 자동으로 설치하지
않으며, 소비 프로젝트가 명시적으로 opt-in 합니다.

## 하네스 업데이트

소비 프로젝트가 이미 구버전 하네스를 달고 있다면, submodule을 올리고 attach를 다시
실행하면 변경이 반영됩니다. 이름이 바뀌거나 제거된 어댑터의 stale symlink는 attach가
기본으로 정리합니다.

```sh
git submodule update --remote .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --dry-run
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:gate
```

attach는 이전 attach가 만든 하네스 symlink 중 타겟이 사라진 것만 지우고, 로컬 파일과
프로젝트 override는 보존합니다. stale 링크를 일부러 남기려면 `--no-prune`을 씁니다.
자세한 절차는 [Submodule Attach 프로토콜](harness/protocols/submodule-attach.md)을
따릅니다.

## 하네스 개발

이 저장소 자체를 작업할 때는 소비 프로젝트용 branch/raw/wiki/PRD/ADR 정책을
강제하지 않습니다. 공유 규칙을 바꿀 때는 먼저 `harness/`를 수정하고, 그 다음
`.codex/`, `.claude/` 어댑터를 맞춥니다.

검증:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

세부 장착 절차는 [Submodule Attach 프로토콜](harness/protocols/submodule-attach.md)을
따릅니다.
