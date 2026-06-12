# Do Next 프로토콜

`$do-next`는 제품/도메인 아이디어를 하나의 branch-sized 작업 단위와 승인된
PRD/ADR로 바꾸는 표준 진입점이다. 이 프로토콜은 구현하지 않는다. 구현은
PRD/ADR 승인 이후 별도 요청에서 시작한다. 하네스 submodule 업데이트나 adapter
정리 같은 프로젝트 운영 작업은 제품 아이디어와 분리한다.

## 목적

- "이제 뭐하지?", "이 아이디어를 작업 단위로 잡자" 같은 열린 요청을 한 흐름으로 처리한다.
- `$deep-interview`를 사용해 사용자 의도, 비목표, 결정 경계를 먼저 확정한다.
- branch 이름, raw path, PRD/ADR, wiki link를 같은 work unit으로 묶는다.
- 사용자 명시 승인 전에는 PRD `approved`, ADR `accepted` 상태를 만들지 않는다.

## 입력과 출력

```txt
입력: 열린 작업 아이디어 또는 다음 작업 요청
출력: 작업 브랜치 + raw unit + 승인된 PRD/ADR + wiki ingest + harness:check
```

완료 후 상태:

- branch: `feature/<slug>`, `bugfix/<slug>`, `chore/<slug>`
- raw path: `docs/raw/<type>/<slug>/`
- PRD: `status: approved`, `approval: "user:YYYY-MM-DD:<근거>"`
- ADR: 필요 시 `status: accepted`, `approval: "user:YYYY-MM-DD:<근거>"`
- 구현: 시작하지 않음

## 단계

### Phase 0: 컨텍스트 로딩

1. `AGENTS.md`, `docs/wiki/index.md`, `.harness/harness/README.md`를 읽는다.
2. 현재 브랜치와 관련 raw unit을 확인한다.
3. 기존 raw unit이 새 요청과 충돌하면 먼저 사용자에게 결정 경계를 묻는다.

### Phase 1: 딥 인터뷰

1. 각 앱 환경에 설치된 `$deep-interview`를 사용한다.
2. tmux에 붙은 OMX/OMC 런타임이면 `omx question` 같은 런타임 구조화 질문을 사용한다.
3. Codex App처럼 `omx question`이 없는 환경에서는 앱 네이티브 structured input을 사용한다.
4. structured input도 없으면 한 번에 하나의 명시 질문만 묻고 답을 기다린다.
5. 인터뷰는 아래 항목이 충분히 명확해질 때까지 진행한다.
   - 목표
   - 성공 기준
   - 범위
   - 비목표
   - 사용자가 직접 결정해야 하는 경계

### Phase 2: 작업 단위 확정

1. 후보가 여러 개면 3개 이하로 줄여 추천한다.
2. 하나를 선택하면 branch name을 확정한다.

```txt
feature/<kebab-slug>
bugfix/<kebab-slug>
chore/<kebab-slug>
```

3. branch slug는 작업 핵심을 설명해야 한다. `misc`, `update`, `fix`, `work`는 쓰지 않는다.
4. 선택된 branch로 생성 또는 전환한다.
5. `npm run harness:start`로 raw unit을 만들고, 필요하면 PRD/ADR을 추가한다.

### Phase 3: PRD/ADR 작성

1. PRD는 한국어로 작성하고 `review` 상태로 둔다.
2. ADR이 필요한 경우 한국어로 작성하고 `proposed` 상태로 둔다.
3. PRD에는 제품 요구, 비목표, 수용 기준, 열린 질문을 둔다.
4. ADR에는 구조 결정, 대안, 기각 이유, 결과, 검증 방법을 둔다.
5. 구현 세부를 PRD에 숨기지 않는다. 구조 결정은 ADR로 분리한다.

### Phase 4: 명시 승인

PRD/ADR을 승인 상태로 바꾸기 전 반드시 사용자에게 최종 승인 라운드를 진행한다.

승인이 확인되면:

```yaml
approval: "user:YYYY-MM-DD:<짧은 승인 근거>"
```

상태 전환:

- PRD: `review` -> `approved`
- ADR: `proposed` -> `accepted`

명시 승인이 없으면 여기서 멈춘다. `review`/`proposed` 상태를 유지하고 구현으로
넘어가지 않는다.

### Phase 5: 정리

1. `npm run harness:ingest -- docs/raw/<type>/<slug>`를 실행한다.
2. `npm run harness:check`를 실행한다.
3. 결과를 보고하고 종료한다.
4. 구현을 시작하지 않는다.

## 구현 요청으로 이어질 때

승인된 PRD/ADR이 있는 상태에서 사용자가 구현을 요청하면 `feature-develop.md`로
넘어간다. 이때 실행 레일은 아래처럼 고른다.

| 조건 | 필수/기본 레일 |
| --- | --- |
| 구조, 데이터, engine, dependency, 다중 모듈 변경 | `$ralplan` 필수 |
| 승인된 branch-sized 구현 | `$ralph` 기본 |
| 오타, 링크, 한 파일의 작은 문서 수정 | solo execute 허용 |

`$ralplan`은 계획/합의 게이트다. 직접 구현하지 않는다. `$ralph`는 승인된 계획
또는 승인된 PRD/ADR을 기준으로 구현과 검증을 끝까지 밀어붙이는 기본 실행 레일이다.

## 호환 진입점

`work-intake`와 `prd-drafting`은 삭제하지 않는다. 다만 새 작업의 표준 진입점은
항상 `$do-next`이며, 두 기존 스킬은 `$do-next` 내부 단계 또는 호환 별칭으로만
사용한다.

## 실패 모드

- **나쁨:** 후보를 정하자마자 raw unit 없이 구현한다.
- **좋음:** `$deep-interview`로 의도와 비목표를 확정하고 branch/raw/PRD/ADR을 만든다.

- **나쁨:** 에이전트가 PRD/ADR을 작성한 뒤 혼자 승인 상태로 바꾼다.
- **좋음:** 최종 승인 라운드를 거쳐 `approval: "user:YYYY-MM-DD:<근거>"`를 남긴다.

- **나쁨:** PRD/ADR 승인 직후 같은 흐름에서 구현을 시작한다.
- **좋음:** `$do-next`는 문서 확정에서 종료하고, 구현은 별도 요청에서 시작한다.
