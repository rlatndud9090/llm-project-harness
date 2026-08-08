# /artifact-check

raw/wiki/harness 아티팩트와 도구별 어댑터 정합성을 검증한다.

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/artifact-check.mjs"
```

공용 기준은 `${CLAUDE_PLUGIN_ROOT}/harness/protocols/artifact-validation.md`다.

자동 검증이 통과해도 새 PRD/ADR/notes의 한국어 작성, 단계별 어댑터 정합성,
notes-only 예외의 타당성, wiki 비대화 여부는 수동으로 확인한다.
