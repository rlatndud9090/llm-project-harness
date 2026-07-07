---
name: wiki-ingest
description: "raw work unit을 docs/wiki에 섹션·영역별 시간순으로 연결한다."
---

# Wiki Ingest 어댑터

공용 기준은 `.harness/harness/protocols/wiki-ingest.md`다.

## 실행

```sh
npm run harness:ingest -- docs/raw/<type>/<slug> --area "<영역>"
```

wiki에는 raw 내용을 요약하지 않고 링크 한 줄만 둔다. 영역(area)은 앱의 좁은 기능/구조
단위이며, 정규 경로는 `prd.md`/`bugfix.md` frontmatter `area:`에 선언하는 것이다(ingest가
읽는다). `--area`로 직접 지정할 수도 있고 여러 영역은 콤마로 나눈다(`--category`는 레거시
별칭). ingest는 그 영역의 `### 헤딩` 아래에 `YYYY-MM-DD` 날짜 접두로 시간순 삽입하며, 같은
영역에 여러 번 실행해도 중복 줄을 만들지 않는다. 대체된 결정은 `_(superseded by …)_`,
현재 최신은 `_(현재)_`로 표시한다.

area보다 큰 **섹션**은 `prd.md`/`bugfix.md` frontmatter `section:`(단일 값)에 선언한다.
선언된 섹션이 1개 이하면 모든 area가 `index.md` 한 장에 남고, 2개 이상이 되면 ingest가
`docs/wiki/<섹션>.md`로 자동 분리하며 `index.md`를 섹션 링크 허브로 재작성한다(첫 섹션의
계보도 함께 옮긴다). 분리된 프로젝트에서 섹션 미선언 feature/bugfix는 ingest가 거부한다.
