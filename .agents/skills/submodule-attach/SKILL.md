---
name: submodule-attach
description: "공용 LLM Project Harness를 소비 프로젝트에 git submodule로 장착하거나 업데이트할 때 사용한다."
---

# Submodule Attach 어댑터

공용 기준은 `.harness/harness/protocols/submodule-attach.md`다.

## 신규 장착

소비 프로젝트 루트에서:

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:check
```

## 기존 프로젝트 retrofit

이미 진행 중인 프로젝트에 중도 장착할 때는 기존 파일을 보존하는 `--retrofit`을
사용한다.

```sh
git submodule add git@github.com:rlatndud9090/llm-project-harness.git .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --dry-run
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness --retrofit --report harness-retrofit-report.md
npm run harness:check
```

기존 `harness:*` script가 있으면 `llm-harness:*` fallback을 사용한다. 기존
adapter는 프로젝트 override로 보존하고, 하네스 adapter는 `harness-<name>` fallback
링크로 추가된다.

## 업데이트

```sh
git submodule update --remote .harness
node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness
npm run harness:gate
```

소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다. linked
하네스 파일은 소비 프로젝트에서 직접 수정하지 않는다.
