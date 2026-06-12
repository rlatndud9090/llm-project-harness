# 커밋 프로토콜

이 프로젝트는 `AGENTS.md`의 Lore Commit Protocol을 따른다. 커밋은 단순한
diff 라벨이 아니라 raw PRD/ADR/notes와 연결되는 결정 기록이다.

## 적용 원칙

- 하나의 논리적 작업 단위는 하나의 커밋으로 묶는다.
- 의미 있는 제품, 아키텍처, 구현 변경은 관련 PRD와 ADR을 가진다.
- 하네스 submodule 업데이트나 adapter 정리는 제품 기능 변경과 분리한다.
- 커밋 본문에는 `관련 문서:` 블록을 반드시 둔다.
- Lore trailer는 커밋의 제약, 검증, 위험, raw unit 연결을 남기는 데 사용한다.
- 검증하지 않은 내용을 `Tested:`에 쓰지 않는다.

## 커밋 전 조건

1. `git status --short --branch`로 현재 브랜치와 변경 파일을 확인한다.
2. 관련 raw unit이 있는지 확인한다.
3. 필요한 경우 `npm run harness:ingest -- docs/raw/<type>/<slug>`를 실행한다.
4. `npm run harness:gate`를 실행하고 출력까지 읽는다.
5. 관련 파일만 명시적으로 stage한다.
6. `git diff --cached --check`를 실행한다.
7. `git diff --cached`로 민감 정보, unrelated file, 범위 초과 변경을 확인한다.

## 관련 문서 블록

모든 커밋 본문에는 아래 블록이 있어야 한다.

```md
관련 문서:
[PRD](docs/raw/<type>/<slug>/prd.md)
[ADR](docs/raw/<type>/<slug>/adr.md)
```

기본값은 PRD와 ADR 링크다. 특히 아래 변경은 PRD/ADR 링크가 필수다.

- 사용자 경험, 제품 요구사항, 핵심 규칙 변경
- domain/data/UI 구조 변경
- command, state transition, hint, simulation, workflow 같은 엔진 경계 변경
- 새 dependency, data source, generated data pipeline 결정

아래 변경은 기본적으로 Notes 링크를 사용한다.

- 하네스 submodule 업데이트 또는 프로젝트 adapter 정리
- Codex/ClaudeCode adapter, skill, command, role prompt 변경
- 개발자 workflow만 바꾸고 제품/도메인 동작을 바꾸지 않는 운영 변경

작고 결정이 없는 chore/bugfix는 notes-only로 허용한다. 이 경우에도
`관련 문서:` 블록을 생략하지 않는다.

```md
관련 문서:
[Notes](docs/raw/chore/<slug>/notes.md)
```

예외를 쓰는 커밋은 본문이나 `Constraint:`에 PRD/ADR이 필요 없었던 이유를 적는다.
작업 중 제품/도메인 durable decision이 생기면 notes-only 예외를 중단하고 PRD/ADR
또는 ADR을 추가한다.

## 품질 게이트

기본 게이트는 아래 명령 하나다.

```sh
npm run harness:gate
```

이 명령은 다음 단계를 순서대로 실행한다.

1. `npm run harness:check`
2. `npm run lint`
3. `npm run build`
4. `npm run test:run`

실패한 단계가 있으면 커밋하지 않는다. 실패 원인을 읽고 수정한 뒤 처음부터 다시
게이트를 실행한다.

## 스테이징 규칙

관련 파일만 명시적으로 stage한다.

```sh
git add docs/raw/feature/data-contract/prd.md
git add docs/raw/feature/data-contract/adr.md
git add src/domain/dataTypes.ts
git add src/domain/dataTypes.test.ts
```

금지:

```sh
git add -A
git add .
git add *
git commit --no-verify
```

스테이징 제외 대상:

- `.env`, `.env.*`
- credential, token, secret이 포함된 파일
- local config와 runtime log
- 임시 workspace 산출물
- 관련 없는 사용자 변경

## 메시지 형식

커밋 메시지는 HEREDOC으로 전달한다. 짧은 `-m "..."` 한 줄 커밋은 본문과 trailer가
깨지기 쉬우므로 사용하지 않는다.

```sh
git commit -m "$(cat <<'EOF'
<왜 이 변경을 했는지>

<맥락과 접근 이유. 무엇을 바꿨는지가 아니라 왜 이 접근을 택했는지 설명한다.>

관련 문서:
[PRD](docs/raw/<type>/<slug>/prd.md)
[ADR](docs/raw/<type>/<slug>/adr.md)

Constraint: <제약>
Rejected: <기각한 대안> | <기각 이유>
Confidence: <low|medium|high>
Scope-risk: <narrow|moderate|broad>
Directive: <미래 수정자를 위한 지시>
Tested: <실제로 실행한 검증>
Not-tested: <알려진 검증 공백>
Related: docs/raw/<type>/<slug>/
Co-authored-by: OmX <omx@oh-my-codex.dev>
EOF
)"
```

## 필수 trailer

- `Tested:`는 반드시 실제 실행한 검증을 적는다.
- `Not-tested:`는 알려진 공백을 적는다. 공백이 없으면 `None` 대신 구체적 맥락을
  짧게 쓴다.
- `Related:`에는 raw unit 경로를 적는다.
- `Co-authored-by: OmX <omx@oh-my-codex.dev>`는 hook 요구사항이다.

권장 trailer:

- `Constraint:` 외부 제약이나 프로젝트 정책
- `Rejected:` 재검토하면 안 되는 대안과 이유
- `Directive:` 미래 수정자가 지켜야 할 경계
- `Scope-risk:` 변경의 영향 범위
- `Confidence:` 판단 확신도

## 원자적 커밋

- PRD/ADR 작성만 한 커밋과 구현 커밋은 분리할 수 있다.
- 하나의 테스트가 보호하는 구현과 해당 테스트는 같은 커밋에 둘 수 있다.
- 하네스 정책 변경과 제품 기능 구현은 가능하면 분리한다.
- 같은 커밋에 섞어야 한다면 raw notes에 이유를 남긴다.

## 훅 실패 처리

훅 실패는 우회하지 않는다.

1. 실패 로그를 읽는다.
2. 원인을 수정한다.
3. 수정된 파일만 다시 stage한다.
4. `npm run harness:gate`를 다시 실행한다.
5. HEREDOC으로 새 커밋을 만든다.

`--amend`는 사용자가 명시적으로 요청하거나 아직 push하지 않은 방금 전 커밋을
수정하는 상황이 아니면 사용하지 않는다.

## 최종 체크리스트

- [ ] 관련 raw unit이 있는가?
- [ ] `관련 문서:` 블록에 PRD/ADR 또는 허용된 Notes 링크가 있는가?
- [ ] `npm run harness:gate` fresh output을 확인했는가?
- [ ] `git add -A`, `git add .`, `git add *`를 사용하지 않았는가?
- [ ] staged diff에 의도한 파일만 있는가?
- [ ] `git diff --cached --check`가 통과했는가?
- [ ] 민감 정보와 local-only 파일이 없는가?
- [ ] `Related:` raw path가 있는가?
- [ ] `Co-authored-by: OmX <omx@oh-my-codex.dev>`가 있는가?

## 실패 모드

- **나쁨:** "update docs" 같은 제목으로 맥락 없이 커밋한다.
- **좋음:** 왜 하네스나 기능 방향이 바뀌었는지 제목과 본문에 남긴다.

- **나쁨:** 관련 문서 블록 없이 trailer만 둔다.
- **좋음:** 본문에는 PRD/ADR 링크를, trailer에는 `Related:` raw path를 둔다.

- **나쁨:** 검증하지 않았는데 `Tested: all`이라고 쓴다.
- **좋음:** `Tested: npm run harness:gate`, `Not-tested: browser smoke not needed for docs-only change`처럼 정직하게 쓴다.
