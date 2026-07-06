# 기능 개발 프로토콜

승인된 PRD/ADR 기반으로 기능을 설계, 구현, 검증, 커밋까지 진행하는 공용
오케스트레이션 절차다. 절차와 게이트의 강도는 이 하네스가 유지하고, 도메인
특수성은 소비 프로젝트의 PRD/ADR과 `AGENTS.md`가 제공한다고 가정한다.

## 입력과 출력

```txt
입력: docs/raw/feature/<slug>/prd.md
출력: 구현 완료 + wiki ingest + harness gate 통과 + Lore commit
```

feature raw unit은 `prd.md`, `adr.md`, `notes.md`, `state.md`를 가진다. 에이전트는
PRD/ADR 초안을 작성할 수 있지만, 사용자 승인 전에는 PRD를 `approved`, ADR을
`accepted`로 바꾸지 않는다. 승인 전환은 오직 `harness:approve`로만 하며, 그 근거는
`state.md`의 승인 이벤트에 사용자 발화 verbatim으로 기록된다. 구현은 `state.md`에 승인이
기록된 이후에만 시작한다.

## 역할

| 역할 | 책임 |
| --- | --- |
| `architect` | PRD 분석, ADR 작성, 구현 계획, 인터페이스 경계 정의 |
| `domain-engineer` | 앱 핵심 상태, 명령, 규칙, 데이터 계약, 비즈니스 로직 구현 |
| `ui-engineer` | 사용자-facing 화면, 상호작용, 반응형 UI, 접근성 구현 |
| `test-engineer` | 도메인/통합/UI 검증 전략과 테스트 구현 |
| `integrator` | raw/wiki 검증, gate 실행, 커밋 프로토콜 |

## Phase 0: 승인 게이트 (하드 차단)

구현 앞에 반드시 통과해야 하는 게이트다. 이 게이트를 건너뛰고 구현으로 넘어가지 않는다.

1. 현재 branch와 raw path를 확인한다.
2. **`state.md`를 먼저 읽는다.** `stage`와 `## 승인 이벤트`가 단일 진실원이다(채팅
   히스토리로 승인 여부를 판단하지 않는다).
3. `docs/raw/feature/<slug>/prd.md`와 `adr.md`를 읽고 status와 `approval:` 근거를 확인한다.
4. `npm run harness:check`를 실행해 승인 정합성(승인 이벤트 backing, state↔status)을 확인한다.
5. **차단 조건:** 아래 중 하나라도 참이면 구현하지 않는다.
   - PRD가 `approved`가 아니다.
   - `state.md`에 PRD 승인 이벤트가 없다(사용자 발화 verbatim 미기록).
   - ADR 결정이 필요한데 ADR이 `accepted`가 아니다.

   이 경우 `$prd-helper`/`$adr-helper`로 되돌아가 사용자의 명시 승인을 구조화 질문으로
   받고, 승인 전환은 오직 `harness:approve`로 한다. **에이전트가 스스로 승인을 만들거나
   상태를 전환하지 않는다.**
6. 게이트를 통과했으면 `state.md`의 `stage`를 `implementing`으로 갱신한다.
7. 사용자 요청이 신규 구현, 재작업, 부분 수정, PRD 보강 중 무엇인지 분류한다.
8. 계획 게이트 필요 여부와 실행 레일(기본 role 체인 또는 설치된 가속기)을 한 줄로 보고한다.

| 조건 | 실행 모드 | 동작 |
| --- | --- | --- |
| 구현 전 PRD/ADR만 있음 | 초기 실행 | Phase 1부터 진행 |
| 구현이 일부 있음 + 같은 PRD | 개선 실행 | 변경 범위만 재계획 |
| 특정 모듈만 수정 | 부분 실행 | 해당 role 중심으로 진행 |
| ADR 결정이 바뀜 | 새 결정 | 기존 ADR superseded 또는 새 ADR 작성 |

## Phase 0.5: 실행 레일 선택

레일 분류 기준은 아래 operational 정의를 따른다. 모호하면 무거운 쪽을 택한다.

- 다중 모듈 / 구조 변경: `src/`(또는 동등 최상위 소스 디렉터리) 2개 이상을 건드리거나,
  export된 인터페이스·데이터 계약·영속 포맷을 바꾼다.
- 작은 국소 수정: 한 파일 안의 오타, 링크, 주석, 문서 문장 수준 변경.

| 조건 | 레일 |
| --- | --- |
| 구조, 데이터, engine, dependency, 다중 모듈 변경 | 계획 게이트 필수 |
| 승인된 branch-sized 구현 | role 체인 기본 |
| 오타, 링크, 한 파일의 작은 문서 수정 | solo execute 허용 |

기본 실행 레일은 `architect → domain-engineer/ui-engineer/test-engineer →
integrator` role 체인이다. 계획 게이트가 필요한 변경은 `architect` role로 계획과
합의를 먼저 확정하고, 그 결과를 기준으로만 구현한다.

`$ralplan`/`$ralph`가 설치돼 있으면 각각 계획 게이트와 구현 레일의 가속기로 쓸 수
있다(선택). 설치돼 있지 않아도 위 role 체인으로 동일하게 진행하며, 둘의 부재를
이유로 구현을 멈추지 않는다.

하네스 submodule 업데이트나 adapter 정리는 이 PRD/ADR 기반 기능 개발 레일의
대상이 아니다. 제품 기능 변경과 분리해 작은 프로젝트 운영 작업으로 처리한다.

## 실행 레인: 자율 fan-out과 인간 게이트 분리

구현·테스트·검증처럼 자율적으로 완결되는 작업은 한 번에 fan-out 해 병렬로 실행할 수
있다. 이 자율 실행 구간 안에서는 사용자에게 묻거나 커밋하지 않는다. 전제조건 확인,
계획 합의, 사용자 제품 판단, 커밋 검토·실행 같은 인간 게이트는 오케스트레이터(상호작용
레인)가 맡고, 자율 구간은 결과만 돌려준다. 오케스트레이터는 그 결과로
`npm run harness:gate`를 판정한 뒤에만 커밋 단계로 넘어간다.

자율 실행을 어떤 수단으로 병렬화할지는 도구별 어댑터가 정의한다. 수단과 무관하게 위
분리 원칙(자율 구간 안에서 인간 게이트·커밋 금지)은 동일하게 적용된다.

사용자의 제품 판단이나 승인처럼 질문이 필요한 순간에는 현재 런타임의 구조화 질문
도구를 우선 사용한다. 현재 surface가 실제로 지원할 때만 OMX 구조화 질문 surface를
가속기로 쓰고, 구조화 질문 도구가 없을 때만 간결한 plain-text 질문으로 fallback한다.

## Phase 1: 설계

담당: `architect`

1. `AGENTS.md`, `docs/wiki/index.md`, feature PRD/ADR을 읽는다.
2. 관련 raw unit과 현재 코드 구조를 조사한다.
3. ADR에 아래 결정을 제안으로 기록한다.
   - 채택한 구조
   - 선택지 최소 2개
   - 선택 근거
   - 검증
4. 구현 계획을 notes 또는 별도 계획 섹션에 남긴다.
   - domain 작업
   - UI 작업
   - 테스트 작업
   - 파일 경계
   - 위험 요소

게이트:

- ADR이 proposed placeholder 상태이면 구현으로 넘어가지 않는다.
- 사용자가 명시 승인하지 않은 ADR은 `proposed`로 유지한다.
- PRD가 아직 `review`이고 ADR이 `proposed`이면 사용자에게 **구조화 질문으로** 명시 승인을
  요청한다(대상 문서와 전환 상태를 명시). 사용자가 분명히 승인하면 그 발화를 그대로 인용해
  `npm run harness:approve -- --unit docs/raw/feature/<slug> --quote "<발화>" [--adr]`로만
  전환한다. 에이전트가 직접 frontmatter status를 고치지 않는다(런타임 훅과 `harness:check`가 막는다).
- "이렇게 하려고 했어" 같은 의도·아이디어 발화는 승인이 아니다. 모호하면 승인이 아니다.
- 사용자 승인을 받지 못했으면 구현하지 않고 `$prd-helper`/`$adr-helper`로 되돌린다.
- 사용자의 제품 판단이 필요한 질문은 숨기지 않고 보고하며, 현재 런타임의 구조화
  질문 도구를 우선 사용한다.

## Phase 2: 구현

담당: `domain-engineer`, `ui-engineer`

domain 작업:

- UI framework 의존을 최소화하고 테스트 가능한 핵심 로직으로 작성한다.
- 명령, 이벤트, 상태 변경, 외부 효과, 표시용 상태를 분리한다.
- 확장 규칙은 한 곳의 조건문에 누적하지 않고 명시적인 정책/전략/핸들러로 모델링한다.

UI 작업:

- UI는 domain/application state를 렌더링한다.
- 사용자 입력, 상태 표시, 결과 공유 같은 표면은 domain-specific rule 계산과 분리한다.
- 모바일/데스크톱에서 텍스트와 컨트롤이 겹치지 않아야 한다.

## Phase 3: 테스트

담당: `test-engineer`

- 핵심 로직은 단위 테스트를 우선한다.
- UI 변경은 렌더링/상호작용 테스트 또는 명시적 브라우저 검증을 남긴다.
- 테스트가 아직 없는 영역이면 최소 smoke coverage를 추가하거나, 못 하는 이유를
  notes에 남긴다.
- ADR이 있으면 거기 기록한 결정이 실제 구현에 반영됐는지(결정↔구현 정합성)
  확인한다. 불일치는 담당 role에 돌려준다.

## Phase 4: 통합

담당: `integrator`

```sh
npm run harness:ingest -- docs/raw/feature/<slug>
npm run harness:gate
```

이 `harness:ingest`는 wiki lineage의 **둘째 touch**다(멱등 — `$prd-helper`의 첫 링크를
중복 없이 재확인). 구현·결정이 확정된 지금 계보를 **큐레이션**한다: 이 결정이 같은 area의
이전 결정을 대체하면 이전 줄에 `_(superseded by …)_`, 이 줄에 `_(현재)_`를 단다
(`wiki-ingest.md` "실행 시점", `adr-helper.md` 참고). 성공 후 명시적 파일만 stage하고
Lore commit을 작성한다.

## 실패 모드

- **나쁨:** ADR placeholder를 둔 채 구현한다.
- **좋음:** data contract, state model, engine boundary 같은 결정을 ADR에 남긴 뒤 구현한다.

- **나쁨:** 에이전트가 ADR을 작성한 뒤 곧바로 `accepted`로 바꾼다.
- **좋음:** ADR은 `proposed`로 남기고, 사용자 명시 승인 후 `harness:approve --adr`로 `accepted`로 바꾼다.

- **나쁨:** UI가 권한, 가격, 판정, 시뮬레이션 같은 핵심 규칙을 컴포넌트 안에서 직접 계산한다.
- **좋음:** UI는 domain/application result를 렌더링하고 판정은 핵심 로직에 둔다.

- **나쁨:** 새 규칙을 reducer나 component 조건문으로 계속 추가한다.
- **좋음:** 명시적인 rule definition, strategy, trigger/effect 같은 확장 지점으로 분리한다.

## 출력 형식

```md
## 설계 요약
- ADR 결정:
- 선택지/선택 근거:

## 구현 요약
- domain:
- UI:
- tests:

## 검증
- harness:
- lint/build/test:

## 남은 위험
- risk:
```
