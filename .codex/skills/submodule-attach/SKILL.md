---
name: submodule-attach
description: "공용 LLM Project Harness를 소비 프로젝트에 git submodule로 장착하거나 업데이트할 때 사용한다."
---

# Submodule Attach 어댑터

공용 기준은 `.harness/harness/protocols/submodule-attach.md`다.

## Windows 사전조건 (필수)

어댑터는 symlink다. Git for Windows의 시스템 기본값(`core.symlinks=false`,
`core.autocrlf=true`)으로 clone하면 장착이 **조용히** 무너진다 — 링크 대신 경로가
적힌 텍스트 파일이 체크아웃되고 `git status`는 깨끗하다. 장착 전에 확인한다.

```sh
git config --global core.symlinks true
git config --global core.autocrlf false
git config --unset core.symlinks    # 이미 clone된 저장소는 local 제거가 필수
git config --unset core.autocrlf
git config core.symlinks            # true로 나오는지 확인
```

`--global`만으로는 안 된다: clone 시점에 그 값이 `.git/config`에 복사되고 local이
global을 이긴다. Windows 개발자 모드도 켜야 symlink를 만들 수 있다.

`attach-submodule.mjs`는 첫 링크 전에 이를 진단하고 문제가 있으면 아무것도 바꾸지
않고 중단한다. 텍스트 파일로 이미 깨진 어댑터는 attach 재실행으로 복구된다.
`harness:check`도 그 상태를 어댑터 무결성 오류로 보고한다. 복구 전체 절차와
`.harness` 미초기화 구분법은 `.harness/harness/protocols/submodule-attach.md`를 본다.

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
npm run harness:sync            # 새 CHANGELOG 항목의 소비자 조치를 읽고 반영
npm run harness:sync -- --ack   # 반영 확인(.harness-sync를 CHANGELOG head로 갱신)
npm run harness:gate
```

서브모듈을 올리면 `.harness-sync`가 CHANGELOG head보다 뒤처져 `harness:check`가 막는다.
`harness:sync`로 각 항목의 소비자 조치(예: 위키를 area 체계로 전면 재작성)를 반영한 뒤
`--ack`로 확인해야 통과한다. 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는
프로젝트 소유다. linked 하네스 파일은 소비 프로젝트에서 직접 수정하지 않는다.
