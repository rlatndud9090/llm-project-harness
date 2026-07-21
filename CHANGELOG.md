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

## 2026-07-21 fleetview-title-agents-guard

**변경**

- `$kickoff`·`$next-feature`의 agents 화면(FleetView) 제목 설정 스크립트에 **선-체크 가드**를
  추가했다. 스크립트 맨 앞에서 agents 세션인지(`~/.claude/jobs/*/state.json` 존재)를 먼저
  확인하고, job state.json이 하나도 없으면(= agents 모드가 아닌 대화형 세션) python을 아예
  호출하지 않고 조용히 정상 종료한다(exit 0). job은 있으나 현재 세션과 매칭되는 항목이 없는
  경우도 `sys.exit(<문자열>)`(exit 1) 대신 `SystemExit(0)`으로 no-op 처리한다.
- 이전에는 매칭되는 state.json이 없을 때마다 exit code 1로 빠져서, 그 실패를 "제목 설정
  건너뜀"으로 해석해 넘어가야 했다. 이제 비-agents 세션에서도 실패 신호 없이 깔끔히 no-op이 된다.

**소비자 조치**

- 없음. Claude Code 어댑터 전용 동작 개선으로 공용 `harness/` 표면·소비자 아티팩트에 영향이
  없다. FleetView 제목 갱신은 agents 세션에서 종전과 동일하게 동작한다.

## 2026-07-08 adr-helper-design-decision-lane

**변경**

- **`designer` 역할 신설**(`harness/roles/designer.md` + `.codex`/`.claude` 어댑터). UI-significant
  유닛에서 화면 배치·구성·상호작용 어포던스·시각 위계의 **대안을 제안**하고 채택 결정을
  근거와 함께 남긴다. 빌드는 하지 않는다(구현은 `ui-engineer`).
- **`$adr-helper`에 디자인 결정 레인(Phase 3.5)** 추가. `$prd-helper`가 "다투는 화면 배치"를
  ADR 필요 사유로 넘기면, `designer`가 배치 대안을 **최소 2개 ASCII 와이어프레임**으로 비교하고,
  채택안·기각 사유·시각 위계 근거를 **ADR `## 선택지`/`## 결정`/`## 선택 근거`에** 남긴다(별도
  아티팩트·게이트 없음). 배치 선택은 구조화 질문(ClaudeCode `AskUserQuestion` preview 등)으로
  받아 PRD·ADR 통합 승인으로 흡수한다.
- **게이팅**: `$prd-helper`의 "ADR 필요 여부" 판단에 "디자인 결정 필요 여부"를 포함. 배치가
  실제 다투는 결정인 UI 유닛에만 발동하고, 단순 화면은 build-first 유지.
- 기본 경로는 tool-free ASCII(Codex/ClaudeCode 양쪽 동작). `frontend-design` 스킬·브라우저 도구
  (Playwright MCP: 목업 hi-fi 스크린샷 비교)·컴포넌트 라이브러리 MCP는 **있으면 쓰는 optional
  가속기**로만 참조하며 없어도 동작한다.

**소비자 조치**

- **없음(옵트인).** 새 `designer` 역할과 디자인 결정 레인은 UI-significant 유닛에서만 발동하는
  선택 경로다. 단순 화면은 종전대로 build-first다. 서브모듈 업데이트 후 `.harness`의 `designer`
  어댑터가 노출되며, hi-fi 목업 비교를 쓰려면 Playwright MCP를 연결하면 된다(없으면 ASCII).

## 2026-07-08 kickoff-window-settled-gating

**변경**

- **kickoff 직후 `harness:check` green 보장.** feature/bugfix 골격은 첫 ingest(2-touch의
  `$prd-helper` PRD→review 시점) 전까지 wiki에 링크되지 않는데, `assertRawUnitsLinked`와
  `assertAreaGrouping`이 그 전부터 링크를 요구해 kickoff↔prd-helper 창에서 빨간불이었다
  (kickoff.md 완료조건 check-green과 상충). 두 게이트가 이제 `unitIsSettled`(feature=prd
  review/approved, bugfix=bugfix review/fixed)가 아닌 unit을 **면제**한다. 링크 요구 자체는
  review+에서 그대로 유지된다.
- **chore는 kickoff이 즉시 링크.** chore는 review 라이프사이클이 없고 area/section이 필요
  없어(운영 버킷) `kickoff.mjs`가 골격 생성 직후 wiki-ingest를 best-effort로 실행한다. 따라서
  chore도 kickoff 직후 green이고 링크 게이트는 엄격하게 유지된다.
- **`collectDeclaredSections`가 settled 유닛의 섹션만 카운트.** 아직 review 전인 draft가
  시드된 `section:`만으로 유령 split(2섹션 판정→허브 없음→`assertSectionLayout`/`assertWikiShape`
  빨간불)을 만들던 문제를 함께 제거. 두 섹션이 실제 review+ingest될 때 분리가 일어난다. ingest는
  현재 처리 중인 unit의 섹션을 명시적으로 카운트에 더하므로 status 순서와 무관하게 안전하다.

**소비자 조치**

- **없음.** 이 변경은 오탐(false red)을 줄이는 방향의 순수 개선이라 하위호환이다. 서브모듈
  업데이트 후 kickoff 직후 `harness:check`가 green이 되고, `kickoff --type chore`가 chore를
  자동으로 위키 운영 버킷에 링크한다(수동 `harness:ingest` 불필요). review 이상 unit의 링크
  요구는 그대로다.

## 2026-07-07 wiki-section-axis-and-auto-split

**변경**

- wiki에 **area 상위의 `section`(섹션) 축**을 도입. 계층은 `## 섹션 > ### 영역(area) >
  시간순 bullet`. 섹션은 `prd.md`/`bugfix.md` frontmatter `section:`(단일 값)에 durable
  선언한다(area는 콤마 다중, 섹션은 단일).
- **자동 분리**: 선언된 distinct 섹션이 1개 이하면 모든 area가 `docs/wiki/index.md` 한 장에
  남고(현행 동일), **2개 이상이 되는 순간 `harness:ingest`가** 각 섹션을 `docs/wiki/<섹션>.md`로
  분리하고 `index.md`를 `## 섹션` 링크 허브로 재작성한다. 첫 섹션의 기존 계보 블록은
  navigation 라벨(`_(현재)_`/`_(superseded by …)_`)을 보존한 채 도구가 원자적·멱등으로 이관한다.
  이미 분리된 뒤 새 섹션은 파일 생성 + 허브 링크 추가로 처리된다.
- `harness:check`가 섹션 축을 기계강제: `docs/wiki`에는 `index.md`와 선언된 섹션 파일만 존재,
  각 unit은 자기 섹션 파일에만 링크(교차 링크 차단), 선언 섹션 2개 이상이면 index가 허브여야
  하고 2개 미만이면 허브가 없어야 함, 허브 링크 유효성, broad 섹션 이름 금지. 기존 area 게이트
  (grouping/timeline/currency/linked/taxonomy)는 모두 다중 wiki 파일 순회로 확장.
- `kickoff --section`, next-feature 앵커 4번째 필드(section)로 `section:` 시드 지원. wiki-ingest는
  `--section`을 받고, frontmatter가 진실원이다. 분리된 프로젝트에서 섹션 미선언 feature/bugfix
  ingest는 실패한다.

**소비자 조치**

- **없음(옵트인).** 섹션을 선언하지 않으면 wiki는 기존 그대로 `index.md` 한 장으로 동작한다.
  여러 페이지/섹션으로 커져 wiki를 나누고 싶을 때 `prd.md`/`bugfix.md` frontmatter `section:`에
  섹션을 선언하기 시작하면 된다. 두 번째 섹션이 선언되는 순간 다음 `harness:ingest`가 자동으로
  분리하므로 수동 마이그레이션은 필요 없다.

## 2026-07-06 ingest-timing-and-backlog-fixes

**변경**

- wiki-ingest **실행 시점을 2-touch로 정본화**: 첫 링크는 `$prd-helper`(PRD review 시,
  모든 raw unit 링크 요구 충족), 계보 큐레이션(`_(현재)_`/`_(superseded by …)_`)은 통합/커밋
  시점. kickoff/prd-helper/feature-develop/next-feature/adr-helper 프로토콜을 이 모델로 정리.
- 증분 area 판단 보강: `$prd-helper`/`$next-feature`가 `docs/wiki/index.md`의 `### 헤딩`을
  읽어 기존 영역을 재사용하도록 안내. ingest는 기존 영역이 있는데 **새 영역을 만들면 경고**로
  기존 목록을 보여 오타 중복(`A화면`≠`A 화면`)을 막는다.
- PRD 상위 계보: `feature-prd.md` frontmatter에 `parent_prd`(선택) 추가 +
  `assertPrdReferences`가 링크 유효성 검증(ADR `related_prd`와 대칭).
- 소비 프로젝트에서 발견한 버그 수정: (1) `harness:approve`가 `state.md` 규칙 문단의 백틱
  헤딩 리터럴을 실제 헤딩으로 오인해 단계 로그/승인 이벤트를 문단 중간에 삽입하던 것을 줄-앵커
  탐색으로 수정; (2) PRD 선승인(`stage: approved`) 후 ADR 단계 진입(`approved`→`adr-draft`/
  `adr-review`)이 regression으로 막히던 것을 허용; (3) `assertNoPlaceholders`가 accepted 문서
  본문의 코드 중괄호(`Phase { … }`)를 미치환 토큰으로 오탐하던 것을 코드 span 제외로 수정.

**소비자 조치**

- **필수 조치 없음** — 모두 하위호환 개선/버그 수정이라 기존 위키·문서를 다시 고칠 필요는 없다.
- (선택) 상위 PRD를 세부화하는 후속 feature는 `prd.md` frontmatter `parent_prd`로 계보를 이을
  수 있다. (선택) `attach-submodule.mjs`를 다시 실행하면 갱신된 템플릿/스크립트가 반영된다.

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
