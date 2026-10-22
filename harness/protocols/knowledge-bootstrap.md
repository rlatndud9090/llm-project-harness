# Knowledge Bootstrap 프로토콜

이미 하네스로 많은 작업 단위(`docs/raw`)를 쌓은 소비 프로젝트에 지식 계층을 **소급 도입**하는 절차다.
스키마·라우팅·ID 규칙·조회 규칙은 `knowledge.md`가 정본이고, 이 문서는 그 위의 일괄 처리 절차만 다룬다.

## 언제 쓰나

- `lph-doctor`의 `knowledgeStatus`가 권한다: 마커가 없고 final 단위가 5개를 넘으면 부트스트랩, 5개 이하면
  `seed`(빈 마커)로 충분하다.
- 부트스트랩이 이미 진행 중(`docs/knowledge/bootstrap.md`가 `in-progress`)이면 새로 시작하지 않고 **재개**한다.
- 이미 `complete`이면 거부된다. 이후 지식은 `--unit`/`--feedback`/`--consolidate`로 이어간다.
- `in-progress` 원장이 base 브랜치(main/master)에 들어가면 `harness:check`가 error(K9)로 막는다. 반쯤 끝난 부트스트랩의 머지를 막기 위함이다. PR CI에서는 병합 대상(`GITHUB_BASE_REF`)을 보므로 부트스트랩 PR은 `finalize` 전까지 빨간불이 정상이다.

## 진행 방식

부트스트랩은 소비 프로젝트의 **`chore/knowledge-bootstrap` 작업 단위**로 진행한다. 일반 `kickoff`으로
브랜치·raw 골격을 만들고, 이 프로젝트 안에서 이 절차를 돌린다(provider 저장소에서 돌리는 것이 아니다).

## 절차

### 1. plan (토큰을 쓰지 않는다)

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" bootstrap plan [--pr-source gh|none]
```

- `base_commit`(HEAD)을 고정하고, 그 시점 트리의 `docs/raw` 단위 중 final인 feature/bugfix와 모든 chore를 대상으로 삼는다.
  chore는 판정 `무기여(auto)`로 엔진이 자동 처리한다. 단위별 날짜는 그 문서가 처음 추가된 커밋의 날짜다.
- 원장 `docs/knowledge/bootstrap.md`가 생긴다(`status: in-progress`, `base_commit`, `plan_hash`, `cutoff`, `pr_source`, 단위 표).
- 출력: 영역별 단위 수, 예상 토큰, 권장 배치 수.
- `--pr-source`: `gh`가 인증돼 있으면 `gh`, 아니면 `none`. PR 스레드를 못 읽어도 부트스트랩은 계속된다.
- **비용 확인.** 예상 토큰을 보여주고 `AskUserQuestion`으로 실행 여부를 묻는다(진행 / 영역 선택 / 중단).
  진행 확인 없이 배치에 들어가지 않는다. 이 질문이 부트스트랩의 유일한 사전 확인이고, 이후 배치마다 묻지 않는다.

### 2. 배치 루프 (영역별)

영역을 하나 골라 `대기`가 없어질 때까지 반복한다.

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" bootstrap next-batch --area <영역> [--max-tokens 12000]
```

`next-batch`는 오래된 단위부터 발췌(ADR `## 결정`·`## 결과`, PRD `## 요구사항`·`## 수용 기준`, bugfix
`## 원인`·`## 회귀 방지`, notes `## 결정`·`## 지식 후보`)와 그 영역의 현재 활성 항목 brief를 낸다. **ADR 전문은 읽지 않는다.**
`done`이 나오면 그 영역은 끝이다(원장에 없는 영역 이름은 `done`이 아니라 오류와 원장의 영역 목록이 나온다). 배치마다:

1. 발췌를 `knowledge.md`의 라우팅 표로 걸러 INV/G 후보를 정한다. 기존 활성 항목과 겹치면 새로 만들지 않는다.
2. 후보마다 `scaffold`로 골격을 만들고 본문을 채운다.
3. 단위별 판정을 `bootstrap mark`로 남긴다.

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" bootstrap mark --units <u,…> --verdict 기여|무기여|판정불가|보류|→guideline [--ids <ID,…>] [--note "<..>"]
```

- `기여`는 `--ids`가 필수이며 엔진이 존재를 검증한다.
- 범용 리뷰 지적은 `→guideline`, 앵커도 `없음(사유)`도 못 정하거나 출처가 final이 아니면 `판정불가`, 영역 상한 초과는 `보류`.
- 여러 영역에 걸친 단위는 첫 area가 소유한다.
- **fan-out은 대상 단위가 30개를 넘을 때만** 한다. 그 이하는 메인이 순차로 처리한다(토큰 비용이 병렬 이득보다 크다).
  fan-out하더라도 한 영역은 한 워커가 소유하고, 영역을 가로지르는 ID 충돌은 `scaffold`의 유일성 검사가 막는다.
- 배치마다 중간 커밋하는 것을 권한다. 세션이 끊겨도 원장과 지식 파일이 함께 남아 재개할 수 있다.

### 3. gotcha 시드 소스 (우선순위순)

G 후보는 아래 순서로 찾는다. 앞 소스일수록 근거가 직접적이다.

1. bugfix의 `## 원인`·`## 회귀 방지`.
2. notes의 함정 메모(`## 지식 후보` 포함).
3. AGENTS.md의 「주의」류 항목 중 함정 성격인 것. **G로 옮기고 AGENTS에는 `G-…` 포인터만 남긴다**(이전은 finalize 직전에 한 번만, 원문은 원장 `비고`에 남긴다).
4. 머지된 PR 리뷰 스레드 — `gh`가 가능하면 보되 프로젝트 고유 식별자(파일·심볼)가 들어간 지적만 대상으로 한다. 처리한 PR 번호는 원장에 남긴다. `gh`가 안 되면 `pr_source: none`으로 기록하고 이 소스를 건너뛴다.
5. Revert 커밋(`git log --grep='^Revert'`).

범용 지적은 G가 아니라 `→guideline`이다. 이미 코드 리뷰 가이드라인에 있는 항목과 같은 것은 만들지 않는다.

### 4. 상한과 (미확인)

- 영역당 **G 15건, INV 25건**이 상한이다. 넘는 후보는 `보류`로 남기고 가치가 높은 순으로 채운다(원장에 사유 기록).
- 2~5번 소스에서 나온 G 시드와 **final ADR이 아닌 근거**에서 나온 항목은 제목에 `(미확인)`을 붙인다.
  final ADR이 출처인 INV에는 붙이지 않는다(이미 승인된 근거다). 확인되면 이후 `--consolidate`나 해당 영역을 만지는 단위에서 뗀다.
- 근거가 추정이면 `왜:`에 `(추정)`을 쓴다.

### 5. finalize

모든 영역의 `대기`가 0이 되면:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/knowledge.mjs" bootstrap finalize
npm run harness:check
```

`finalize`는 대기 0과 `plan_hash`를 대조하고, 지식 게이트(형태·ID·메타·출처·대체·앵커·묘비·삭제 금지·참조)를 돌려 오류 0을 확인한 뒤
`index.md`(`lph-knowledge: 1`, `bootstrap: complete`)를 만들고 원장을 `complete`로 닫는다. `판정불가` 비율이 30%를 넘으면 warning이며,
그 비율을 PR 본문에 적는다. 이후 `harness:check`가 green이어야 한다.

### 6. PR

일반 `make-pr`로 마무리한다. 대상 단위가 **100개를 넘으면 영역별로 PR을 나눈다**(원장은 하나로 두고 영역 단위로 `mark`/커밋을 끊는다). PR 본문에는
영역별 활성 G/INV 수, 판정 분포, `판정불가` 비율, `(미확인)` 개수를 적는다.

## 재개·`--force`·멱등성

- 세션이 끊겨도 원장이 상태다. 다시 `--bootstrap`을 부르면 `bootstrap status`로 `plan_hash`를 대조한다. 다르면
  "plan 변경됨"이 나오며, 새로 계산하려면 `bootstrap plan --force`를 쓴다(기존 행의 판정과 `pr_source`는 보존하고 새 단위만 `대기`로 추가; `--pr-source`를 주면 그 값으로 바꾼다).
- `plan`은 이미 in-progress면 `--force` 없이는 거부, `complete`면 항상 거부한다. 같은 명령을 두 번 돌려도 원장이 망가지지 않는다.
- `mark`는 같은 단위를 다시 표시하면 덮어쓰기다(마지막 판정이 유효). `finalize` 전에는 지식 파일 수정이 자유롭다.
- 플랜 캐시(`.git` 아래)는 언제든 다시 만들 수 있다. 지우거나 날려도 `base_commit`에서 재계산된다.

## 기존의 다른 형식 gotchas 파일

프로젝트가 이미 자체 gotchas 문서를 갖고 있으면(`doctor`가 감지한다) **자동으로 건드리지 않는다.** 그 파일은 시드 소스 2~3번과 같은 입력으로
**흡수**한다: 항목을 읽어 라우팅 표로 걸러 G로 옮기되 `(미확인)`을 붙인다. 이후 원본은 프로젝트의 선택이다 — 그대로 두거나, 옮긴 항목을
`G-…` 포인터로 바꿔 두거나, 파일 전체를 포인터 한 줄로 교체한다. 하네스는 어느 쪽도 강제하지 않는다. 다만 같은 규칙이 두 곳에서 갈라지지 않도록
한 곳(지식 계층)만 정본으로 삼는 것을 권한다.
