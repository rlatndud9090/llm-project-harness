---
name: lph-doctor
description: "소비 프로젝트의 하네스 정합 상태를 진단한다 — 마지막 정합 버전(.harness.json)과 설치된 플러그인 버전을 비교해 버전 범프·배선 drift를 감지하고, 사이에 낀 소비자 조치를 제시하며, 아직 정합된 적 없으면 lph-init을 안내한다."
---

# LPH Doctor 어댑터

공용 기준은 `harness/protocols/lph-doctor.md`다. 소비 프로젝트가 최신 하네스에 정합돼 있는지
진단하고, 뒤처졌으면 복구(주로 `/lph-init` 재실행)를 오케스트레이션한다.

## Trigger
- `/lph-doctor` 명령.
- "lph 점검", "하네스 닥터", "정합 확인", "버전 맞나", 세션 시작 drift 넛지를 봤을 때.

## 실행

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/doctor.mjs"
```

소비 프로젝트 루트에서 돈다. `.harness.json`의 마지막 정합 버전과 설치된 플러그인 버전
(`.claude-plugin/plugin.json`)을 비교하고, `harness/reconcile.md`에서 그 사이 조치만 골라 낸다.
항상 exit 0이며 첫 줄 `[lph-doctor] status=<상태>`로 결과를 준다.

## 상태별 대응

- `uninitialized` — 아직 정합된 적 없음(`.harness.json` 없음/버전 없음/깨짐). **`/lph-init`을
  실행**한다(먼저 `--dry-run`). 마켓플레이스 미등록이면 `/plugin marketplace add
  rlatndud9090/llm-project-harness` 먼저. (이것이 "이전 정합 버전이 없으면 lph-init" 경로다.)
- `fresh` — 정합됨. 필요하면 `/artifact-validation`으로 산출물 게이트만 재확인.
- `behind` — 버전 범프 감지. doctor가 낸 `(배선)` 조치는 **`/lph-init` 재실행**으로, `(산출물)`
  조치는 프로젝트가 손으로 반영한다. 그 뒤 `/lph-doctor`가 `fresh`면 완료.
- `ahead` — 플러그인이 뒤처짐 → `/plugin marketplace update llm-project-harness` 후 재진단.
- `undecidable` — 버전 비교 불가 → 수동 확인.
- `provider` — provider 저장소에서 실행됨(doctor는 소비 프로젝트용).

## 규율

doctor는 **진단만** 한다. 실제 복구(`/lph-init` 재실행 등)는 사용자에게 상태를 보고한 뒤
오케스트레이션한다. `(산출물)` 조치는 프로젝트 판단이 필요하므로 임의로 소비 산출물을 고치지
말고 요지만 전달한다. 상세는 `harness/protocols/lph-doctor.md`.
