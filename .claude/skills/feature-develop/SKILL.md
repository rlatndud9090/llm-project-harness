---
name: feature-develop
description: "PRD/ADR 기반 기능 구현, 재작업, 부분 수정을 진행할 때 사용한다."
---

# Feature Develop 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다.

## 필수 로딩

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `.harness/harness/protocols/feature-develop.md`
4. 현재 raw unit의 PRD/ADR/notes
5. 관련 role 문서: `.harness/harness/roles/`

## 실행 원칙

- ADR placeholder 상태에서 구현하지 않는다.
- 사용자 승인 전 PRD를 `approved`, ADR을 `accepted`로 바꾸지 않는다.
- 승인된 PRD/ADR 없이 구현하지 않는다. 먼저 `$prd-helper`/`$adr-helper` 또는 승인 라운드로 되돌린다.
- 구조, 데이터, engine, dependency, 다중 모듈 변경은 `architect` role로 계획을 먼저 확정한다(`$ralplan`이 있으면 계획 게이트로 사용).
- 승인된 branch-sized 구현의 기본 실행 레일은 `architect → domain/ui/test → integrator` role 체인이다(`$ralph`가 있으면 가속기로 사용).
- 구현·테스트·검증 같은 자율 실행은 병렬로 fan-out 할 수 있다. 단 자율 실행 구간 안에서는 사용자에게 묻거나 커밋하지 않고, 모든 인간 승인 게이트와 커밋은 오케스트레이터가 처리한다.
- 하네스 submodule 업데이트나 adapter 정리는 기능 개발 레일과 분리한다.
- domain/UI/test 경계를 분리한다.
- 질문이나 승인 요청이 필요하면 현재 런타임의 구조화 질문 도구를 우선 사용하고,
  구조화 질문 도구가 없을 때만 간결한 명시 질문으로 fallback한다.
- 완료 전 `npm run harness:gate`를 실행한다.
- 커밋이 필요하면 `commit-protocol`을 사용한다.

규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는
한국어로 작성한다.

## Claude Code 실행 (선택)

ClaudeCode에서는 role 체인을 자기 도구로 실행한다(공용 절차는 동일). 공유 프로토콜의
"실행 레인 분리" 원칙에 따라 두 레인을 구분한다.

| 레인 | 담당 | 도구 |
| --- | --- | --- |
| 상호작용(오케스트레이터, 메인 루프) | 전제조건·계획 합의·인간 승인 게이트·커밋 검토/실행 | `AskUserQuestion`, `Skill`, `Bash`(git) |
| 자율 fan-out | 구현 ‖ 테스트 ‖ 검증 병렬 실행과 적대적 검증 | `Agent` 서브에이전트 또는 native `Workflow`(ultracode) |

- 독립적인 `domain-engineer`/`ui-engineer`/`test-engineer` 작업은 한 메시지에서 `Agent`
  서브에이전트로 동시에 띄우는 것이 기본 레일이다.
- 태스크가 많거나 구현→테스트→검증을 태스크별 파이프라인으로 조율하려면 native
  `Workflow`(ultracode)로 동적 fan-out 한다(선택 가속기).
- 형님의 제품 판단이 필요한 결정은 숨기지 말고 (메인 루프에서) `AskUserQuestion`으로 묻는다.
- 구조가 복잡하거나 교차 조율이 필요하면 `/team`으로도 가속할 수 있다(선택).
- 기본 실행 레일은 위 role 체인이고 `Workflow`(ultracode)·`$ralplan`·`$ralph`·`/team`은
  선택적 가속기다. 부재를 이유로 구현을 멈추지 않는다.

### 자율 레인의 제약 (중요)

`Workflow` 스크립트는 백그라운드에서 완결까지 자율 실행되고 내부에서
`agent()/parallel()/pipeline()/log()`만 쓸 수 있다 — 실행 중 사람에게 물을 수단이
없고(`AskUserQuestion` 불가), 그 안에서 `git commit`을 해서는 안 된다. 따라서:

- 전제조건 게이트, 계획 합의, 형님 제품 판단, 커밋 검토·실행 같은 **모든 인간 게이트와
  커밋은 `Workflow` 바깥(메인 루프)** 에 둔다.
- 5개 role은 `Workflow` 내부에서 `agentType`(`architect`/`domain-engineer`/`ui-engineer`/
  `test-engineer`/`integrator`)으로 디스패치한다.
- `Workflow`는 구현·테스트·검증 결과만 반환한다. 메인 루프가 그 결과로
  `npm run harness:gate`를 판정하고, 통과 시에만 `commit-protocol`로 커밋한다.

### Workflow 골격 (대표 형태 — plan.md에 맞춰 동적 구성)

```js
export const meta = {
  name: 'feature-develop-impl',
  description: '<feature> 구현·테스트·검증 (커밋 제외)',
  phases: [{ title: '구현' }, { title: '테스트' }, { title: '검증' }],
}

const VERIFY_VERDICT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } },
  required: ['ok'],
}

// plan.md에서 파싱한 태스크 목록을 args로 받는다: [{id, agentType, prompt}, ...]
// 부분 재실행이면 변경된 태스크만 넣는다.
const results = await pipeline(
  args.tasks,
  (t) => agent(t.prompt, { agentType: t.agentType, label: `impl:${t.id}`, phase: '구현' }),
  (impl, t) => agent(`${t.id} 산출물의 단위/통합 테스트를 작성·실행하고 결과를 보고하라.`,
                     { agentType: 'test-engineer', label: `test:${t.id}`, phase: '테스트' }),
  (test, t) => agent(`${t.id}의 domain↔UI 경계, 데이터 계약, ADR 결정↔구현 정합을 적대적으로 검증하라.`,
                     { agentType: 'test-engineer', label: `verify:${t.id}`, phase: '검증', schema: VERIFY_VERDICT }),
)
return { results: results.filter(Boolean) }
```

- 태스크가 N개면 N개 체인이 독립 실행된다(병렬). 중대한 경계면은 적대적 다수결(여러
  검증 에이전트가 "반증 시도")로 굳힐 수 있다.
- 게이트 판정과 커밋은 이 스크립트가 아니라 메인 루프에서 한다(위 "자율 레인의 제약").

규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[feature-develop]`를 붙인다.**

- 형식: `result: [feature-develop] {한 줄 요약}`
- 예: `result: [feature-develop] 구현+검증 완료 — N개 파일 변경, harness:gate 통과`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
