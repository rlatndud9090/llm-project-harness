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

## 2026-07-23 prd-adr-altitude-examples

**변경**

- **`harness/templates/examples/`를 신설했다.** 채워진 PRD/ADR **짝 예시**(`notification-prd.md`,
  `notification-adr.md`)와 "무엇이 어디에 사는가" **고도 가이드**(`README.md`)를 담았다. 가이드는
  3층 고도표(PRD/ADR/구현), 누수 **self-check 3문항**(실제 요구 판정·구현 결합 판정·고유명사 소거
  판정), 누수 **부검 대조표**, 과대 ADR 경계를 이 하네스의 **단일 출처**로 정의한다. "구조는
  기계강제·의미는 모델재량" 철학에 따라, 코드레벨 디테일이 PRD에 새는 문제(의미 품질)는 리터럴
  게이트가 아니라 이 서술 루브릭 + self-review로 다룬다.
- **`prd-helper.md` Phase 4**의 느슨한 "구현 세부를 과하게 박지 않았는가?" 1줄을 **3문항 이진
  self-check + 모호(과소명세) 방지 + 루프 종료 조건**으로 강화하고, 상세는 examples/README를
  단일 출처로 참조하게 했다(복제 금지).
- **`adr-helper.md`·`architect.md`**에 **과대 ADR**(코드 스니펫·전체 설계문서를 본문에 욱여넣기)
  경계선을 추가했다(코드 누수의 ADR 쪽 대칭).
- **`prd-writer.md`**에 **고유명사 소거 판정**(에이전트가 코드베이스를 읽은 뒤 타입·필드명을 그대로
  요구에 옮기는 누수를 겨냥)과 good/bad 대조를 추가했다.
- **`feature-prd.md`/`feature-adr.md` 템플릿**에 작성 고도 힌트를 추가하고, `feature-prd.md` 비기능
  예시의 "저장소 구조" 문구를 "저장소가 만족해야 할 조건"으로 교정했다(템플릿 문구 자체의 누수
  유인 제거).

**소비자 조치**

- 없음(추가·강화만; 게이트·frontmatter·구조 불변). `templates/examples/`는 `harness:check`가
  스캔하지 않는 교육 자료이며 **존재를 기계강제하지 않는다**(교육 자료의 존재를 소비 프로젝트
  게이트로 강제하는 층위 혼동을 피함). 새 고도 가이드는 공유 프로토콜/역할을 통해 자동 적용되므로,
  원하면 팀에 `.harness/harness/templates/examples/README.md`를 공유하면 된다.

## 2026-07-23 kickoff-github-issue-arg

**변경**

- **`$kickoff`에 GitHub 이슈 번호 진입점을 추가했다.** 사용자가 다른 말 없이 이슈 번호(또는
  이슈 URL) 하나만 인자로 주면(`/kickoff 42`) "이 이슈로 kickoff"로 해석한다. 이슈를 읽고
  유형(feature/bugfix/chore)을 판정해 slug·제목을 도출하는 **의미 판단은 스킬(에이전트)의
  몫**이고, 스크립트는 골격 생성과 provenance 기록만 한다(구조는 기계, 의미는 모델). 판정
  절차·라벨 힌트를 `harness/protocols/kickoff.md`의 새 "GitHub 이슈로 시작" 섹션과 3개 어댑터
  (`.claude/commands/kickoff.md`, `.claude/skills/kickoff`, `.codex/skills/kickoff`)에 명문화했다.
- **`kickoff.mjs`에 `--issue <번호|#번호|URL>` 옵션을 추가했다.** 이 작업 단위가 나온 이슈를
  durable provenance로 남긴다: feature/bugfix는 `prd.md`/`bugfix.md` frontmatter의 `issue:`에,
  모든 유형은 `state.md` 단계 로그의 kickoff 줄에 기록한다(chore는 primary artifact가 없어
  state 원장에만). URL은 URL로, 번호는 `#<번호>`로 정규화한다(`lib.normalizeIssueRef`, 순수·
  테스트 가능). 해석 불가한 값은 골격을 만들기 전에 실패한다.
- **이슈 번호를 스크립트에 직접 넘기면 실패한다.** `harness:kickoff -- 42`처럼 이슈-형태
  positional이 오면 유형 판정을 건너뛴 골격 생성을 막기 위해 실패하고 "먼저 이슈를 조회·
  분류하라"는 힌트를 낸다.

**소비자 조치**

- 없음(기능 추가). 이슈 번호로 kickoff하려면 런타임에 GitHub MCP 도구가 설정되어 있어야
  한다(없으면 기존처럼 `--type/--slug/--title`로 직접 kickoff하면 된다). `--issue` frontmatter
  필드는 선택이라 기존 게이트에 영향을 주지 않는다.

## 2026-07-23 kickoff-own-artifacts-not-dirty

**변경**

- **`$kickoff`의 main+clean auto-checkout 판정이 kickoff 자신의 산출물을 dirty로 세지 않도록
  고쳤다.** 지금까지 clean 판정은 `git status --porcelain`(untracked 포함)이 비어야 했는데,
  `$next-feature`가 방금 남긴 `docs/raw/.next-unit` 앵커가 untracked라 tree를 dirty로 만들어,
  `main`에 있어도 auto-checkout이 막히고 프로토콜상 에이전트가 "워크트리 vs checkout"을 물으며
  **raw 골격 생성·`.next-unit` 소비까지 블록**되던 자기충돌이 있었다. 이제 clean 판정은 kickoff이
  소비할 `.next-unit` 앵커와 대상 unit의 raw 디렉터리(`docs/raw/<type>/<slug>/`, 재실행 잔재
  포함)만 남은 트리를 clean으로 본다. 무관한 WIP가 하나라도 섞이면 여전히 dirty로 남아 워크트리
  vs checkout 선택 경로를 탄다.
- `lib.mjs`에 `workingTreeChangedPaths()`(porcelain 경로 목록, 오류 시 null)를 추가하고
  `isWorkingTreeClean()`을 그 위에 재정의했다(동작 동일). `kickoff.mjs`는 이 목록에서 자기
  산출물을 제외해 판정한다. 프로토콜 문서(`kickoff.md`·`next-feature.md`)도 정합화했다.

**소비자 조치**

- 없음(동작만 확장·수정). `$next-feature → $kickoff` 정상 플로우가 더는 앵커 때문에 막히지
  않는다. `main`에서 kickoff 산출물 외에 깨끗하면 이전처럼 작업 브랜치가 자동 생성된다.

## 2026-07-22 wiki-strip-authoring-and-harness-freshness

**변경**

- **위키 템플릿을 얇은 골격으로 재설계.** `harness/templates/wiki/index.md`에서 '위키 작성 규칙'
  설명(상단 안내 blockquote, `## Raw Units` 아래 "영역이란/영역 설계 원칙/읽는 법" 설명 문단,
  하단 `## Maintenance` 섹션)을 전부 제거했다. 이제 템플릿에는 frontmatter 포인터(`summary`·
  `authoring_rules`), `## 큰 방향성`, `## Raw Units (영역별 계보)` 헤딩만 남는다. 작성 규칙은
  정본인 `harness/protocols/wiki-ingest.md`로 이관했다(위키 파일 내용 계약 섹션 신설).
- **`assertWikiNoAuthoringGuidance` 게이트 신설(하드 에러, 소비자 전용).** `docs/wiki/*.md`에
  옛 작성-규칙 boilerplate가 남아 있으면 `harness:check`가 sentinel로 감지해 실패시킨다. sentinel은
  그 boilerplate에만 나타나는 고정밀 문구다(lib `WIKI_AUTHORING_SENTINELS`).
- **`attach --retrofit`의 위키 주입 정리.** 기존엔 `## Harness Maintenance` 규칙 블록을 소비자
  위키에 주입했는데, 규칙 대신 `wiki-ingest.md`를 가리키는 sentinel-free 포인터만 주입하도록 바꿨다.
- **서브모듈 최신 여부 warning.** `harness:check`가 소비 프로젝트에서 `.harness`가 원격보다
  뒤처졌으면 경고만 남긴다(best-effort·타임아웃, 오프라인/CI/`HARNESS_SKIP_REMOTE_CHECK`는 skip).
- **하네스 정비 ride-along 예외 명문화.** `.harness` 최신화와 그 정합화는 전용 브랜치 없이 현재
  브랜치에 chore 커밋 하나로 태워도 된다(`kickoff --type chore --no-branch`). `commit-protocol.md`·
  `submodule-attach.md`에 규칙을 추가했다. 기계 게이트는 이 ride-along을 막지 않는다.

**소비자 조치 (필수)**

1. **`docs/wiki/index.md`(및 분리된 섹션 파일)에서 '위키 작성 규칙' 문구를 삭제한다.** 구체적으로
   상단 안내 blockquote(`이 한 장은 에이전트가…` / `이 문서는 항상 로딩되는…`), `## Raw Units`
   아래의 설명 문단(`각 ### <영역>은 앱의…`, `영역 설계 원칙`, `읽는 법 —` 및 예시 코드블록),
   하단 `## Maintenance` 섹션을 제거한다. **`## 큰 방향성`과 `### <영역>`별 계보 링크는 그대로
   유지**한다. 삭제 후 `harness:check`가 green이면 완료다(남은 잔재는 sentinel 에러로 알려준다).
2. (선택) 위키 최상단에 `summary`·`authoring_rules` frontmatter 포인터를 새 템플릿처럼 추가하면
   "이 파일이 무엇이고 규칙은 어디에 있는지"가 명확해진다.
3. `npm run harness:sync -- --ack`로 이 항목 반영을 확인한다(`.harness-sync` 갱신).

서브모듈 최신 여부 warning과 ride-along 예외는 추가 동작이라 별도 소비자 조치가 없다.

## 2026-07-21 kickoff-branch-situational

**변경**

- `$kickoff`이 raw 골격을 만들기 **전에** 작업 브랜치를 상황에 따라 정리한다. `main`/`master`에서
  작업 트리가 깨끗하면 `<type>/<slug>` 브랜치를 **자동 생성·전환**(`git checkout -b`)하고, 이미 그
  작업 브랜치 위면 그대로 둔다(branch-first). 다른 브랜치·커밋 안 된 변경·detached HEAD·비-git,
  또는 목표 브랜치가 이미 존재하면 브랜치를 건드리지 않고 힌트만 남긴다.
- 새 플래그 `--checkout`(현재 위치에서 강제 생성·전환)과 `--no-branch`(브랜치 로직 완전 끔, 둘이
  겹치면 `--no-branch` 우선)를 추가했다.
- 지금까지 kickoff은 브랜치를 전혀 만들지 않았는데 프로토콜 문서·state 원장은 "브랜치 생성"을
  약속해 문서↔동작이 어긋나 있었다. 실제 동작에 맞춰 `session-start.md`·`next-feature.md`·
  `kickoff.md`와 state 원장 로그줄(feature 템플릿 + bugfix/chore 인라인)을 정정했다.

**소비자 조치**

- 없음(동작만 확장). 기존 branch-first 습관은 그대로 동작한다. `main`/`master` + clean 상태에서
  kickoff하면 이제 작업 브랜치가 자동으로 생기니, 그게 싫으면 `--no-branch`를 쓴다. 다른 브랜치나
  dirty 상태에서는 kickoff이 자동 전환하지 않고 워크트리 격리 vs 현재 위치 checkout을 선택하도록 안내한다.

## 2026-07-21 extracth1-frontmatter-title

**변경**

- `wiki-ingest`가 위키 제목을 뽑을 때 쓰는 `extractH1`이 선두 frontmatter 블록을 건너뛴 뒤 본문 H1을
  찾도록 고쳤다. 이전에는 frontmatter 안의 `# section(섹션, 선택): …` 같은 안내 주석 줄을 H1로 오인해,
  최신 kickoff 템플릿을 쓴 unit의 위키 줄에 실제 제목 대신 주석 텍스트가 박혔다.

**소비자 조치**

- 이번 수정은 **앞으로의 ingest만** 바로잡는다. `harness:ingest`는 이미 링크된 unit의 제목을 다시
  만들지 않으므로(멱등 skip), 기존 위키에 `# section(…)`류 가짜 제목이 박힌 줄이 있으면
  `docs/wiki/*.md`에서 **손으로 실제 제목으로 교정**한다. 이후 신규 ingest는 정상 렌더된다.

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
