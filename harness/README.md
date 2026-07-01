# 크로스 에이전트 하네스

이 디렉터리는 Codex, ClaudeCode, 그리고 다른 LLM 에이전트가 소비 프로젝트에서
같은 방식으로 작업하도록 만드는 공용 제어면이다. 하네스 저장소 안에서는
`harness/`가 source of truth이고, 소비 프로젝트에서는 `.harness/harness/`로
접근한다.

## 핵심 원칙

- 소비 프로젝트의 `docs/raw/`, `docs/wiki/`, `AGENTS.md`는 프로젝트 소유다.
- 하네스는 소비 프로젝트의 `docs/` 아래에 공유 파일이나 symlink를 만들지 않는다.
- 하네스는 raw/wiki/PRD/ADR/검증/커밋 절차와 템플릿을 제공한다.
- 프로젝트 루트의 `.codex/`, `.claude/`는 프로젝트 소유 adapter surface다.
- 하네스 제공 adapter는 개별 symlink로 추가하고, 같은 경로의 로컬 adapter는
  프로젝트 override로 보존한다.
- 작업 단위, 브랜치 정책, PRD/ADR 승인 정책은 소비 프로젝트가 하네스를 사용할 때
  적용한다. 하네스 저장소 자체에 같은 정책을 강제하지 않는다.
- 프로토콜 본문의 `$skill-name`은 "그 하네스 skill을 호출하라"는 표시다(ClaudeCode는
  Skill 도구나 `/skill-name`, Codex는 skill 프롬프트). `$deep-interview`, `$ralph`,
  `$ralplan`, `/team`은 하네스가 배포하지 않는 선택적 외부 가속기다. 질문이
  필요하면 현재 런타임의 구조화 질문 도구를 우선 사용하고, 현재 surface가 실제로
  렌더링할 수 있을 때만 OMX 구조화 질문 surface를 가속기로 쓴다. 구조화 질문
  도구가 없을 때만 간결한 plain-text 질문으로 fallback하고, 가속기가 없더라도
  protocol의 하네스-네이티브 기본 실행 레일은 그대로 진행한다.

## 템플릿

- `templates/raw/` — raw PRD/ADR/bugfix/notes starter templates
- `templates/wiki/index.md` — 소비 프로젝트 `docs/wiki/index.md` starter template
  - feature taxonomy는 broad bucket이 아니라 프로젝트별 세부 카테고리를 점진적으로 추가하는 방식을 전제로 둔다

## 소비 프로젝트 실행 흐름

### 1. 세션 시작

1. `AGENTS.md`
2. `docs/wiki/index.md`
3. `.harness/harness/protocols/session-start.md`
4. 현재 요청과 관련된 raw unit

### 2. 작업 정의 (단계별 진입)

각 단계는 독립 진입점이다. 무엇을 할지 모르면 1부터, 작업이 이미 정해졌으면
2부터, PRD만 쓰면 3부터 들어간다.

1. `.harness/harness/protocols/next-feature.md` — 다음 작업 단위 추천/선택
2. `.harness/harness/protocols/kickoff.md` — 브랜치 + raw 골격 생성
3. `.harness/harness/protocols/prd-helper.md` — PRD 작성 보조(interview/research/review)
4. `.harness/harness/protocols/adr-helper.md` — ADR 작성 보조(선택)

각 단계는 PRD/ADR을 `review`/`proposed`로만 만든다. 구현과 `approved`/`accepted`
전환은 사용자 명시 승인 이후 별도로 진행한다.

### 3. 기능 개발

승인된 PRD/ADR 기반 구현 요청이면:

1. `.harness/harness/protocols/feature-develop.md`
2. 관련 raw PRD/ADR/notes
3. 필요한 role 문서

구조, 데이터, engine, dependency, 다중 모듈 변경은 설계를 먼저 확정한 뒤 구현한다
(`architect` role로 계획을 수립하고, `$ralplan`이 설치돼 있으면 계획 게이트로 쓴다).
승인된 branch-sized 구현의 기본 실행 레일은 `architect → domain/ui/test →
integrator` role 체인이고, `$ralph`가 설치돼 있으면 가속기로 쓸 수 있다. 작은 국소
수정만 solo execute를 허용한다.

### 4. 통합

완료 직전에는:

1. `.harness/harness/protocols/wiki-ingest.md`
2. `.harness/harness/protocols/artifact-validation.md`
3. `.harness/harness/protocols/integration-gate.md`
4. `.harness/harness/protocols/commit-protocol.md`

## 프로토콜

- [세션 시작](protocols/session-start.md)
- [Next Feature](protocols/next-feature.md)
- [Kickoff](protocols/kickoff.md)
- [PRD Helper](protocols/prd-helper.md)
- [ADR Helper](protocols/adr-helper.md)
- [Submodule attach](protocols/submodule-attach.md)
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
- [Domain engineer](roles/domain-engineer.md)
- [UI engineer](roles/ui-engineer.md)
- [Test engineer](roles/test-engineer.md)
- [Integrator](roles/integrator.md)

## 명령

소비 프로젝트의 package scripts는 `.harness/scripts/harness/*.mjs`를 직접 호출한다.

```sh
npm run harness:kickoff -- --type feature --slug main-layout --title "메인 레이아웃"
npm run harness:ingest -- docs/raw/feature/main-layout
npm run harness:check
npm run harness:gate
npm run harness:hooks   # 선택: 현재 git 저장소에 pre-commit + commit-msg 훅 설치
```

`harness:gate`는 `harness:check`, `lint`, `build`, `test:run`을 순서대로 실행한다.
실패하면 다음 단계로 넘어가지 않는다.
