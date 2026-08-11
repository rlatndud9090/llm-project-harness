# LPH Doctor 프로토콜

`$lph-doctor`는 소비 프로젝트의 **하네스 정합(reconcile) 상태를 진단·복구**하는 단계다. 각
프로젝트는 마지막으로 정합한 lph 버전을 `.harness.json`의 `version`에 기록해 두는데, 플러그인이
마켓플레이스로 업데이트되면 이 값이 뒤처질 수 있다. doctor는 그 drift를 감지하고, 버전 사이에
쌓인 소비자 조치(`harness/reconcile.md`)를 제시해 프로젝트를 최신 하네스에 다시 맞춘다.

omc의 `omc-doctor`(설치 진단·복구)와 같은 자리다: **진단 → 보고 → 복구(lph-init 재실행)**.

## 언제 쓰나

- 플러그인을 갱신한 뒤(또는 갱신됐는지 모를 때) "이 프로젝트가 최신 하네스에 맞나?" 확인.
- 세션 시작 넛지("플러그인이 vX로 업데이트됐습니다…")를 봤을 때.
- 하네스가 이상하게 동작하거나, 처음 붙이는 프로젝트인지 확실치 않을 때.
- "lph 점검", "하네스 닥터", "정합 확인", "버전 맞나" 등.

## 실행

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/doctor.mjs"
```

엔진은 소비 프로젝트 루트(cwd)에서 돌며 `.harness.json`의 마지막 정합 버전과 설치된 플러그인
버전(`.claude-plugin/plugin.json`)을 비교하고, `harness/reconcile.md`에서 그 사이 구간의 조치만
골라 낸다. **항상 exit 0**이다(진단 도구지 게이트가 아니다). 첫 줄 `[lph-doctor] status=<상태>`로
결과를 준다.

## 진단 상태와 대응 (에이전트 오케스트레이션)

| status | 뜻 | 대응 |
| --- | --- | --- |
| `uninitialized` | `.harness.json` 없음/버전 없음/깨짐 — 아직 정합된 적 없음 | **`/lph-init` 실행**(먼저 `--dry-run`). 마켓플레이스 미등록이면 등록 먼저. 이게 "이전에 정합된 버전이 없으면 lph-init" 경로다. |
| `fresh` | 마지막 정합 == 설치 플러그인 | 정합됨. (선택) `/artifact-validation`으로 산출물 게이트만 재확인. |
| `behind` | 설치 플러그인이 더 최신(버전 범프) | doctor가 낸 `(배선)`/`(산출물)` 조치를 수행: **배선**은 `/lph-init` 재실행(훅 재-bake·`.harness.json` version 갱신), **산출물**은 프로젝트가 손으로 반영. 그 뒤 `/lph-doctor` 재실행이 `fresh`면 완료. |
| `ahead` | 마지막 정합 > 설치 플러그인 | 플러그인이 뒤처짐 → `/plugin marketplace update llm-project-harness` 후 재진단. |
| `undecidable` | 버전 비교 불가(플러그인 버전 못 읽음·비-numeric 태그) | 수동 확인(플러그인 설치·버전 태그). |
| `provider` | 하네스 provider 저장소에서 실행됨 | doctor는 소비 프로젝트용이다. provider는 자기 자신을 정합하지 않는다. |

**핵심 규율:** doctor는 진단만 하고, 실제 복구(특히 `/lph-init` 재실행)는 에이전트가
사용자에게 상태를 보고한 뒤 오케스트레이션한다. `(배선)` 조치는 `/lph-init`이 자동 처리하지만,
`(산출물)` 조치는 프로젝트 판단이 필요하므로 doctor가 요지만 제시하고 사람이 반영한다. 임의로
소비 프로젝트 산출물을 고치지 않는다.

## reconcile 원장과의 관계

`harness/reconcile.md`가 버전별 소비자 조치의 단일 출처다. provider는 **매 버전 범프마다** 그
원장에 현재 버전 항목을 추가하고(조치 없으면 `- (없음)`), `harness:check`가 현재 버전 항목의
존재를 기계강제한다. doctor는 이 원장을 파싱해 `(마지막 정합, 설치 버전]` 구간만 보여 준다.

## 마지막 정합 버전은 어떻게 기록되나

`/lph-init`이 완료 시 `.harness.json`의 `version`을 현재 플러그인 버전으로 확정한다(상세는
`lph-init.md`의 "마지막 정합 버전 기록"). 즉 정합의 기록·갱신은 `/lph-init`이, 그 기록을 읽어
drift를 판정·제시하는 것은 `/lph-doctor`가 맡는다.

## 실패 모드

- **나쁨:** 버전이 뒤처졌는데 `/lph-init` 재실행 없이 배선(훅 baked 경로·CI)이 옛 버전을 가리킨 채 둔다.
- **좋음:** `behind`면 `(배선)` 조치대로 `/lph-init`을 재실행해 배선과 `.harness.json` version을 함께 올린다.

- **나쁨:** `.harness.json`이 없는 프로젝트에서 doctor 없이 배선만 손으로 만들어 정합 기록이 비게 둔다.
- **좋음:** `uninitialized`면 `/lph-init`으로 배선과 마지막 정합 버전을 함께 심는다.

- **나쁨:** `(산출물)` 조치를 에이전트가 임의로 소비 산출물에 반영해 버린다.
- **좋음:** `(산출물)`은 요지만 제시하고 프로젝트가 판단해 반영한다.
