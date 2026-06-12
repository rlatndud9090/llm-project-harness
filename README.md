# LLM Project Harness

여러 웹앱, 모바일앱, 게임 프로젝트에 공통으로 장착할 수 있는 LLM 협업 하네스입니다.
Codex와 ClaudeCode가 같은 raw/wiki, PRD/ADR, 커밋, 검증 규칙을 읽도록 만드는
공용 제어면을 제공합니다.

이 저장소는 제품 앱을 담지 않습니다. 소비 프로젝트는 자기 코드와 자기
`docs/raw/`, `docs/wiki/`를 유지하고, 이 저장소의 하네스 레이어를 `.harness`
git submodule로 참조합니다.

## 구성

```txt
docs/harness/      공용 프로토콜과 역할 정의
docs/raw/          이 하네스 저장소 자체의 변경 이력
docs/wiki/         이 하네스 저장소의 얇은 wiki index
.codex/            Codex용 skill/agent 어댑터
.claude/           ClaudeCode용 command/skill/agent 어댑터
scripts/harness/   raw 생성, wiki ingest, artifact check, gate 스크립트
```

## 핵심 원칙

- 프로젝트 작성 문서는 한국어를 기본으로 한다.
- 작업 단위는 `feature/<slug>`, `bugfix/<slug>`, `chore/<slug>` 브랜치와
  `docs/raw/<type>/<slug>/` 경로를 1:1로 맞춘다.
- 열린 제품 작업은 `$do-next`에서 후보 선정, PRD/ADR 작성, 명시 승인까지
  진행하고 구현은 시작하지 않는다.
- 승인된 PRD/ADR 기반 구현은 별도 요청에서 시작한다.
- 하네스 자체 변경은 제품 PRD/ADR 자동구현 레일이 아니라 `chore` notes로
  추적한다.
- 모든 의미 있는 커밋은 Lore Commit Protocol과 `관련 문서:` 블록을 가진다.

## 명령

```sh
npm run harness:start -- --type chore --slug harness-change --title "하네스 변경"
npm run harness:ingest -- docs/raw/chore/harness-change
npm run harness:check
npm run harness:gate
```

`harness:gate`는 artifact check, lint, build, test를 순서대로 실행합니다.
이 저장소의 build는 앱 번들이 아니라 하네스 스크립트 문법 검증입니다.

## 소비 프로젝트에 장착하기

소비 프로젝트 루트에서:

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:check
```

장착 스크립트는 `docs/harness`, `scripts/harness`, `.codex`, `.claude` adapter를
`.harness` submodule로 연결하고, 프로젝트 소유 `AGENTS.md`, `docs/raw/`,
`docs/wiki/index.md`, `package.json`이 없으면 기본 파일을 만듭니다.

하네스 업데이트는 소비 프로젝트에서 submodule pointer를 올리는 커밋으로 남깁니다.

```sh
git submodule update --remote .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:gate
```

세부 절차는 [Submodule Attach 프로토콜](docs/harness/protocols/submodule-attach.md)을
따릅니다.
