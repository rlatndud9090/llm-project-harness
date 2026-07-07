# /wiki-ingest <raw-unit-path>

raw unit을 `docs/wiki/index.md`에 영역별 시간순 한 줄로 연결한다.

## 실행

```sh
npm run harness:ingest -- $ARGUMENTS --area "<영역>"
```

규칙:

- 수정 대상은 `docs/wiki/index.md`(그리고 분리 후 각 `docs/wiki/<섹션>.md`)이며, 손으로
  섹션 파일을 만들지 않는다 — 섹션 분리·이동은 ingest가 한다.
- area 상위의 **섹션**은 `prd.md`/`bugfix.md` frontmatter `section:`(단일 값) 또는
  `--section`으로 준다. 선언 섹션이 2개 이상이면 ingest가 `docs/wiki/<섹션>.md`로 자동
  분리하고 `index.md`를 섹션 링크 허브로 재작성한다. 분리된 프로젝트에서 섹션 미선언
  feature/bugfix는 실패한다.
- 같은 raw unit을 같은 영역에 여러 번 실행해도 중복 링크를 만들지 않는다.
- wiki에는 요약문을 쓰지 않고 raw link만 둔다.
- 영역(area)은 앱의 좁은 기능/구조 단위다. 정규 경로는 `prd.md`/`bugfix.md` frontmatter
  `area:`에 선언하는 것이고(ingest가 읽음), `--area`로 직접 줄 수도 있다. 여러 영역은
  콤마로 나눈다. `--category`는 레거시 별칭이다. 생략하고 feature면 실패, bugfix/chore면
  운영 버킷으로 fallback한다.
- ingest는 그 영역의 `### 헤딩` 아래 `YYYY-MM-DD` 날짜 접두로 시간순 삽입한다. 대체된 결정은
  `_(superseded by …)_`, 현재 최신은 `_(현재)_`로 표시한다.
- PRD/ADR이 있는 raw unit은 둘 다 링크되었는지 확인한다.

공용 기준은 `.harness/harness/protocols/wiki-ingest.md`다.
