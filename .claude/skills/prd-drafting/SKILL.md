---
name: prd-drafting
description: "호환 별칭: 새 작업은 $do-next로 수렴하고, 이 스킬은 PRD 작성 단계가 필요할 때만 사용한다."
---

# PRD Drafting 어댑터

새 표준 진입점은 `$do-next`다. ClaudeCode에서 PRD/ADR 확정까지 진행할 때는 먼저
`.claude/skills/do-next/SKILL.md`와 `.harness/harness/protocols/do-next.md`를 따른다.
이 어댑터는 `$do-next` 내부 PRD 작성 단계 또는 레거시 호환 요청에서만 사용한다.

공용 기준:

1. `.harness/harness/protocols/prd-drafting.md`
2. `.harness/harness/roles/prd-writer.md`

PRD는 한국어로 작성한다. 문제, 목표, 비목표, 기능/비기능 요구사항, 수용 기준,
열린 질문, ADR 필요 여부를 모두 포함한다.

구현 세부를 확정해야 하는 사안은 PRD에 숨기지 말고 ADR 필요 항목으로 넘긴다.
PRD 초안 작성 후에는 `$do-next` 흐름으로 돌아가 명시 승인 라운드와 wiki/harness
검증을 진행한다.
