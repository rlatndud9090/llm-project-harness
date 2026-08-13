# 세션 시작 프로토콜

모든 에이전트 세션은 같은 순서로 컨텍스트를 로드한다. 이 순서를 지켜야
과거 결정, raw source, 현재 브랜치의 작업 단위를 놓치지 않는다.

## 목적

- wiki index를 통해 현재 프로젝트 방향을 빠르게 파악한다.
- 현재 브랜치가 가리키는 raw unit을 확인한다.
- 필요한 PRD/ADR만 읽어 컨텍스트를 과하게 불리지 않는다.
- 열린 요청이면 `$next-feature`로, 작업이 정해졌으면 `$kickoff`→`$prd-helper`로,
  사전 승인된(pre-approved) PRD/ADR 기반 구현 요청이면 `$feature-develop`로, 구현이 끝나
  PR을 만들 차례면 `$make-pr`로 진입한다.

## 절차

1. `AGENTS.md`를 읽는다.
2. `docs/wiki/index.md`를 읽는다.
3. `harness/README.md`를 읽는다(플러그인 제공, 세션 안에서는 `${CLAUDE_PLUGIN_ROOT}/harness/README.md`).
4. 현재 브랜치를 확인한다.
   ```sh
   git rev-parse --abbrev-ref HEAD
   ```
5. 브랜치가 `feature/*`, `bugfix/*`, `chore/*`이면 raw path를 계산한다.
   ```txt
   feature/foo -> docs/raw/feature/foo/
   ```
6. 해당 raw unit이 있으면 **`state.md`를 가장 먼저 읽는다.** `stage`와 `## 승인 이벤트`가
   이 작업 단위의 현재 단계·승인 여부의 단일 진실원이다. 그다음 필요한 만큼 `prd.md`,
   `adr.md`, `notes.md`를 읽는다.
7. 새 세션/새 에이전트로 이어받을 때는 `state.md`의 `stage`에서 재개한다. 채팅 히스토리나
   추측으로 승인 여부를 판단하지 않는다. 승인 이벤트가 없으면 아직 미승인이다.
8. 브랜치가 `main`이면 wiki index에서 현재 요청과 관련된 raw link만 따라간다.
9. product/architecture 결정을 하기 전에는 반드시 관련 PRD/ADR을 읽는다.

## 분기 판단

| 사용자 요청 | 진입 프로토콜 |
| --- | --- |
| "이제 뭐하지?", "다음 뭐 할까?" | `next-feature.md` |
| "이 아이디어를 작업 단위로 쪼개줘" | `next-feature.md` |
| 확정된 작은 작업을 PR 리뷰 수렴까지 무인으로 진행 | `one-shot.md` |
| 작업 단위 초기세팅(raw 생성 + 브랜치 정리) | `kickoff.md` |
| PRD 작성/보강 | `prd-helper.md` |
| ADR 작성/보강 (필요 시) | `adr-helper.md` |
| 하네스 플러그인 적용/이관 | `lph-init.md` |
| 사전 승인된(pre-approved) PRD/ADR 기반 기능 구현 | `feature-develop.md` |
| 최종 확정 + 커밋 + PR 생성 | `make-pr.md` |
| 검증/커밋 | `integration-gate.md`, `commit-protocol.md` |

## 스킬과 명령

ClaudeCode에서 같은 단계가 `/command`와 skill 두 표면으로 노출되면(`kickoff`,
`wiki-ingest`, `artifact-check`), `/command`는 사람이 직접 부르는 진입점이고 같은
이름의 skill은 모델이 자동 트리거하는 진입점이다. 둘 다 같은 protocol 문서를 기준으로
동작한다. 플러그인 스킬·커맨드는 namespace(`/llm-project-harness:<name>`)로 노출된다.

## 위임 비용 (항상 인지)

토큰은 유한한 자원이다. 서브에이전트 fan-out과 워크플로우는 **기본값이 아니라 작업 크기가
정당화할 때만** 쓰는 가속기다. 각 단계는 위임 전에 크기를 먼저 판정한다.

- **bugfix·chore·한 파일 국소 수정·단순 문서/PRD**: 오케스트레이터(메인)가 직접 작게
  수행한다. 역할별 서브에이전트를 줄줄이 띄우지 않는다.
- **feature**라도 fan-out 폭은 규모에 비례시킨다. 다중 모듈·구조/데이터/경계 변경·높은
  불확실성처럼 병렬 분업이 실제로 이득일 때만 역할 체인을 펼치고, 아니면 최소 위임(1~2
  역할)이나 solo로 둔다.
- 적대적 검증·리뷰 라운드도 결정의 중대도에 비례한다. 사소한 변경에 다수결 검증을 붙이지 않는다.
- ultracode처럼 철저함 모드가 켜져 있어도 이 규율은 유지된다 — 철저함은 fan-out 폭이 아니라
  판단의 깊이로 확보한다.
- **판단이 모호하면 조용히 작게 처리하지 않는다(가드레일).** 작게 갈지 fan-out 할지 경계선에
  걸리는 작업은 현재 런타임의 구조화 질문 도구(ClaudeCode는 `AskUserQuestion`)로 사용자에게
  확인한다. 아끼려다 필요한 분업을 놓치는 것도 실패다 — **명백히 작으면 직접, 명백히 크면 fan-out,
  모호할 때만 묻는다**(명백한 경우까지 묻지 않아 질문 폭탄을 피한다). 이 확인은 자율 실행(워크플로우)
  바깥, 오케스트레이터에서 위임 착수 전에 한다.
- **위임할 때는 서브에이전트가 재탐색하지 않게 컨텍스트를 주입한다.** 서브에이전트는 격리 컨텍스트라
  오케스트레이터가 읽은 것을 물려받지 못한다 — task 프롬프트에 필요한 요지(관련 결정·수용 기준·건드릴
  파일 경로+역할·인터페이스 계약)를 넣어 준다. "알아서 다 찾아라"로 던지면 N명이 각자 처음부터
  재로드·재탐색해 토큰이 곱으로 는다. 같은 코드 지도는 한 번 만들어(plan/notes) 여러 역할이 공유한다.

## 금지

- wiki index를 읽지 않고 바로 구현하지 않는다.
- 모든 raw 파일을 무작정 읽지 않는다.
- 브랜치명과 raw path가 다를 때 조용히 진행하지 않는다.
- product/architecture 결정을 채팅에만 남기지 않는다.
- `state.md`의 사전 승인 이벤트(`PREAPPROVAL`) 없이 PRD를 `pre-approved`, ADR을 `pre-accepted`로
  전환하거나 구현을 시작하지 않는다. 최종 확정(`approved`/`accepted`)은 `$make-pr`에서 최종 승인
  이벤트(`APPROVAL`)와 함께만 한다. 두 전환 모두 오직 `harness:approve`(최종은 `--final`)로만 한다.
- 사용자의 의도·아이디어 발화("이렇게 하려고 했어" 등)를 (사전/최종) 승인으로 추론하지 않는다.

## 출력

세션 시작 후 사용자에게 길게 보고할 필요는 없다. 다만 중요한 분기에서는
한 줄로 현재 모드를 알려준다.

```txt
현재 작업 단위: feature/data-contract
raw unit: docs/raw/feature/data-contract/
진입: PRD/ADR 기반 feature-develop
```

## 사용자에게 로컬 경로·링크를 제시하는 규약

사용자에게 **로컬 파일·디렉터리 경로나 로컬 리소스를 제시할 때는 raw 경로를 나열하지 말고
마크다운 링크 문법 `[한국어 설명](절대경로)`으로, 경로는 절대경로로 준다.** raw 절대경로를
그대로 주면 워크트리 격리·일부 터미널에서 하이픈 등으로 링크가 잘려 클릭해도 안 열리지만,
마크다운 링크로 감싸면 온전히 클릭돼 열린다(사용자가 직접 열어야 하는 디자인 비교 HTML·화면
스크린샷·산출물 파일 등 모든 로컬 경로에 적용). 이 규약은 사용자에게 화면으로 보여 주는
경로에 한한다 — 커밋 본문의 `관련 문서:` 링크처럼 기계가 파싱하는 자리에는 적용하지 않는다.
