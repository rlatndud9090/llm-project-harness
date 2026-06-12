# /artifact-check

raw/wiki/harness 아티팩트와 도구별 어댑터 정합성을 검증한다.

```sh
npm run harness:check
```

공용 기준은 `.harness/harness/protocols/artifact-validation.md`다.

자동 검증이 통과해도 새 PRD/ADR/notes의 한국어 작성, `$do-next` 호환 라우팅,
notes-only 예외의 타당성, wiki 비대화 여부는 수동으로 확인한다.
