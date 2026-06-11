# 크로스 에이전트 하네스

이 디렉터리는 Codex, ClaudeCode, 이후의 다른 LLM 에이전트가 같은 방식으로
프로젝트를 이해하고 작업하도록 만드는 공용 제어면이다. `.claude/`와
`.codex/`는 실행 도구별 어댑터일 뿐이며, 규칙의 진실 원천은 이
`docs/harness/` 레이어다.

## 핵심 원칙

- 모든 프로젝트 작성 문서는 한국어를 기본으로 한다.
- branch 이름이 raw work unit의 id다.
- raw source는 `docs/raw/`에 남기고, wiki는 `docs/wiki/index.md` 한 장으로
  얇게 유지한다.
- 작업 단위가 확정되기 전에는 `$do-next`를 먼저 실행한다.
- `$do-next`는 작업 단위 확정, branch 생성, raw PRD/ADR 작성, 명시 승인 기록까지
  담당하고 구현은 시작하지 않는다.
- 구현은 승인된 PRD/ADR을 기준으로 진행하고, 완료 전 `integration-gate`를 통과한다.
- 모든 의미 있는 커밋은 `관련 문서:` 블록으로 raw PRD/ADR 또는 허용된 Notes를
  링크한다.
- 에이전트는 PRD/ADR 초안을 작성할 수 있지만, 사용자 승인 전 PRD를 `approved`,
  ADR을 `accepted`로 바꾸지 않는다.

```txt
feature/quiz-data-contract   -> docs/raw/feature/quiz-data-contract/
bugfix/ability-trigger-order -> docs/raw/bugfix/ability-trigger-order/
chore/cross-agent-harness    -> docs/raw/chore/cross-agent-harness/
```

허용 브랜치 prefix는 `feature/`, `bugfix/`, `chore/`다. slash 뒤 slug는
kebab-case로 작성하며, `misc`, `update`, `fix`, `work`처럼 핵심 내용을
설명하지 않는 이름은 금지한다.

## 실행 흐름

### 1. 열린 요청

사용자가 "이제 뭐하지?", "이 아이디어를 작업 단위로 쪼개줘"처럼 넓게
시작하면:

1. `protocols/session-start.md`
2. `protocols/do-next.md`
3. 필요 시 `protocols/work-intake.md`
4. 필요 시 `protocols/prd-drafting.md`
5. `roles/intake-helper.md`
6. `roles/unit-planner.md`
7. `roles/prd-writer.md`

이 흐름은 raw unit과 PRD/ADR 승인까지 진행한다. `work-intake`와 `prd-drafting`은
새 표준 진입점이 아니라 `$do-next`의 내부 단계 또는 호환 별칭이다.

### 2. 기능 개발

작업 단위와 PRD/ADR이 이미 승인되어 있고 구현을 요청받으면:

1. `protocols/raw-start.md`
2. `protocols/feature-develop.md`
3. `roles/architect.md`
4. `roles/domain-engineer.md`
5. `roles/ui-engineer.md`
6. `roles/test-engineer.md`
7. `roles/integrator.md`

기능 개발은 PRD/ADR을 먼저 읽고, 승인 상태와 `approval:` 근거를 확인한 뒤
진행한다. 구조, 데이터, engine, harness, dependency, 다중 모듈 변경은 `$ralplan`을
먼저 거친다. 승인된 branch-sized 구현은 `$ralph`가 기본 실행 레일이며, 작은
문서/오타/국소 수정만 solo execute를 허용한다.

bugfix/chore라도 제품 방향, 데이터 구조, 엔진 경계, 하네스 정책처럼 durable
decision을 바꾸면 PRD/ADR을 추가한다. notes-only는 작고 결정이 없는 유지보수
예외다.

PRD `approved`와 ADR `accepted`는 사용자 승인 근거가 필요하다.

```yaml
approval: "user:YYYY-MM-DD:<짧은 승인 근거>"
```

### 3. 통합

완료 직전에는:

1. `protocols/wiki-ingest.md`
2. `protocols/artifact-validation.md`
3. `protocols/integration-gate.md`
4. `protocols/commit-protocol.md`

`integrator`가 이 순서를 책임진다.

## 프로토콜

- [세션 시작](protocols/session-start.md)
- [Do Next](protocols/do-next.md)
- [작업 인테이크](protocols/work-intake.md)
- [PRD 작성](protocols/prd-drafting.md)
- [Raw 시작](protocols/raw-start.md)
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
- [Architect](roles/architect.md)
- [Domain engineer](roles/domain-engineer.md)
- [UI engineer](roles/ui-engineer.md)
- [Test engineer](roles/test-engineer.md)
- [Integrator](roles/integrator.md)

## 명령

```sh
npm run harness:start -- --type feature --slug main-layout --title "메인 레이아웃"
npm run harness:ingest -- docs/raw/feature/main-layout
npm run harness:check
npm run harness:gate
```

`harness:gate`는 `harness:check`, `lint`, `build`, `test:run`을 순서대로
실행한다. 실패하면 다음 단계로 넘어가지 않는다.

커밋할 때는 `git add -A`, `git add .`, `git add *`, `--no-verify`를 사용하지
않는다. `docs/harness/protocols/commit-protocol.md`의 HEREDOC 형식과 PRD/ADR
링크 정책을 따른다.

## 도구별 어댑터

- ClaudeCode: `.claude/commands`, `.claude/skills`, `.claude/agents`
- Codex: `.codex/skills`, `.codex/agents`

어댑터는 이 디렉터리를 가리키는 얇은 진입점이다. 새 규칙을 추가하거나
수정할 때는 먼저 `docs/harness/`를 업데이트한 뒤 어댑터를 맞춘다.
