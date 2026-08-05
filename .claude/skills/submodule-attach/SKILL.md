---
name: submodule-attach
description: "공용 LLM Project Harness를 소비 프로젝트에 npm devDependency로 장착하거나 업데이트할 때 사용한다."
---

# Harness Attach 어댑터

공용 기준은 `.harness/harness/protocols/submodule-attach.md`다. 하네스는 npm
devDependency로 설치되고, `.harness`는 설치된 `node_modules/llm-project-harness`
패키지를 가리키는 심볼릭 링크(Windows는 junction)다. (이름은 옛 방식에서 유지 — 더
이상 git submodule을 쓰지 않는다.)

## Windows 사전조건 (어댑터 symlink — 필수)

`.harness` 마운트는 junction이라 개발자 모드·core.symlinks 없이 만들어진다. 하지만
하네스 **어댑터**(`.claude/*`, `.codex/*`)는 여전히 git에 추적되는 symlink이므로, Git
for Windows 기본값(`core.symlinks=false`, `core.autocrlf=true`)으로 clone하면 장착이
**조용히** 무너진다 — 링크 대신 경로가 적힌 텍스트 파일이 체크아웃되고 `git status`는
깨끗하다. 장착 전에 확인한다.

```sh
git config --global core.symlinks true
git config --global core.autocrlf false
git config --unset core.symlinks    # 이미 clone된 저장소는 local 제거가 필수
git config --unset core.autocrlf
git config core.symlinks            # true로 나오는지 확인
```

`--global`만으로는 안 된다: clone 시점에 그 값이 `.git/config`에 복사되고 local이
global을 이긴다. Windows 개발자 모드도 켜야 symlink를 만들 수 있다.

`attach-submodule.mjs`는 첫 어댑터 링크 전에 이를 진단하고 문제가 있으면 아무것도
바꾸지 않고 중단한다. 텍스트 파일로 깨진 어댑터는 attach 재실행으로 복구되고,
`harness:check`도 그 상태를 어댑터 무결성 오류로 보고한다.

## 신규 장착

소비 프로젝트 루트에서(하네스는 PUBLIC 레포라 무인증, 태그/커밋으로 pin):

```sh
npm i -D github:rlatndud9090/llm-project-harness#<태그 또는 커밋SHA>
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs
npm run harness:check
```

attach는 `.harness` 링크 생성·`.gitignore` 추가·`postinstall` 배선·어댑터 링크·docs
스캐폴드를 한다.

## 기존 프로젝트 retrofit

이미 진행 중인 프로젝트는 기존 파일을 보존하는 `--retrofit`을 쓴다.

```sh
npm i -D github:rlatndud9090/llm-project-harness#<태그>
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs --retrofit --dry-run
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs --retrofit --report harness-retrofit-report.md
npm run harness:check
```

기존 `harness:*` script가 있으면 `llm-harness:*` fallback을, 기존 adapter는
`harness-<name>` fallback 링크를 쓴다.

## 업데이트

devDependency 핀을 새 태그/커밋으로 올린다.

```sh
npm i -D github:rlatndud9090/llm-project-harness#<새 태그>   # 또는 핀 수정 후 npm install
node node_modules/llm-project-harness/scripts/harness/attach-submodule.mjs
npm run harness:sync            # 새 CHANGELOG 항목의 소비자 조치를 읽고 반영
npm run harness:sync -- --ack   # 반영 확인(.harness-sync를 CHANGELOG head로 갱신)
npm run harness:gate
```

핀을 올리면 `.harness-sync`가 CHANGELOG head보다 뒤처져 `harness:check`가 막는다.
`harness:sync`로 각 항목의 소비자 조치를 반영한 뒤 `--ack`로 확인해야 통과한다.

## 서브모듈에서 이관

이미 `.harness` 서브모듈로 붙은 프로젝트의 1회 이관 절차(서브모듈 제거 → devDep 추가
→ attach 재실행 → `harness:sync --ack` → gate)는
`.harness/harness/protocols/submodule-attach.md`의 "서브모듈에서 devDependency로 이관"을
따른다.

소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다. linked 하네스
파일은 소비 프로젝트에서 직접 수정하지 않는다.
