---
name: lph-init
description: "소비 프로젝트를 LLM Project Harness 플러그인에 적용하거나 옛 devDependency/submodule 설치에서 이관할 때 사용한다. 완료 시 init한 lph 버전을 .harness.json에 마지막 정합 버전으로 기록한다."
---

# LPH Init 어댑터

공용 기준은 `harness/protocols/lph-init.md`다. 하네스는 이제 **Claude Code 플러그인**으로
배포되고, 엔진·스킬·커맨드·에이전트는 전부 플러그인 안에만 있다. 소비 저장소에는 얇은 배선만
남는다 — `.harness` 심볼릭 링크도, devDependency도, 엔진 사본도 없다.

> 예전 이름은 `harness-init`이었다. 슬래시 진입점은 이제 `/lph-init`이다(엔진 스크립트는
> 그대로 `scripts/harness/init.mjs`).

## 무엇을 하나

소비 저장소의 하네스 발자국을 배선한다.

- `.harness.json` — 플러그인이 키로 삼는 루트 플래그(적용 표식 + **마지막 정합 버전**).
- `.claude/settings.json` — `extraKnownMarketplaces` + `enabledPlugins` additive 병합(다른 키 보존).
- `.github/workflows/harness.yml` — CI 게이트(공용 composite action 호출).
- docs 스캐폴드 — `AGENTS.md`, `docs/raw/README.md`, `docs/wiki/index.md`(없을 때만).
- (opt-in) git 훅 — `pre-commit`(하네스 검사)·`commit-msg`(`관련 문서:` 검증).

## 마지막 정합 버전 기록 (lph-doctor 연동)

`/lph-init`은 완료 시 **현재 플러그인 버전을 `.harness.json`의 `version` 필드에 쓴다** — 이 값이
"이 프로젝트가 마지막으로 정합(reconcile)한 lph 버전"이다. `/lph-doctor`가 이후 세션에서 이
값과 설치된 플러그인 버전을 비교해 버전 범프·배선 drift를 감지한다. 그래서 배선을 바꾸는 버전
업데이트 후에는 `/lph-init`을 다시 돌리면(멱등) 훅 경로 재-bake와 함께 이 버전이 올라가
drift가 해소된다. 처음 적용이라 아직 이 값이 없으면 `/lph-doctor`가 `/lph-init`을 안내한다.

## 신규 적용

Claude Code에서 마켓플레이스를 등록·활성화한 뒤 소비 프로젝트 루트에서 실행한다.

```text
/plugin marketplace add rlatndud9090/llm-project-harness
/lph-init
```

멱등하다. 다시 실행해도 기존 파일은 덮지 않고, `.harness.json`은 version만 현재 플러그인
버전으로 갱신하며, settings.json은 필요한 키만 병합한다.

## retrofit / dry-run

이미 진행 중인 프로젝트는 기존 파일을 보존하는 `--retrofit`을 쓴다.

```text
/lph-init --retrofit --dry-run
/lph-init --retrofit --report lph-init-report.md
```

기존 `AGENTS.md`·`docs/wiki/index.md`는 덮지 않고 marker block만 upsert한다.

## CI 워크플로 갱신 (`--refresh-workflow`)

이미 플러그인 CI를 가진 소비 레포의 `.github/workflows/harness.yml`은 기본적으로 안 바꾼다
(손수 넣은 job/matrix 보존). 최신 PR-only 워크플로(서버 push 게이트 제거·concurrency 취소·
`cache: npm`·docs-only 분기)로 교체하려면:

```text
/lph-init --refresh-workflow --dry-run
/lph-init --refresh-workflow
```

기존 워크플로는 `.bak`로 백업한다. refresh 없이 재init하면 구버전 CI(서버 push 게이트 또는
concurrency 취소 없음)를 감지해 refresh를 넛지한다. 하네스로 안 보이는 커스텀 워크플로는
`--refresh-workflow`로도 건드리지 않는다.

## 옛 설치에서 이관

옛 devDependency/submodule 설치는 `/lph-init`이 자동 감지·정리한다: `.harness` 심볼릭
링크 제거, `package.json`의 `llm-project-harness` devDependency와 `link.mjs` postinstall
제거, `.harness-sync` 제거, 옛 마운트를 가리키던 어댑터 심볼릭 링크 제거. 실제 로컬 파일은
건드리지 않는다. git submodule였다면 이관 전에 서브모듈을 먼저 제거한다(자세한 절차는
`harness/protocols/lph-init.md`의 "옛 설치에서 이관" 참고).

소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다. 플러그인이 제공하는
스킬(`/next-feature`, `/kickoff` 등)은 소비 저장소에서 직접 수정하지 않는다.
