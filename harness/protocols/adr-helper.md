# ADR Helper 프로토콜

`$adr-helper`는 ADR을 함께 작성하는 보조 단계다. 구조는 `$prd-helper`와 거의
같다(의견 수집 → 레퍼런스 수집 → 초안 → 지속 리뷰). 다른 점은 다루는 대상이
"제품 요구"가 아니라 "구조 결정"이라는 것이다.

**ADR 작성은 선택이다.** 모든 작업에 ADR이 필요하지는 않다. ADR이 필요한지는
`$prd-helper`의 `## ADR 필요 여부` 단계에서 판단하고, 필요하다고 결론났을 때만
이 단계로 들어온다.

전제: feature raw unit에 `adr.md`와 `state.md`가 있다(`$kickoff`가 생성). ADR은
`proposed` 상태로 작성하고, 사용자 명시 승인 전에는 `accepted`로 바꾸지 않는다.
`accepted` 전환은 오직 `harness:approve --adr`로만 한다.

`$prd-helper`가 ADR 필요로 판정하고 넘겨준 시점에는 PRD가 아직 `review`, `state.md`
`stage`가 `prd-review`다. **PRD 승인은 아직 하지 않는다.** ADR을 `proposed`로 끝까지
작성해 리뷰 상태에 올려 두고, PRD·ADR을 **한 번에** 승인받는다(아래 "승인과 불변성").

## 진입: ADR 단계로 stage를 올린다 (adr.md 잠금 해제)

**이 단계에 들어오면 가장 먼저 `state.md`의 `stage`를 `adr-draft`로 올린다.** 그 전까지는
`adr.md` 편집이 런타임 가드와 `harness:check`로 막혀 있다(PRD 단계에서 ADR로 새는 것을
막는 잠금). `adr-draft`로 올린 뒤에야 `adr.md` 본문을 작성할 수 있다. 초안이 자리를
잡으면 `stage`를 `adr-review`로 갱신한다.

ADR을 다듬다 PRD 요구/수용 기준을 함께 고쳐야 하면 `prd.md`도 같이 수정한다(허용된다).
PRD를 고쳐도 `review`를 유지하며, 승인은 마지막에 PRD·ADR을 한 번에 받는다.

## 이 단계로 들어온 이유 (필요 여부 판단은 `$prd-helper`가 이미 끝냄)

`$prd-helper`가 아래 durable decision 기준에 해당한다고 보고 이 단계로 넘긴 것이다.
ADR 필요 여부는 이미 결론났으니 여기서 다시 뒤집지 않는다(불필요였다면 애초에 이 단계로
오지 않고 PRD 단독 승인으로 갔다). 아래는 그 판단 기준을 참고로 남긴 것이다.

- 데이터 계약, 상태 모델, 저장소 스키마 같은 구조를 정한다.
- 엔진/모듈 경계, 의존성 도입처럼 되돌리기 어려운 선택을 한다.
- 선택지가 여럿이고 채택·기각 근거를 기록으로 남겨야 한다.

## 진행 루프

### Phase 1: 의견 수집

결정해야 하는 선택지와 제약, 사용자가 직접 골라야 하는 경계를 끌어낸다.
`$deep-interview`가 설치돼 있으면 그 스킬을 우선 사용하고, 질문 transport는
deep-interview 내부에서 현재 surface에 맞게 선택한다. `$deep-interview`가 없을
때만 현재 런타임의 구조화 질문 도구로 직접 질문하고, 구조화 질문 도구가 없을
때만 한 번에 하나씩 간결한 명시 질문으로 fallback한다.

### Phase 2: 레퍼런스 수집 (`researcher`)

`researcher` 역할로 선택지별 선행 사례, 트레이드오프, 표준을 조사한다. 출처는
`notes.md`에 남기고 ADR에는 결론과 근거만 반영한다.

### Phase 3: 초안 작성

`feature-adr.md` 템플릿 구조를 그대로 따른다(섹션명을 바꾸지 않는다).

```md
## 컨텍스트
## 결정
## 선택지
## 선택 근거
## 결과
## 후속 작업
## 검증
```

- 컨텍스트는 PRD 요구와 현재 코드/데이터/UX/검증 제약을 적는다.
- 결정은 채택한 구조 하나를 분명히 적는다.
- 선택지는 최소 2개를 비교하고 각각의 장점과 단점을 남긴다.
- 선택 근거는 왜 이 선택지를 채택했는지와 다른 선택지를 택하지 않은 이유(기각 사유)를 적는다.
- 결과는 이 결정이 만드는 긍정적 영향과 트레이드오프를 적는다.
- 후속 작업은 결정 이후 남는 작업을 적는다.
- 검증은 결정이 의도대로 동작하는지 확인할 방법을 적는다.

### Phase 4: 지속 리뷰 (`reviewer`)

`reviewer` 역할로 초안을 반복 검토한다.

- 선택지가 형식적으로만 나열되지 않고 실제로 비교되었는가?
- 선택 근거(채택 이유와 기각 사유)가 납득 가능한가?
- 결정이 PRD의 요구/수용 기준과 충돌하지 않는가?
- placeholder 문장만 있고 실제 결정이 비어 있지 않은가?

## 승인과 불변성 (PRD·ADR 통합 승인)

ADR은 에이전트가 단독으로 `accepted` 처리하지 않는다. 이 단계는 ADR을 `proposed`로만
마무리하고, `state.md`의 `stage`를 `adr-review`로 갱신한다.

**이 단계가 PRD·ADR 통합 승인을 담당한다.** ADR이 필요한 작업 단위는 PRD를 먼저 단독
승인하지 않고, ADR이 리뷰 상태에 오른 뒤 PRD·ADR을 한 번에 승인받는다(ADR 피드백이
PRD 수정으로 이어질 수 있기 때문이다).

1. 현재 런타임의 구조화 질문 도구(ClaudeCode는 `AskUserQuestion`)로 **PRD와 ADR을 함께**
   승인할지 묻는다. 대상 문서(PRD+ADR)와 전환 상태(approved/accepted)를 명시한다. 예:
   "이 PRD와 ADR을 함께 승인할까요? (승인 / 아직)".
2. 사용자가 분명히 승인하면 **그 발화를 그대로 인용**해 한 번의 명령으로 둘 다 전환한다.

```sh
npm run harness:approve -- --unit docs/raw/feature/<slug> --quote "<사용자의 승인 발화 verbatim>" --adr
```

`harness:approve --adr`는 `review` PRD를 `approved`로, `proposed` ADR을 `accepted`로
**원자적으로 함께** 전환하고, 각 status·`approval: "user:YYYY-MM-DD:<근거>"`·`state.md`
승인 이벤트(PRD/ADR 각각)를 한 번에 기록한다. 에이전트가 직접 frontmatter status를
`approved`/`accepted`로 고치지 않는다(런타임 훅과 `harness:check`가 막는다).

**승인으로 간주하지 않는 것:** 결정 방향을 설명하거나 "그렇게 하자" 정도의 대화는
승인이 아니다. 승인은 "이 PRD와 ADR을 approved/accepted로 전환한다"는 명시 요청에 대한
사용자의 분명한 긍정 응답만을 뜻한다. 모호하면 PRD는 `review`, ADR은 `proposed`로 둔다.

accepted ADR 본문은 과거 결정의 근거이므로 고쳐 쓰지 않는다. 결정이 바뀌면 새
ADR을 추가하고 옛 ADR을 `superseded`로 표시한다.

## 다음 단계

PRD/ADR이 모두 자리를 잡고 사용자 승인까지 끝나면 `feature-develop.md`로 넘어가
구현을 시작한다.

## 실패 모드

- **나쁨:** 이 단계에서 ADR 필요 여부를 다시 판단해 "역시 불필요"라며 되돌린다.
- **좋음:** 필요 여부는 `$prd-helper`에서 이미 끝났다고 보고, 여기서는 결정을 기록·비교하는 데 집중한다.

- **나쁨:** 선택지 없이 결정 하나만 적는다.
- **좋음:** 선택지 2개 이상과 선택 근거(채택·기각 사유)를 함께 남겨 결정 근거를 보존한다.

- **나쁨:** 에이전트가 ADR을 작성한 뒤 곧바로 `accepted`로 바꾼다.
- **좋음:** `proposed`로 두고, 사용자 명시 승인 후 `harness:approve --adr`로 `accepted`로 바꾼다.

- **나쁨:** `stage`를 `prd-review`에 둔 채 `adr.md`를 작성하려다 가드에 막힌다.
- **좋음:** 이 단계 진입 시 먼저 `stage`를 `adr-draft`로 올려 잠금을 풀고 `adr.md`를 작성한다.

- **나쁨:** ADR이 필요한데 PRD를 먼저 단독 승인해 버린다.
- **좋음:** PRD를 `review`로 둔 채 ADR을 마무리하고, `harness:approve --adr`로 PRD·ADR을 한 번에 승인한다.
