# /harness-init

소비 프로젝트를 LLM Project Harness 플러그인에 적용(또는 옛 devDependency/submodule 설치에서
이관)한다. 하네스 엔진·스킬·커맨드는 플러그인이 제공하고, 소비 저장소에는 얇은 배선만 남긴다.

## 실행

소비 프로젝트 루트에서 실행한다(엔진은 플러그인 안에 있으므로 `${CLAUDE_PLUGIN_ROOT}`로 부른다).

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/init.mjs" $ARGUMENTS
```

먼저 마켓플레이스를 등록·활성화해 두면 좋다.

```text
/plugin marketplace add rlatndud9090/llm-project-harness
```

## 무엇을 배선하나

- `.harness.json` 루트 플래그(적용 표식 + 버전) 생성.
- `.claude/settings.json`에 `extraKnownMarketplaces` + `enabledPlugins` additive 병합(다른 키 보존).
- `.github/workflows/harness.yml` CI 게이트 생성(없을 때만).
- docs 스캐폴드(`AGENTS.md`, `docs/raw/README.md`, `docs/wiki/index.md`) — 없을 때만.
- (opt-in) git 훅 `pre-commit`·`commit-msg` 설치(`--no-git-hooks`로 끔).

## 옵션

- `--retrofit` : 기존 `AGENTS.md`·위키는 덮지 않고 marker block만 upsert.
- `--dry-run` : 아무것도 바꾸지 않고 적용될 변경만 출력.
- `--report <파일>` : 수행 내역을 마크다운으로 기록.
- `--no-git-hooks` : git 훅 설치를 건너뜀.

멱등하다. 옛 devDependency/submodule 설치(`.harness` 심볼릭 링크, `link.mjs` postinstall,
`.harness-sync`, 옛 어댑터 심볼릭 링크)는 자동 감지·정리한다. 공용 기준은
`harness/protocols/harness-init.md`, 스킬은 `/llm-project-harness:harness-init`.
