---
name: harness-init
description: "소비 프로젝트를 LLM Project Harness 플러그인에 적용하거나 옛 devDependency/submodule 설치에서 이관할 때 사용한다."
---

# Harness Init 어댑터

공용 기준은 `harness/protocols/harness-init.md`다. 하네스는 이제 **Claude Code 플러그인**으로
배포되고, 엔진·스킬·커맨드·에이전트는 전부 플러그인 안에만 있다. 소비 저장소에는 얇은 배선만
남는다 — `.harness` 심볼릭 링크도, devDependency도, 엔진 사본도 없다.

## 무엇을 하나

소비 저장소의 하네스 발자국을 배선한다.

- `.harness.json` — 플러그인이 키로 삼는 루트 플래그(적용 표식 + 버전).
- `.claude/settings.json` — `extraKnownMarketplaces` + `enabledPlugins` additive 병합(다른 키 보존).
- `.github/workflows/harness.yml` — CI 게이트(공용 composite action 호출).
- docs 스캐폴드 — `AGENTS.md`, `docs/raw/README.md`, `docs/wiki/index.md`(없을 때만).
- (opt-in) git 훅 — `pre-commit`(하네스 검사)·`commit-msg`(`관련 문서:` 검증).

## 신규 적용

Claude Code에서 마켓플레이스를 등록·활성화한 뒤 소비 프로젝트 루트에서 실행한다.

```text
/plugin marketplace add rlatndud9090/llm-project-harness
/harness-init
```

멱등하다. 다시 실행해도 기존 파일은 덮지 않고, `.harness.json`은 version만 갱신하며,
settings.json은 필요한 키만 병합한다.

## retrofit / dry-run

이미 진행 중인 프로젝트는 기존 파일을 보존하는 `--retrofit`을 쓴다.

```text
/harness-init --retrofit --dry-run
/harness-init --retrofit --report harness-init-report.md
```

기존 `AGENTS.md`·`docs/wiki/index.md`는 덮지 않고 marker block만 upsert한다.

## 옛 설치에서 이관

옛 devDependency/submodule 설치는 `/harness-init`이 자동 감지·정리한다: `.harness` 심볼릭
링크 제거, `package.json`의 `llm-project-harness` devDependency와 `link.mjs` postinstall
제거, `.harness-sync` 제거, 옛 마운트를 가리키던 어댑터 심볼릭 링크 제거. 실제 로컬 파일은
건드리지 않는다. git submodule였다면 이관 전에 서브모듈을 먼저 제거한다(자세한 절차는
`harness/protocols/harness-init.md`의 "옛 설치에서 이관" 참고).

소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다. 플러그인이 제공하는
스킬(`/llm-project-harness:next-feature`, `/llm-project-harness:kickoff` 등)은 소비 저장소에서
직접 수정하지 않는다.
