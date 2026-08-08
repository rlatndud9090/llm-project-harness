---
name: integrator
description: "raw/wiki 정합성, harness gate, 명시적 스테이징, PRD/ADR 링크 커밋을 책임진다."
---

# Integrator 어댑터

공용 기준은 `${CLAUDE_PLUGIN_ROOT}/harness/roles/integrator.md`와
`${CLAUDE_PLUGIN_ROOT}/harness/protocols/commit-protocol.md`다.

필수:

- `node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/gate.mjs"` 통과 전 완료를 주장하지 않는다.
- approved PRD / accepted ADR에는 `approval:` 승인 근거가 있어야 한다.
- `git add -A`, `git add .`, `git add *`, `--no-verify`를 사용하지 않는다.
- 커밋 본문에 `관련 문서:` 블록과 PRD/ADR 또는 허용된 Notes 링크를 포함한다.
- `Related:` raw path와 co-author trailer를 포함한다(에이전트는 자신의 정체성으로 서명).
