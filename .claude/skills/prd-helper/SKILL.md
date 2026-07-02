---
name: prd-helper
description: "PRD를 인터뷰·리서치·리뷰로 함께 작성할 때 사용한다."
---

# PRD Helper 어댑터

공용 기준은 `.harness/harness/protocols/prd-helper.md`다.

## 실행 순서

1. `.harness/harness/protocols/prd-helper.md`를 읽는다.
2. 사용자 의견과 결정 경계를 수집한다(`$deep-interview`가 있으면 그 스킬을 우선 사용하고, 없으면 현재 런타임의 구조화 질문 도구를 우선 사용하며 그마저 없을 때만 명시 질문).
3. `.harness/harness/roles/researcher.md`로 레퍼런스/선행 사례를 모은다(출처는 notes에).
4. `.harness/harness/roles/prd-writer.md`로 PRD 초안을 작성한다.
5. `.harness/harness/roles/reviewer.md`로 수용 기준/누락/모순을 지속 검토하고 다듬는다.
6. `## ADR 필요 여부`를 판단하고, 필요하면 `$adr-helper`로 넘긴다.

PRD는 한국어로 작성하고 `review` 상태로 둔다. 사용자 명시 승인 전에는 `approved`로
바꾸지 않는다.

`approved` 전환은 오직 사용자의 명시 승인 뒤 `npm run harness:approve -- --unit
docs/raw/<type>/<slug> --quote "<사용자 발화 verbatim>"`로만 한다(직접 frontmatter 편집
금지 — 런타임 훅과 `harness:check`가 막는다). "이렇게 하려고 했어" 같은 의도·아이디어
발화는 승인이 아니다. 승인은 대상 문서와 전환 상태를 명시한 승인 요청에 대한 사용자의
분명한 긍정 응답만을 뜻하며, 모호하면 `review`로 둔 채 다시 확인한다. `review`로 올릴
때 `state.md`의 `stage`/`prd_status`를 갱신한다.

## 질문 도구

- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 사용한다.
- 질문 transport는 deep-interview 내부에서 현재 surface에 맞게 선택한다.
- `$deep-interview`가 없을 때만 현재 런타임의 구조화 질문 도구로 직접 fallback한다.
- 구조화 질문 도구도 없을 때만 간결한 명시 질문으로 fallback한다.

## Claude Code 실행 (선택)

ClaudeCode에서는 자기 도구로 더 자연스럽게 진행한다(공용 절차는 동일).

- 의견/결정 경계 질문은 `AskUserQuestion`으로 선택지를 제시한다.
- **승인 요청도 `AskUserQuestion`으로 한다.** 대상 문서와 전환 상태를 명시한 질문(예:
  "이 PRD를 approved로 전환할까요?")에 "승인 / 아직" 같은 명시 선택지를 준다. 사용자가
  "승인"을 고른 그 응답만 승인이며, 그 발화를 그대로 `harness:approve --quote`에 넣는다.
  사용자의 실제 선택 없이 승인을 만들어내지 않는다.
- `researcher`, `prd-writer`, `reviewer` 서브에이전트(Agent 도구)로 리서치↔작성↔리뷰를
  돌린다. researcher와 reviewer를 동시에 돌려 루프를 빠르게 하려면 `/team`으로 가속할 수
  있다(선택). 단순한 PRD면 서브에이전트로 충분하다.
- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 쓰고, 없을 때만 `AskUserQuestion`을 기본 질문 도구로 쓴다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[prd-helper]`를 붙인다.**

- 형식: `result: [prd-helper] {한 줄 요약}`
- 예: `result: [prd-helper] PRD 초안 review 상태로 작성 완료 — ADR 필요`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
