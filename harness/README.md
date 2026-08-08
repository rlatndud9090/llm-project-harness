# 하네스 공용 제어면

이 디렉터리는 Claude Code 에이전트가 소비 프로젝트에서 같은 방식으로 작업하도록
만드는 공용 제어면이다. 하네스는 **Claude Code 플러그인**으로 배포되고, `harness/`가
source of truth다. 세션 안에서는 `${CLAUDE_PLUGIN_ROOT}/harness/...`로, CI에서는 공용
composite action으로 소비된다 — 소비 저장소에 `.harness` 심볼릭 링크나 엔진 사본은 없다.

## 핵심 원칙

- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- 하네스는 소비 프로젝트의 `docs/` 아래에 공유 파일이나 symlink를 만들지 않는다.
- 하네스는 raw/wiki/PRD/ADR/검증/커밋 절차와 템플릿을 제공한다.
- 스킬·커맨드·에이전트는 플러그인이 namespace(`/llm-project-harness:<name>`)로 제공한다.
- 같은 이름의 로컬 스킬/커맨드를 소비 프로젝트 `.claude/`에 두면 그 로컬 정의가 override로 우선한다.
- 작업 단위, 브랜치 정책, PRD/ADR 승인 정책은 소비 프로젝트가 하네스를 사용할 때
  적용한다. 하네스 저장소 자체에 같은 정책을 강제하지 않는다.
- 프로토콜 본문의 `$skill-name`은 "그 하네스 skill을 호출하라"는 표시다(플러그인에서는
  namespace `/llm-project-harness:skill-name` 또는 Skill 도구). `$deep-interview`, `$ralph`,
  `$ralplan`, `/team`은 하네스가 배포하지 않는 선택적 외부 가속기다. 프로토콜이
  `$deep-interview`를 명시할 때는 그 스킬을 최우선으로 사용하고, 질문 transport는
  deep-interview 내부에서 현재 surface에 맞게 선택한다. `$deep-interview`가 없을
  때만 현재 런타임의 구조화 질문 도구로 직접 fallback하고, 그마저 없을 때만 간결한
  plain-text 질문을 사용한다. 가속기가 없더라도 protocol의 하네스-네이티브 기본
  실행 레일은 그대로 진행한다.

## 템플릿

- `templates/raw/` — raw PRD/ADR/bugfix/notes starter templates
- `templates/wiki/index.md` — 소비 프로젝트 `docs/wiki/index.md` starter template
  - feature taxonomy는 broad bucket이 아니라 프로젝트별 세부 카테고리를 점진적으로 추가하는 방식을 전제로 둔다
- `templates/examples/` — 채워진 PRD/ADR 짝 예시와 "무엇이 어디에 사는가" 고도 가이드
  - 코드레벨 디테일이 PRD에 새는 것을 막는 단일 출처 루브릭(3층 고도·누수 self-check·부검 대조표)
  - 산출물의 **사람 지칭 중립화**(개인 호칭·별명 누수 금지) 단일 출처 규칙도 여기 있다
  - `prd-helper`/`adr-helper`/`prd-writer`/`architect`가 이 가이드를 얇게 참조한다(복제 금지)

## 가이드

- `guides/implementation-guidelines.md` — 소비 프로젝트들의 자동 코드리뷰 지적 264건을
  전수 클러스터링한 **구현 시점 예방 규칙**의 단일 출처. `feature-develop`의 architect가
  표면 인덱스로 해당 섹션만 골라 구현 브리핑에 발췌하고, `domain-engineer`/`ui-engineer`/
  `test-engineer`가 얇게 참조한다(전체 로드 금지·복제 금지).

## 소비 프로젝트 실행 흐름

### 1. 세션 시작

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `harness/protocols/session-start.md`
4. 현재 요청과 관련된 raw unit

### 2. 작업 정의 (단계별 진입)

각 단계는 독립 진입점이다. 무엇을 할지 모르면 1부터, 작업이 이미 정해졌으면
2부터, PRD만 쓰면 3부터 들어간다.

확정된 **작은** 작업 단위를 kickoff→(prd/adr)→feature-develop→make-pr→PR 리뷰 수렴까지
**사용자 개입 없이 한 번에** 진행하려면 `harness/protocols/one-shot.md`를 쓴다. 호출
자체가 사용자의 포괄 사전위임이 되어 각 승인 게이트를 `harness:approve --transport one-shot`
으로 자동 부여·기록하고(quote는 위임 발화 verbatim), 리뷰 clean에서 정지한다(머지는 수동).
열린 아이디어는 대상이 아니다 — 먼저 1(next-feature)로 작업을 확정한다.

1. `harness/protocols/next-feature.md` — 다음 작업 단위 추천/선택
2. `harness/protocols/kickoff.md` — 브랜치 + raw 골격 생성
3. `harness/protocols/prd-helper.md` — PRD 작성 보조(interview/research/review)
4. `harness/protocols/adr-helper.md` — ADR 작성 보조(선택)

각 단계는 PRD/ADR을 `review`/`proposed`로만 만든다. 구현과 `approved`/`accepted`
전환은 사용자 명시 승인 이후 별도로 진행한다. `$kickoff`는 각 단위에 단계 체크포인트
원장 `state.md`를 만든다. 승인 전환은 오직 `npm run harness:approve`로만 하며(사용자 발화
verbatim을 원장에 기록), 에이전트가 직접 frontmatter status를 `approved`/`accepted`로
고치지 않는다. `harness:check`가 승인 이벤트 없는 전환과 원장 불일치를 막는다.

### 3. 기능 개발

승인된 PRD/ADR 기반 구현 요청이면:

1. `harness/protocols/feature-develop.md`
2. 관련 raw PRD/ADR/notes
3. 필요한 role 문서
4. 작업 표면에 해당하는 `harness/guides/implementation-guidelines.md` 섹션
   (§0 코어 원칙 + 표면 인덱스로 선택 — 전체 로드 금지)

구조, 데이터, engine, dependency, 다중 모듈 변경은 설계를 먼저 확정한 뒤 구현한다
(`architect` role로 계획을 수립하고, `$ralplan`이 설치돼 있으면 계획 게이트로 쓴다).
승인된 branch-sized 구현의 기본 실행 레일은 `architect → domain/ui/test →
integrator` role 체인이고, `$ralph`가 설치돼 있으면 가속기로 쓸 수 있다. 작은 국소
수정만 solo execute를 허용한다.

### 4. 통합

완료 직전에는:

1. `harness/protocols/wiki-ingest.md`
2. `harness/protocols/artifact-validation.md`
3. `harness/protocols/integration-gate.md`
4. `harness/protocols/commit-protocol.md`

## 프로토콜

- [세션 시작](protocols/session-start.md)
- [Next Feature](protocols/next-feature.md)
- [One-Shot](protocols/one-shot.md)
- [Kickoff](protocols/kickoff.md)
- [PRD Helper](protocols/prd-helper.md)
- [ADR Helper](protocols/adr-helper.md)
- [Harness Init](protocols/harness-init.md)
- [기능 개발](protocols/feature-develop.md)
- [Wiki ingest](protocols/wiki-ingest.md)
- [아티팩트 검증](protocols/artifact-validation.md)
- [통합 게이트](protocols/integration-gate.md)
- [커밋 프로토콜](protocols/commit-protocol.md)
- [UI 검증](protocols/ui-verification.md)

## 역할

- [Intake helper](roles/intake-helper.md)
- [Unit planner](roles/unit-planner.md)
- [PRD writer](roles/prd-writer.md)
- [Researcher](roles/researcher.md)
- [Reviewer](roles/reviewer.md)
- [Architect](roles/architect.md)
- [Designer](roles/designer.md)
- [Domain engineer](roles/domain-engineer.md)
- [UI engineer](roles/ui-engineer.md)
- [Test engineer](roles/test-engineer.md)
- [Integrator](roles/integrator.md)

## 명령

소비 프로젝트는 하네스 npm 스크립트를 갖지 않는다. 각 단계는 플러그인 스킬·커맨드
(`/llm-project-harness:<name>`)로 부르고, 스킬 어댑터는 엔진을 세션 안에서
`${CLAUDE_PLUGIN_ROOT}/scripts/harness/*.mjs`로 실행한다. CI에서는 공용 composite
action이 게이트를 돌린다.

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/kickoff.mjs" --type feature --slug main-layout --title "메인 레이아웃" --area "메인 레이아웃"
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/approve.mjs" --unit docs/raw/feature/main-layout --quote "<사용자 승인 발화>" --adr
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/wiki-ingest.mjs" docs/raw/feature/main-layout --area "메인 레이아웃"
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/artifact-check.mjs"
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/gate.mjs"
```

`wiki-ingest`는 raw unit을 `docs/wiki/index.md`의 **영역(area)별 시간순 계보**에
연결한다(area는 `prd.md`/`bugfix.md` frontmatter에 선언). 하네스 공용 표면을 바꾸는
커밋은 `CHANGELOG.md`에 항목을 남기고, 소비 프로젝트는 플러그인 갱신 후 `/harness-init`을
다시 실행해 정합성을 맞춘다.

`approve`는 PRD를 `review`→`approved`(및 `--adr`로 ADR `proposed`→`accepted`)로
전환하는 **유일한 정규 경로**다. 사용자의 명시 승인 발화 없이는 실행하지 않는다.
추가로 승인 상태 직접 편집을 런타임에서 차단하는 PreToolUse 가드 훅
(`scripts/harness/claude-approval-guard.mjs`)을 `/harness-init`이 opt-in으로 배선할 수 있다.

`gate`는 `artifact-check`, `lint`, `build`, `test:run`을 순서대로 실행한다.
실패하면 다음 단계로 넘어가지 않는다.
