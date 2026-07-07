# Next Feature 프로토콜

`$next-feature`는 "이제 뭐하지?", "다음 작업 단위 잡아줘" 같은 열린 요청을 받아
branch-sized 작업 단위 후보를 추천하고 하나를 확정하는 단계다. 구현도, PRD 작성도
하지 않는다. 다음 단계는 초기세팅(`$kickoff`)이다.

이 단계는 독립 진입점이다. 이미 다음에 할 작업을 정했다면 건너뛰고 바로
`$kickoff`로 들어가도 된다.

## 목적

- 열린 아이디어를 작고 검증 가능한 작업 단위 후보로 바꾼다.
- 사용자 의도, 비목표, 결정 경계를 먼저 확정한다(`$deep-interview`가 있으면 그 스킬을 우선 사용하고, 없으면 현재 런타임의 구조화 질문 도구를 우선 사용하며 그마저 없을 때만 명시 질문).
- 후보를 3~5개로 좁혀 추천하고 하나를 선택한다.
- 구현/PRD/ADR 작성은 다음 단계로 넘긴다.

## 담당 역할

- `intake-helper`: 후보를 발굴하고 추천한다.
- `unit-planner`: 후보를 branch/raw 단위로 자른다.

## 단계

### Phase 0: 컨텍스트 로딩

1. `AGENTS.md`, `docs/wiki/index.md`, `.harness/harness/README.md`를 읽는다.
2. 현재 브랜치와 관련 raw unit을 확인한다.
3. 기존 raw unit이 새 요청과 충돌하면 먼저 사용자에게 결정 경계를 묻는다.

### Phase 1: 딥 인터뷰

1. `$deep-interview`가 설치돼 있으면 그 스킬로 인터뷰를 진행한다. 질문 transport는
   deep-interview 내부에서 현재 surface에 맞게 선택한다.
2. `$deep-interview`가 없을 때만 현재 런타임의 구조화 질문 도구로 직접 질문을
   제시하고 답을 받는다. 구조화 질문 도구가 없을 때만 한 번에 하나의 간결한 명시
   질문으로 fallback한다.
3. 아래가 충분히 명확해질 때까지 진행한다: 목표, 성공 기준, 범위, 비목표,
   사용자가 직접 결정해야 하는 경계.

### Phase 2: 후보 추천

3~5개의 후보를 제안한다. 각 후보는 아래 필드를 갖는다.

| 필드 | 설명 |
| --- | --- |
| `type` | `feature`, `bugfix`, `chore` 중 하나 |
| `branch` | `feature/<kebab-slug>` 형식 |
| `raw path` | `docs/raw/<type>/<slug>/` |
| `title` | 한국어 작업 제목 |
| `area` | 이 작업이 발전시키는 기능/구조 영역. `docs/wiki/index.md`의 `### 헤딩`에서 기존 영역을 확인해 연속이면 그 이름을 오타 없이 그대로 재사용(정확히 일치), 없으면 신설, broad 금지. 여러 개면 콤마 |
| `section` | (선택) area 상위 단위. 프로젝트가 섹션을 쓰면 이 작업이 속한 섹션을 단일 값으로. 섹션 2개 이상이면 wiki가 섹션별 파일로 분리된다. 안 쓰면 생략 |
| `why now` | 지금 해야 하는 이유 |
| `scope` | 이 작업에 포함할 것 |
| `non-scope` | 이 작업에서 제외할 것 |
| `risk` | 가장 큰 불확실성 또는 결합 |
| `verification` | 완료를 증명할 검증 |
| `PRD/ADR` | PRD/ADR 필요 여부와 이유 |

우선순위는 아래 순서로 판단한다.

1. 현재 제품 방향을 더 선명하게 만드는가?
2. 다음 기능들의 기반이 되는가?
3. 한 브랜치에서 끝낼 수 있을 만큼 작은가?
4. 사용자에게 빨리 확인 가능한 결과를 주는가?
5. raw/wiki/테스트로 추적 가능하게 남길 수 있는가?

### Phase 3: 작업 단위 확정

1. 1순위 후보와 추천 이유를 제시한다.
2. 사용자가 하나를 선택하면 branch name을 확정한다(`feature/<kebab-slug>` 등).
3. branch slug는 작업 핵심을 설명해야 한다. `misc`, `update`, `fix`, `work`는 쓰지 않는다.
4. 확정된 작업 단위를 `docs/raw/.next-unit`에
   `<type>/<slug> | <한국어 제목> | <영역> | <섹션>` 한 줄로 기록한다(영역이 여러 개면 콤마,
   섹션은 선택이라 안 쓰면 4번째 필드를 비운다). 다음 `$kickoff`가 이 anchor를 읽어 resolved
   단위와 대조하고, 3번째 필드의 영역과 4번째 필드의 섹션을 `--area`/`--section` 없이도
   frontmatter에 시드한 뒤 소비한다. 채팅에만 남기면 kickoff가 다른 slug/영역으로 흘러도
   무탐지로 통과하므로 anchor를 남긴다.

## 출력 형식

```md
## 추천 후보

### 1. <제목>
- type:
- branch:
- raw path:
- area:
- section: (선택)
- why now:
- scope:
- non-scope:
- risk:
- verification:
- PRD/ADR:

## 1순위 추천
<추천 이유>

## 다음 단계
선택한 작업 단위를 `$kickoff`로 넘긴다.
```

질문은 최대 3개로 제한한다. 합리적 가정이 가능하면 질문 대신 가정을 명시한다.

## 다음 단계

선택된 작업 단위는 `$kickoff`(초기세팅)로 넘어가 브랜치와 raw unit을 생성한다.
PRD 작성은 그 다음 `$prd-helper`가 맡는다.

## 실패 모드

- **나쁨:** "앱 만들기"처럼 너무 큰 후보를 하나만 제안한다.
- **좋음:** `feature/data-contract`, `feature/main-layout`처럼 독립 단위로 쪼갠다.

- **나쁨:** 후보를 정하자마자 구현하거나 PRD를 확정한다.
- **좋음:** 후보 선택까지만 진행하고 초기세팅과 PRD 작성은 다음 단계로 넘긴다.
