# 세션 시작 프로토콜

모든 에이전트 세션은 같은 순서로 컨텍스트를 로드한다. 이 순서를 지켜야
과거 결정, raw source, 현재 브랜치의 작업 단위를 놓치지 않는다.

## 목적

- wiki index를 통해 현재 프로젝트 방향을 빠르게 파악한다.
- 현재 브랜치가 가리키는 raw unit을 확인한다.
- 필요한 PRD/ADR만 읽어 컨텍스트를 과하게 불리지 않는다.
- 열린 요청이면 `$next-feature`로, 작업이 정해졌으면 `$kickoff`→`$prd-helper`로,
  승인된 PRD/ADR 기반 구현 요청이면 feature-develop로 진입한다.

## 절차

1. `AGENTS.md`를 읽는다.
2. `docs/wiki/index.md`를 읽는다.
3. `.harness/harness/README.md`를 읽는다.
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
| 작업 단위 초기세팅(브랜치/raw 생성) | `kickoff.md` |
| PRD 작성/보강 | `prd-helper.md` |
| ADR 작성/보강 (필요 시) | `adr-helper.md` |
| 하네스 submodule 장착/업데이트 | `submodule-attach.md` |
| 승인된 PRD/ADR 기반 기능 구현 | `feature-develop.md` |
| 검증/커밋 | `integration-gate.md`, `commit-protocol.md` |

## 스킬과 명령

ClaudeCode에서 같은 단계가 `/command`와 skill 두 표면으로 노출되면(`kickoff`,
`wiki-ingest`, `artifact-check`), `/command`는 사람이 직접 부르는 진입점이고 같은
이름의 skill은 모델이 자동 트리거하는 진입점이다. 둘 다 같은 protocol 문서를 기준으로
동작한다. Codex는 skill 표면 하나만 쓴다.

## 금지

- wiki index를 읽지 않고 바로 구현하지 않는다.
- 모든 raw 파일을 무작정 읽지 않는다.
- 브랜치명과 raw path가 다를 때 조용히 진행하지 않는다.
- product/architecture 결정을 채팅에만 남기지 않는다.
- `state.md`의 승인 이벤트 없이 PRD를 `approved`, ADR을 `accepted`로 전환하거나 구현을
  시작하지 않는다. 승인 전환은 오직 `harness:approve`로만 한다.
- 사용자의 의도·아이디어 발화("이렇게 하려고 했어" 등)를 승인으로 추론하지 않는다.

## 출력

세션 시작 후 사용자에게 길게 보고할 필요는 없다. 다만 중요한 분기에서는
한 줄로 현재 모드를 알려준다.

```txt
현재 작업 단위: feature/data-contract
raw unit: docs/raw/feature/data-contract/
진입: PRD/ADR 기반 feature-develop
```
