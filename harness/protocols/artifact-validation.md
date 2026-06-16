# 아티팩트 검증 프로토콜

raw/wiki/harness 문서가 프로젝트 규칙을 지키는지 확인한다. 소비 프로젝트의
자동 검증은 `.harness/scripts/harness/artifact-check.mjs`가 수행하고, 에이전트는
실패 원인을 읽고 수정해야 한다.

## 명령

```sh
npm run harness:check
```

## 자동 검증 항목

- `docs/wiki/`에는 `index.md`만 존재한다.
- wiki의 raw link는 실제 파일을 가리킨다.
- 모든 raw unit은 wiki index에서 찾을 수 있다.
- work branch는 `feature/*`, `bugfix/*`, `chore/*` 형식이다.
- work branch와 raw path가 일치한다.
- feature raw unit에는 `prd.md`와 `adr.md`가 있다.
- frontmatter 문서에는 `title`, `date`, `status`, `unit_type`이 있다.
- `approved` PRD와 `accepted` ADR에는 `approval: "user:YYYY-MM-DD:<근거>"` 형식의 승인
  근거가 기록돼 있다. 자동 검사는 근거의 형식과 존재를 강제한다. 근거가 형님의 실제
  동의를 반영하는지는 아래 수동 검토 항목에서 확인한다.
- raw unit의 status는 git 기록 대비 명백한 후퇴로 바뀌지 않는다(예: PRD `approved`→`draft`, ADR `accepted`→`proposed`). reopen(`rejected`→`draft`)이나 retire(`accepted`→`superseded`)는 허용한다.
- ADR의 `related_prd`와 `supersedes` 링크는 실제 파일을 가리킨다(값이 비어 있으면 검사하지 않는다).
- `accepted`/`deprecated`/`superseded` ADR의 본문은 git 기록 대비 바뀌지 않는다. status/approval 같은 frontmatter 변경은 허용한다.
- public docs에는 금지된 출처/세션/로컬 설정 정보가 없다.
- 공용 harness role은 Codex/ClaudeCode agent adapter를 가진다.
- 공용 harness skill은 Codex/ClaudeCode skill adapter 또는 command adapter를 가진다.
- Codex/ClaudeCode는 `next-feature`, `kickoff`, `prd-helper`, `adr-helper` skill adapter를 가진다.
- Codex/ClaudeCode는 `submodule-attach` skill adapter를 가진다.

## 수동 검토 항목

자동 검사가 모든 품질을 보장하지는 않는다. integrator는 아래도 확인한다.

- 새 PRD/ADR/notes가 한국어로 작성되었는가?
- PRD 수용 기준이 관찰 가능한가?
- ADR이 placeholder 상태로 남아 있지 않은가?
- raw unit 이름이 브랜치 핵심 내용을 설명하는가?
- wiki가 합성 문서처럼 길어지지 않았는가?
- 새 의존성을 추가했다면 사용자가 동의했는가?
- 제품/도메인 구조 변경인데 notes-only 예외를 사용하지 않았는가?
- 하네스 submodule 업데이트나 adapter 정리가 제품 기능 변경과 섞이지 않았는가?
- 커밋할 작업에 PRD/ADR이 필요하다면 raw unit에 두 문서가 있는가?
- 커밋 본문에 넣을 `관련 문서:` 블록 경로가 실제 파일을 가리키는가?
- PRD `approved`나 ADR `accepted` 전환이 사용자 승인 없이 이루어지지 않았는가?

## ADR 불변성

accepted ADR은 과거 결정의 근거다. 내용을 고쳐 쓰지 않는다. 이 규칙은
`harness:check`가 git 기록 대비 본문 변경을 차단해 기계강제한다. 오타 수정조차
본문을 바꾸므로, 결정 내용을 바꾸려면 본문을 고치지 말고 superseding ADR을 새로
추가한다(status/approval frontmatter 변경과 superseding ADR 추가는 허용한다).

ADR은 에이전트가 단독으로 `accepted` 처리하지 않는다. 사용자의 명시 승인이 있을
때만 아래 frontmatter를 추가하고 status를 전환한다.

```yaml
status: accepted
approval: "user:YYYY-MM-DD:<짧은 승인 근거>"
```

허용:

- `status` 변경
- `approval` 근거 추가
- superseding ADR 추가
- notes에 후속 맥락 추가

금지:

- accepted ADR 본문을 현재 생각에 맞게 재작성
- 과거 선택지/선택 근거를 삭제
- 결정 근거를 wiki에만 남기고 raw에 남기지 않기

## 실패 처리

검사가 실패하면 다음 단계로 진행하지 않는다. 실패 항목을 수정한 뒤
`harness:check`를 다시 실행한다.

자동 검사가 통과해도 수동 검토 항목이 실패하면 integration gate를 통과한 것으로
보지 않는다. 특히 제품/도메인 PRD/ADR이 필요한 변경을 notes-only로 처리한
경우에는 raw unit을 보강한 뒤 wiki ingest를 다시 실행한다.
