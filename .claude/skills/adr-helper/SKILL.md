---
name: adr-helper
description: "PRD에서 ADR이 필요하다고 결론났을 때 아키텍처 결정을 기록한다."
---

# ADR Helper 어댑터

공용 기준은 `.harness/harness/protocols/adr-helper.md`다. ADR 작성은 선택이며,
`$prd-helper`의 ADR 필요 여부 판단에서 필요하다고 결론났을 때만 사용한다.

## 실행 순서

1. `.harness/harness/protocols/adr-helper.md`를 읽는다.
2. **진입 즉시 `state.md`의 `stage`를 `adr-draft`로 올린다** — 그래야 `adr.md` 편집 잠금이 풀린다(그 전에는 런타임 가드와 `harness:check`가 막는다).
3. 결정 선택지와 제약을 끌어낸다(`$deep-interview`가 있으면 그 스킬을 우선 사용하고, 없으면 현재 런타임의 구조화 질문 도구를 우선 사용하며 그마저 없을 때만 명시 질문).
4. `.harness/harness/roles/researcher.md`로 선택지별 트레이드오프를 조사한다.
5. `.harness/harness/roles/architect.md`로 결정/선택지/선택 근거/결과/검증을 `adr.md`에 작성하고, 초안이 서면 `stage`를 `adr-review`로 갱신한다.
6. `.harness/harness/roles/reviewer.md`로 선택지 비교와 placeholder를 검토한다. ADR 피드백으로 PRD 수정이 필요하면 `prd.md`도 함께 고친다(PRD는 `review` 유지).

ADR은 `proposed` 상태로 작성하고, 사용자 명시 승인 전에는 `accepted`로 바꾸지
않는다. accepted ADR 본문은 고쳐 쓰지 않는다.

**PRD·ADR 통합 승인.** ADR이 필요한 단위는 PRD를 먼저 단독 승인하지 않는다. ADR을
`proposed`로 마무리한 뒤 사용자에게 PRD·ADR을 **한 번에** 승인할지 묻고(대상 문서와 전환
상태 명시), 명시 승인 발화를 그대로 인용해 `npm run harness:approve -- --unit
docs/raw/feature/<slug> --quote "<사용자 발화 verbatim>" --adr`로만 둘 다 전환한다(직접
frontmatter 편집 금지 — `harness:approve --adr`가 PRD `review`→`approved`, ADR
`proposed`→`accepted`를 원자적으로 함께 기록). 결정 방향을 논의한 대화는 승인이 아니다.
모호하면 PRD `review`, ADR `proposed`로 둔다.

## 질문 도구

- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 사용한다.
- 질문 transport는 deep-interview 내부에서 현재 surface에 맞게 선택한다.
- `$deep-interview`가 없을 때만 현재 런타임의 구조화 질문 도구로 직접 fallback한다.
- 구조화 질문 도구도 없을 때만 간결한 명시 질문으로 fallback한다.

## Claude Code 실행 (선택)

ClaudeCode에서는 자기 도구로 더 자연스럽게 진행한다(공용 절차는 동일).

- 결정 선택지/제약 질문은 `AskUserQuestion`으로 제시한다.
- **PRD·ADR 통합 승인 요청도 `AskUserQuestion`으로 한다.** "이 PRD와 ADR을 함께 승인할까요?"
  처럼 대상 문서(PRD+ADR)와 전환 상태를 명시한 질문에 "승인 / 아직" 선택지를 준다. 사용자가
  "승인"을 고른 발화만 승인이며, 그 발화를 그대로 `harness:approve --quote ... --adr`에 넣어
  PRD·ADR을 한 번에 전환한다.
- `researcher`, `architect`, `reviewer` 서브에이전트(Agent 도구)로 트레이드오프 조사,
  결정 작성, 선택지 검토를 진행한다.
- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 쓰고, 없을 때만 `AskUserQuestion`을 기본 질문 도구로 쓴다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[adr-helper]`를 붙인다.**

- 형식: `result: [adr-helper] {한 줄 요약}`
- 예: `result: [adr-helper] ADR proposed 작성 — 선택지 3개 비교`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
