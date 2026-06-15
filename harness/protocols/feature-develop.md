# 기능 개발 프로토콜

승인된 PRD/ADR 기반으로 기능을 설계, 구현, 검증, 커밋까지 진행하는 공용
오케스트레이션 절차다. `html-editor-fe` 수준의 강도는 유지하되, 도메인 특수성은
소비 프로젝트의 PRD/ADR과 `AGENTS.md`가 제공한다고 가정한다.

## 입력과 출력

```txt
입력: docs/raw/feature/<slug>/prd.md
출력: 구현 완료 + wiki ingest + harness gate 통과 + Lore commit
```

feature raw unit은 `prd.md`, `adr.md`, `notes.md`를 가진다. 에이전트는 PRD/ADR
초안을 작성할 수 있지만, 사용자 승인 전에는 PRD를 `approved`, ADR을 `accepted`로
바꾸지 않는다. 구현은 승인된 PRD/ADR을 기준으로만 시작한다.

## 역할

| 역할 | 책임 |
| --- | --- |
| `architect` | PRD 분석, ADR 작성, 구현 계획, 인터페이스 경계 정의 |
| `domain-engineer` | 앱 핵심 상태, 명령, 규칙, 데이터 계약, 비즈니스 로직 구현 |
| `ui-engineer` | 사용자-facing 화면, 상호작용, 반응형 UI, 접근성 구현 |
| `test-engineer` | 도메인/통합/UI 검증 전략과 테스트 구현 |
| `integrator` | raw/wiki 검증, gate 실행, 커밋 프로토콜 |

## Phase 0: 실행 모드 결정

1. 현재 branch와 raw path를 확인한다.
2. `docs/raw/feature/<slug>/prd.md`와 `adr.md`를 읽는다.
3. PRD `approved`, ADR `accepted`, `approval:` 근거를 확인한다.
4. 사용자 요청이 신규 구현, 재작업, 부분 수정, PRD 보강 중 무엇인지 분류한다.
5. `$ralplan` 필요 여부와 `$ralph` 실행 여부를 한 줄로 보고한다.

| 조건 | 실행 모드 | 동작 |
| --- | --- | --- |
| 구현 전 PRD/ADR만 있음 | 초기 실행 | Phase 1부터 진행 |
| 구현이 일부 있음 + 같은 PRD | 개선 실행 | 변경 범위만 재계획 |
| 특정 모듈만 수정 | 부분 실행 | 해당 role 중심으로 진행 |
| ADR 결정이 바뀜 | 새 결정 | 기존 ADR superseded 또는 새 ADR 작성 |

## Phase 0.5: 실행 레일 선택

| 조건 | 레일 |
| --- | --- |
| 구조, 데이터, engine, dependency, 다중 모듈 변경 | `$ralplan` 필수 |
| 승인된 branch-sized 구현 | `$ralph` 기본 |
| 오타, 링크, 한 파일의 작은 문서 수정 | solo execute 허용 |

`$ralplan`은 계획/합의 게이트이므로 직접 구현하지 않는다. `$ralph`는 승인된
PRD/ADR 또는 `$ralplan` 산출물을 기준으로 구현과 검증을 완료하는 기본 실행
레일이다.

하네스 submodule 업데이트나 adapter 정리는 이 PRD/ADR 기반 기능 개발 레일의
대상이 아니다. 제품 기능 변경과 분리해 작은 프로젝트 운영 작업으로 처리한다.

## Phase 1: 설계

담당: `architect`

1. `AGENTS.md`, `docs/wiki/index.md`, feature PRD/ADR을 읽는다.
2. 관련 raw unit과 현재 코드 구조를 조사한다.
3. ADR에 아래 결정을 제안으로 기록한다.
   - 채택한 구조
   - 대안 최소 2개
   - 기각 이유
   - 검증 방법
4. 구현 계획을 notes 또는 별도 계획 섹션에 남긴다.
   - domain 작업
   - UI 작업
   - 테스트 작업
   - 파일 경계
   - 위험 요소

게이트:

- ADR이 proposed placeholder 상태이면 구현으로 넘어가지 않는다.
- 사용자가 명시 승인하지 않은 ADR은 `proposed`로 유지한다.
- PRD `approved` 또는 ADR `accepted`로 전환하려면 `approval: "user:YYYY-MM-DD:<근거>"`
  frontmatter가 필요하다.
- 승인 상태가 아닌 PRD/ADR 기반으로 구현하지 않는다. 먼저 `$prd-helper`/`$adr-helper` 또는
  PRD/ADR 승인 라운드로 되돌린다.
- 사용자의 제품 판단이 필요한 질문은 숨기지 않고 보고한다.

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

## Phase 4: 통합

담당: `integrator`

```sh
npm run harness:ingest -- docs/raw/feature/<slug>
npm run harness:gate
```

성공 후 명시적 파일만 stage하고 Lore commit을 작성한다.

## 실패 모드

- **나쁨:** ADR placeholder를 둔 채 구현한다.
- **좋음:** data contract, state model, engine boundary 같은 결정을 ADR에 남긴 뒤 구현한다.

- **나쁨:** 에이전트가 ADR을 작성한 뒤 곧바로 `accepted`로 바꾼다.
- **좋음:** ADR은 `proposed`로 남기고, 형님 승인 후 `approval:` 근거와 함께 `accepted`로 바꾼다.

- **나쁨:** UI가 권한, 가격, 판정, 시뮬레이션 같은 핵심 규칙을 컴포넌트 안에서 직접 계산한다.
- **좋음:** UI는 domain/application result를 렌더링하고 판정은 핵심 로직에 둔다.

- **나쁨:** 새 규칙을 reducer나 component 조건문으로 계속 추가한다.
- **좋음:** 명시적인 rule definition, strategy, trigger/effect 같은 확장 지점으로 분리한다.

## 출력 형식

```md
## 설계 요약
- ADR 결정:
- 대안/기각:

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
