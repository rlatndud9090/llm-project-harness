---
name: knowledge-distill
description: "작업 단위·리뷰 지적·기존 이력에서 레포 고유 함정(gotchas)과 불변식(invariants)을 docs/knowledge에 등록하거나, 쌓인 지식을 정리·소급 도입(bootstrap)할 때 사용한다."
---

# Knowledge Distill 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다. 절차의 정본은
`${CLAUDE_PLUGIN_ROOT}/harness/protocols/knowledge.md`이며, 이 어댑터는 그 위의 표면 배선만 남긴다.

## 필수 로딩

1. `${CLAUDE_PLUGIN_ROOT}/harness/protocols/knowledge.md` — 스키마·라우팅 표·등록 시점·조회 규칙의 정본.
2. `--bootstrap` 모드일 때만 `${CLAUDE_PLUGIN_ROOT}/harness/protocols/knowledge-bootstrap.md` — 소급 절차의 정본.
3. 단위를 다루는 모드면 해당 raw unit의 `state.md`. PRD/ADR 전문은 읽지 않고 엔진/발췌가 낸 절만 본다.

## 모드

| 모드 | 용도 | 핵심 |
|---|---|---|
| `--unit docs/raw/<type>/<slug>` | make-pr/one-shot에서 단위 하나의 등록 | `approve --final` 직후 `record --auto`; `needs-judgment`면 발췌로 증류 |
| `--feedback` | 리뷰 지적에서 레포 고유 함정 등록 | 범용 지적은 `→guideline`; 이벤트 append 후 PR 본문 `## 지식 등록` 갱신 |
| `--consolidate` | `pending` 단위 일괄 정리·중복 통합 | `pending` 목록 → 단위별 증류 → `retire`로 정리 |
| `--bootstrap` | 이력 많은 프로젝트의 소급 도입 | 부트스트랩 프로토콜(plan → 비용 확인 → 영역별 배치 → finalize) |
| `--seed` | 이력이 적은 프로젝트의 빈 마커 생성 | `seed` 한 번 (멱등) |

모드 없이 호출되면 `status`로 현재 상태(`inactive|active|bootstrap-in-progress`, 영역별 개수, pending)를 보고
알맞은 모드를 고른다. 마커가 없을 때의 동작은 정본 「레이아웃과 활성화」를 따른다.

## 엔진 호출

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" <sub> ...
```

서브커맨드: `status`, `pending`, `seed`, `brief`, `show`, `refs`, `scaffold`, `record`, `retire`, `reanchor`, `check`,
`bootstrap plan|next-batch|mark|status|finalize`. 인자와 의미는 정본의 "CLI와 단계 대응" 표를 따른다.

## 흐름 (모드 → 정본 절)

각 모드의 절차는 정본이 말한다. 이 어댑터는 어디를 보면 되는지만 가리킨다.

- 후보 거르기: 정본 「넣지 않는 것」 라우팅 표를 먼저 적용한다.
- `--unit`·`--feedback`·`--consolidate`: 정본 「등록 시점」 1·2·4 (무인 구간 G의 `(미확인)`은 3).
- `--bootstrap`: `knowledge-bootstrap.md`. 비용 확인을 받은 뒤 영역별 `next-batch` → `mark` 루프를 돈다.
- 등록 뒤 검증: `refs <ID…>`와 소비 프로젝트의 `harness:check`. PR 본문 `## 지식 등록` 절은 정본 「등록 시점」 1.

**등록은 승인 게이트가 아니다.** 등록할 때마다 사용자에게 묻지 않고, 승인 상태(`approve.mjs`·`state.md` 승인 줄)를 바꾸지 않는다.
근거 결정의 승인은 출처 PRD/ADR이 담당한다. 전체 카탈로그를 통째로 읽지 말고 항상 `brief`로 필요한 만큼만 꺼낸다.
프로젝트 문서는 한국어로 작성한다.

## Claude Code — 단계 핸드오프 종료 (필수)

사람 결정이 필요한 지점에서는 턴을 산문 보고로 끝내지 말고 **`AskUserQuestion`으로 끝낸다.** Claude Code는 사용자 입력
대기로 끝난 턴만 세션을 **Needs input**으로 분류해 FleetView 배지·`agent_needs_input` 알림·탭 제목을 띄운다 — 산문 "완료"로
끝내면 **Done(Idle)**으로 분류돼 background·다중 세션에서 알림이 안 떠 사용자가 놓친다.

- 이 스킬의 질문 지점: **`--bootstrap`의 비용 확인**(`plan` 예상 토큰을 보여주고 "진행 / 영역 선택 / 중단"), 그리고 부트스트랩 PR 직전
  "지식 N건(미확인 M건) 등록 완료 — `$make-pr`로 마무리할까요?" 핸드오프. 그 밖의 개별 항목 등록은 묻지 않는다.
- **기계 대기는 예외**: 서브에이전트·`Workflow` 결과를 기다리는 중간 상태는 Working이 정답이니 질문으로 끝내지 않는다.
- **`$one-shot` 등 무인 오케스트레이터 구간에는 적용하지 않는다**(자동 체이닝; 정지 조건에서만 질문). 무인 구간의 등록 G는 `(미확인)`이 기본이다.
