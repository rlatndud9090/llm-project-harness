---
name: prd-helper
description: "PRD를 인터뷰·리서치·리뷰로 함께 작성할 때 사용한다."
---

# PRD Helper 어댑터

공용 기준은 `.harness/harness/protocols/prd-helper.md`다.

## 실행 순서

1. `.harness/harness/protocols/prd-helper.md`를 읽는다.
2. 사용자 의견과 결정 경계를 수집한다(`$deep-interview`가 있으면 활용, 없으면 명시 질문).
3. `.harness/harness/roles/researcher.md`로 레퍼런스/선행 사례를 모은다(출처는 notes에).
4. `.harness/harness/roles/prd-writer.md`로 PRD 초안을 작성한다.
5. `.harness/harness/roles/reviewer.md`로 수용 기준/누락/모순을 지속 검토하고 다듬는다.
6. `## ADR 필요 여부`를 판단하고, 필요하면 `$adr-helper`로 넘긴다.

PRD는 한국어로 작성하고 `review` 상태로 둔다. 사용자 명시 승인 전에는 `approved`로
바꾸지 않는다.

## Claude Code 실행 (선택)

ClaudeCode에서는 자기 도구로 더 자연스럽게 진행한다(공용 절차는 동일).

- 의견/결정 경계 질문은 `AskUserQuestion`으로 선택지를 제시한다.
- `researcher`, `prd-writer`, `reviewer` 서브에이전트(Agent 도구)로 리서치↔작성↔리뷰를
  돌린다. researcher와 reviewer를 동시에 돌려 루프를 빠르게 하려면 `/team`으로 가속할 수
  있다(선택). 단순한 PRD면 서브에이전트로 충분하다.
- `$deep-interview`가 있으면 인터뷰 가속기로 쓰고, 없으면 `AskUserQuestion`이 기본이다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[prd-helper]`를 붙인다.**

- 형식: `result: [prd-helper] {한 줄 요약}`
- 예: `result: [prd-helper] PRD 초안 review 상태로 작성 완료 — ADR 필요`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
