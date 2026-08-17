# LLM Project Harness

여러 웹앱, 모바일앱, 게임, 도구 프로젝트에 공통으로 장착할 수 있는 LLM 협업
하네스입니다. 소비 프로젝트가 같은 raw/wiki, PRD/ADR, 승인 게이트, 커밋 규칙을
따르도록 만드는 공용 제어면을 **Claude Code 플러그인**으로 배포합니다.

이 저장소는 제품 앱이 아니며, 소비 프로젝트의 `docs/`를 소유하지 않습니다.
소비 프로젝트가 자기 `docs/raw/`, `docs/wiki/`, `AGENTS.md`, 제품별 스킬과
에이전트를 유지하고, 이 저장소는 플러그인으로 설치되어 공용 규칙·스킬·엔진을
제공합니다. 엔진·스킬·커맨드·에이전트는 전부 플러그인 안에만 있고, 소비 저장소는
엔진을 복사하지 않습니다.

## 구성

```txt
.claude-plugin/     플러그인·마켓플레이스 매니페스트(plugin.json, marketplace.json)
commands/           플러그인 슬래시 커맨드 어댑터
agents/             플러그인 에이전트 어댑터
skills/             플러그인 스킬 어댑터
hooks/              플러그인 훅 배선(hooks.json)
action.yml          공용 composite GitHub Action(서버사이드 CI 게이트)
harness/            공용 프로토콜, 역할 정의, raw/wiki 템플릿(source of truth)
scripts/harness/    init, kickoff, wiki ingest, artifact check, gate 엔진 스크립트
```

`docs/` 네임스페이스는 소비 프로젝트 전용입니다. 이 하네스 저장소 안에는
`docs/harness`, `docs/raw`, `docs/wiki`를 두지 않습니다.

소비 프로젝트에 처음 생성하는 `docs/wiki/index.md` 골격은
`harness/templates/wiki/index.md`를 source of truth로 사용합니다.
이 템플릿은 feature를 `Product & Architecture` 같은 큰 바구니가 아니라
프로젝트별 taxonomy로 점진적으로 분류하도록 강제합니다.

## 워크플로·스킬

플러그인이 소비 프로젝트에 제공하는 스킬은 하나의 작업 단위(feature/bugfix/chore)를
아이디어부터 머지까지 끌고 가는 수명주기를 이룹니다. 스킬은
`/llm-project-harness:<name>`으로 노출됩니다.

1. `next-feature` — 다음 작업 단위 후보를 추천하고 하나를 선택합니다.
2. `kickoff` — 확정된 단위의 브랜치·`docs/raw` 디렉터리·템플릿을 생성합니다.
3. `prd-helper` → `adr-helper` — PRD를 인터뷰·리서치·리뷰로 작성하고, 아키텍처
   결정이 필요하면 ADR로 기록합니다.
4. `feature-develop` — PRD/ADR을 근거로 구현·재작업·부분 수정을 진행합니다.
5. `make-pr` — 사전 승인·구현이 끝난 단위를 최종 확정하고 커밋·PR을 만듭니다.
6. `pr-review-check-loop` / `pr-self-loop` — 리뷰 코멘트를 무이슈까지 반영합니다.
7. `merge-and-clean` — PR을 머지하고 브랜치·워크트리를 정리합니다.

`one-shot`은 kickoff부터 리뷰 수렴까지를 사용자 개입 없이 한 번에 진행합니다.
보조 스킬로 `commit-protocol`(검증·명시적 스테이징·`관련 문서:` 링크 커밋),
`wiki-ingest`(raw 작업 단위를 `docs/wiki`에 영역별 시간순으로 연결),
`artifact-validation`·`ui-verification`(산출물·UI 검증)이 있고, 적용·진단은
`lph-init`·`lph-doctor`가 맡습니다.

## 소비 프로젝트에 장착하기

Claude Code에서 마켓플레이스를 등록·활성화한 뒤, 소비 프로젝트 루트에서
`/lph-init`을 실행합니다.

```text
/plugin marketplace add rlatndud9090/llm-project-harness
/lph-init
```

`/lph-init`(엔진: `scripts/harness/init.mjs`)이 소비 저장소의 얇은 발자국을
배선합니다.

- `.harness.json` — 플러그인이 키로 삼는 루트 플래그(적용 표식 + 버전).
- `.claude/settings.json` — 마켓플레이스 + `enabledPlugins` additive 병합(다른 키 보존).
- `.github/workflows/harness.yml` — CI 게이트(공용 composite action 호출).
- docs 스캐폴드(없을 때만) — `AGENTS.md`, `docs/raw/README.md`, `docs/wiki/index.md`.
- (opt-in) git 훅 — `pre-commit`(하네스 검사)·`commit-msg`(`관련 문서:` 검증).

멱등합니다. 다시 실행해도 기존 파일은 덮지 않고, `.harness.json`은 version만 현재
플러그인 버전으로 갱신하며, `.claude/settings.json`은 필요한 키만 병합합니다.
`.harness` 심볼릭 링크도, devDependency도, 엔진 사본도 만들지 않습니다.

## 기존 프로젝트에 중도 장착하기

이미 진행된 프로젝트에는 `--retrofit`을 사용합니다. 이 모드는 기존 `AGENTS.md`,
`docs/wiki/index.md`, 로컬 스킬/에이전트를 프로젝트 고유 자산으로 보존하고 marker
block만 upsert합니다. 먼저 dry-run으로 확인합니다.

```text
/lph-init --retrofit --dry-run
/lph-init --retrofit --report lph-init-report.md
```

플러그인 스킬·커맨드는 namespace(`/llm-project-harness:<name>`)로 노출되므로 로컬
파일과 충돌하지 않습니다. 같은 이름의 로컬 스킬/커맨드가 있으면 로컬 정의가 우선합니다.

## 하네스 업데이트

마켓플레이스에서 플러그인을 갱신하고 `/lph-init`을 다시 실행합니다. 재실행이
훅을 새 플러그인 절대경로로 다시 굽고 `.harness.json`의 version을 갱신합니다.

```text
/plugin marketplace update llm-project-harness
/lph-init
```

모든 소비 프로젝트가 같은 플러그인 버전을 참조하므로 각 프로젝트가 엔진을 제각각
수정하는 drift가 원천 차단됩니다. 정책 변화가 담긴 항목은 `CHANGELOG.md`에 남고,
각 항목의 **소비자 조치**(위키 재작성·frontmatter 추가 등)는 프로젝트가 자기 산출물에
반영합니다.

## 옛 설치에서 이관 (devDependency/submodule → 플러그인)

이미 옛 방식(npm devDependency 또는 git submodule)으로 하네스를 붙인 소비 프로젝트는
`/lph-init`이 **자동으로 이관**합니다(레포마다 한 번, `--dry-run`으로 미리 확인).
`.harness` 심볼릭 링크 제거, `package.json`의 devDependency와 `link.mjs` postinstall
제거, `.harness-sync` 제거, 옛 마운트를 가리키던 어댑터 심볼릭 링크 제거를 함께 수행하며
실제 로컬 파일은 건드리지 않습니다. git submodule였다면 이관 전에 서브모듈을 먼저 제거
합니다(자세한 절차는 [LPH Init 프로토콜](harness/protocols/lph-init.md)의
"옛 설치에서 이관").

## 하네스 개발

이 저장소 자체를 작업할 때는 소비 프로젝트용 branch/raw/wiki/PRD/ADR 정책을
강제하지 않습니다(`main` 직행). 공유 규칙을 바꿀 때는 먼저 `harness/`를 수정하고,
그 다음 루트 `commands/`, `agents/`, `skills/` 어댑터를 맞춥니다.

검증:

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

세부 적용 절차는 [LPH Init 프로토콜](harness/protocols/lph-init.md)을
따릅니다.
