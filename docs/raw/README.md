# Raw Sources

Raw source는 이 프로젝트의 지속 가능한 진실 원천이다. wiki는 이 파일들을
가리키는 얇은 네비게이션 레이어만 맡는다.

## 디렉터리 구조

```txt
docs/raw/
  _templates/
  feature/
    branch-slug/
      prd.md
      adr.md
      notes.md
  bugfix/
    branch-slug/
      bugfix.md
      notes.md
      prd.md
      adr.md
  chore/
    branch-slug/
      notes.md
      prd.md
      adr.md
```

새 raw unit 디렉터리는 브랜치 이름에서 파생한다.

```txt
feature/quiz-data-contract   -> docs/raw/feature/quiz-data-contract/
bugfix/ability-trigger-order -> docs/raw/bugfix/ability-trigger-order/
chore/cross-agent-harness    -> docs/raw/chore/cross-agent-harness/
```

과거 날짜 prefix raw unit은 legacy record로 남긴다.

## Unit Type

- `feature/`: 제품 능력 또는 사용자-facing workflow.
- `bugfix/`: 결함 조사와 수정.
- `chore/`: 설정, 저장소 정리, 문서, 도구, 하네스 유지보수.

## Feature 개발 흐름

1. `feature/<kebab-slug>` 브랜치를 만들거나 전환한다.
2. `npm run harness:start -- --title "기능 제목"`을 실행한다.
3. `docs/raw/feature/<kebab-slug>/prd.md`를 채운다.
4. `docs/raw/feature/<kebab-slug>/adr.md`를 채운다.
5. 구현 또는 검증 맥락이 다음 세션에 필요하면 `notes.md`에 남긴다.
6. `npm run harness:ingest -- docs/raw/feature/<kebab-slug>`를 실행한다.
7. `npm run harness:check`를 실행한다.
8. 커밋 본문에는 `관련 문서:` 블록으로 PRD/ADR 링크를 넣는다.
9. 커밋 trailer에는 `Related: docs/raw/<type>/<slug>/`를 넣는다.

## 승인 상태

에이전트는 PRD/ADR 초안을 작성할 수 있지만, 사용자 승인 전에는 PRD를
`approved`, ADR을 `accepted`로 바꾸지 않는다.

승인된 PRD/ADR에는 frontmatter 승인 근거가 필요하다.

```yaml
approval: "user:YYYY-MM-DD:<짧은 승인 근거>"
```

게이트 도입 전 legacy raw만 아래 marker를 사용할 수 있다.

```yaml
approval: "legacy-before-approval-gate"
```

## Notes-Only 예외

bugfix/chore는 작은 유지보수 작업이라면 notes-only raw unit을 사용할 수 있다.
하지만 아래 변경은 notes-only로 끝내지 않는다.

- 제품 방향 변경
- 데이터 구조 변경
- engine boundary 변경
- UI architecture 변경
- harness 또는 commit protocol 변경
- 새 dependency, data source, generated data pipeline 결정

이런 경우 bugfix/chore라도 PRD/ADR을 추가한다.

## 규칙

- raw source는 public-safe해야 한다. credential, private account detail,
  local-only clone command, 불필요한 third-party source-code provenance를 남기지
  않는다.
- PRD나 ADR이 accepted 상태가 되면 본문을 고쳐 쓰기보다 superseding ADR 또는
  notes를 추가한다.
- `docs/wiki/index.md`는 얇게 유지한다. 자세한 내용은 wiki가 아니라 raw unit에 둔다.
- `docs/harness/`를 Codex/ClaudeCode 공용 process contract로 사용한다.
