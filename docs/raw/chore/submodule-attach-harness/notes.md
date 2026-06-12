---
title: "서브모듈 장착 하네스"
date: "2026-06-12"
status: done # draft | done | rejected
approval:
unit_type: chore
---

# Chore: 서브모듈 장착 하네스

## 맥락

하네스 저장소를 별도로 분리한 목적은 여러 소비 프로젝트가 같은 하네스 source of
truth를 참조하고, 하네스가 보강될 때 각 프로젝트에서 submodule pointer만 올려
업데이트할 수 있게 하는 것이다.

단순 복사는 각 프로젝트에 하네스 사본이 흩어져 동일한 개선을 반복 적용해야 하므로
목표에 맞지 않는다.

## 범위

- 범위에 포함: submodule 장착 프로토콜, 소비 프로젝트 자동 링크 스크립트,
  Codex/Claude skill adapter, README/harness 색인, artifact check 정합성 검사.
- 범위에서 제외: 실제 소비 프로젝트 생성, 여러 프로젝트 일괄 업데이트 도구,
  GitHub Actions 자동 배포, npm package 배포.

## 결정

- 표준 장착 위치는 `.harness` git submodule로 둔다.
- 소비 프로젝트의 `docs/raw`, `docs/wiki`, `AGENTS.md`는 로컬 소유로 유지한다.
- 공유 표면인 `docs/harness`, `scripts/harness`, `.codex`/`.claude` adapter는
  submodule을 가리키는 symlink로 둔다.
- 하네스 업데이트는 submodule pointer bump와 `harness:gate` 결과로 검증한다.

## 검증

- 임시 소비 프로젝트에서 `.harness` symlink를 만든 뒤
  `node .harness/scripts/harness/attach-submodule.mjs --harness-dir .harness` 실행.
- 위 임시 소비 프로젝트에서 `npm run harness:check` 통과.
- `npm run harness:gate` 통과.
