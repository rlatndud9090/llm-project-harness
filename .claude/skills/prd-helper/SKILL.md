---
name: prd-helper
description: "PRD를 deep-interview·리서치·리뷰로 함께 작성할 때 사용한다."
---

# PRD Helper 어댑터

공용 기준은 `.harness/harness/protocols/prd-helper.md`다.

## 실행 순서

1. `.harness/harness/protocols/prd-helper.md`를 읽는다.
2. `$deep-interview`로 사용자 의견과 결정 경계를 수집한다.
3. `.harness/harness/roles/researcher.md`로 레퍼런스/선행 사례를 모은다(출처는 notes에).
4. `.harness/harness/roles/prd-writer.md`로 PRD 초안을 작성한다.
5. `.harness/harness/roles/reviewer.md`로 수용 기준/누락/모순을 지속 검토하고 다듬는다.
6. `## ADR 필요 여부`를 판단하고, 필요하면 `$adr-helper`로 넘긴다.

PRD는 한국어로 작성하고 `review` 상태로 둔다. 사용자 명시 승인 전에는 `approved`로
바꾸지 않는다.

## Claude Code 가속 (선택)

PRD가 복잡하거나 researcher와 reviewer를 동시에 돌려 작성↔리뷰 루프를 빠르게 돌리고
싶으면 ClaudeCode `/team`으로 가속할 수 있다. teams는 ClaudeCode 전용 선택지이며,
기본 흐름은 서브에이전트로 동일하게 동작한다. 단순한 PRD면 서브에이전트로 충분하다.
