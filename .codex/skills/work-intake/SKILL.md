---
name: work-intake
description: "호환 별칭: 새 작업은 $do-next로 수렴하고, 이 스킬은 후보 발굴 단계가 필요할 때만 사용한다."
---

# Work Intake 어댑터

새 표준 진입점은 `$do-next`다. Codex에서 새 열린 요청을 받으면 먼저
`.codex/skills/do-next/SKILL.md`와 `.harness/harness/protocols/do-next.md`를 따른다.
이 어댑터는 `$do-next` 내부 후보 발굴 단계 또는 레거시 호환 요청에서만 사용한다.

호환 사용 순서:

1. `.harness/harness/protocols/work-intake.md`
2. `.harness/harness/roles/intake-helper.md`
3. `.harness/harness/roles/unit-planner.md`
4. 후보 선택 후 `.harness/harness/protocols/prd-drafting.md`
5. `.harness/harness/roles/prd-writer.md`

사용자 승인 전에는 raw unit을 생성하지 않는다. 후보는 branch name, raw path,
scope, non-scope, 검증 방법, PRD/ADR 필요성을 포함해야 한다. 후보가 선택되면
`$do-next` 흐름으로 돌아가 branch/raw/PRD/ADR 승인 단계를 진행한다.
