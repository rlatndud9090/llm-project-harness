---
name: wiki-ingest
description: "raw work unit을 docs/wiki/index.md에 한 줄로 연결한다."
---

# Wiki Ingest 어댑터

공용 기준은 `.harness/harness/protocols/wiki-ingest.md`다.

## 실행

```sh
npm run harness:ingest -- docs/raw/<type>/<slug> --category "<분류 이름>"
```

wiki에는 raw 내용을 요약하지 않고 링크 한 줄만 둔다. raw unit 내용에 맞는 카테고리를
골라 `--category`로 지정하고, 기존 분류에 맞는 게 없으면 새로 만든다. 같은 raw unit을
여러 번 실행해도 중복 링크를 만들지 않는다.
