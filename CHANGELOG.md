# 하네스 CHANGELOG

이 하네스를 `.harness` 서브모듈로 쓰는 소비 프로젝트는, 서브모듈을 최신 커밋으로
업데이트한 뒤 **반드시 정합성을 맞춰야 한다**:

1. `npm run harness:sync` — 마지막으로 맞춘 이후의 항목과 **소비자 조치**를 읽는다.
2. 각 항목의 소비자 조치를 실제로 반영한다(예: 위키 재작성, frontmatter 추가).
3. `npm run harness:sync --ack` — 반영을 확인한다(`.harness-sync`가 CHANGELOG head로 갱신).

확인 전에는 `harness:check`가 막는다(`.harness-sync` != CHANGELOG head). 이는 서브모듈만
올리고 정책 변화를 놓치는 drift를 기계로 차단하기 위한 것이다.

**작성 규칙**: 하네스의 공용 표면(`harness/`, `scripts/harness/`, `.claude/`, `.codex/`)을
바꾸는 모든 커밋은 이 파일 맨 위에 `## <YYYY-MM-DD> <slug>` 항목을 추가한다(newest-first).
각 항목은 **변경**과 **소비자 조치**를 적고, 조치가 없으면 "소비자 조치: 없음"으로 명시한다.

## 2026-07-06 wiki-area-lineage-and-sync

**변경**

- 위키 작성 체계를 **area(영역)별 시간순 계보 + 현재 결정 포인터**로 개편했다. area는
  `prd.md`/`bugfix.md` frontmatter에 콤마 구분 리스트로 선언하고(다중 영역 지원),
  `harness:ingest`가 각 영역 `### 헤딩` 아래 `YYYY-MM-DD` 날짜 접두로 시간순 삽입한다.
  `harness:check`가 선언==렌더 일치·date-parity·현재 포인터 구조 불변식·broad 금지를
  기계강제한다(레거시 unit은 선언/dated 줄만 대상이라 무파손). `--category`는 레거시 별칭.
- **커밋별 CHANGELOG + 소비자 sync 정합성 게이트**를 도입했다(`harness:sync`,
  `.harness-sync`, `assertHarnessSync`). 이 항목이 그 첫 적용이다.

**소비자 조치 (필수)**

1. **`docs/wiki/index.md`를 새 area 체계로 전면 재작성한다.** 기존 넓은 카테고리를 앱의
   좁은 기능/구조 영역(화면·플로우·엔진 등)으로 재편하고, 각 영역 `### <영역>` 아래에 그
   영역의 작업 단위를 다음 형태로 **오래된 → 최신** 시간순 나열한다:

   ```md
   - `YYYY-MM-DD` **제목** — [PRD](../raw/<type>/<slug>/prd.md) · [ADR](…) _(superseded by …)_
   - `YYYY-MM-DD` **제목** — [PRD](…) · [ADR](…) _(현재)_
   ```

   날짜는 각 unit frontmatter `date`와 일치해야 하고, 대체된 결정은 `_(superseded by …)_`,
   영역의 현재 최신 결정은 `_(현재)_`(영역당 최대 1개)로 표시한다. 상세 규칙은
   `.harness/harness/protocols/wiki-ingest.md` 참고. 재작성 후
   `npm run harness:ingest -- <각 unit> --area "<영역>"`로 재정렬을 검증할 수 있다.

2. 기존 feature `prd.md`·bugfix `bugfix.md` frontmatter에 `area: "<영역>"`(여러 개는 콤마)을
   추가한다. 값은 위키 `### 헤딩` 문자열과 정확히 일치해야 한다(`harness:check`가 강제).

3. `package.json`에 `"harness:sync": "node .harness/scripts/harness/sync.mjs"`를 추가한다
   (`.harness/scripts/harness/attach-submodule.mjs`를 다시 실행하면 자동 추가·`.harness-sync`도 생성).
   그 뒤 `npm run harness:sync --ack`로 이 항목 반영을 확인한다.
