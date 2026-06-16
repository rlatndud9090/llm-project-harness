# /wiki-ingest <raw-unit-path>

raw unit을 `docs/wiki/index.md`에 한 줄로 연결한다.

## 실행

```sh
npm run harness:ingest -- $ARGUMENTS --category "<분류 이름>"
```

규칙:

- 수정 대상은 `docs/wiki/index.md` 하나다.
- 같은 raw unit을 여러 번 실행해도 중복 링크를 만들지 않는다.
- wiki에는 요약문을 쓰지 않고 raw link만 둔다.
- raw unit 내용에 맞는 카테고리(분류)를 골라 `--category`로 지정한다. 기존 분류 중
  맞는 게 없으면 새로 만든다. 생략하면 type 기반 fallback으로 떨어진다.
- PRD/ADR이 있는 raw unit은 둘 다 링크되었는지 확인한다.

공용 기준은 `.harness/harness/protocols/wiki-ingest.md`다.
