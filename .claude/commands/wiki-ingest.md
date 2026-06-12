# /wiki-ingest <raw-unit-path>

raw unit을 `docs/wiki/index.md`에 한 줄로 연결한다.

## 실행

```sh
npm run harness:ingest -- $ARGUMENTS
```

규칙:

- 수정 대상은 `docs/wiki/index.md` 하나다.
- 같은 raw unit을 여러 번 실행해도 중복 링크를 만들지 않는다.
- wiki에는 요약문을 쓰지 않고 raw link만 둔다.
- PRD/ADR이 있는 raw unit은 둘 다 링크되었는지 확인한다.

공용 기준은 `.harness/harness/protocols/wiki-ingest.md`다.
