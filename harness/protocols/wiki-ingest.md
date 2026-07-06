# Wiki Ingest 프로토콜

raw unit이 추가되거나 상태가 의미 있게 바뀌면 `docs/wiki/index.md`에 한 줄
링크를 추가한다. wiki는 합성 문서가 아니라, 프로젝트의 **영역(area) 분류**를 따라
모든 raw unit으로 가는 길을 제공하는 navigation index다. 각 영역 아래에서는 그
영역이 **어떻게 발전해 왔는지**(시간순)와 **현재 최신 결정**이 무엇인지 한눈에
보인다.

## 명령

```sh
npm run harness:ingest -- docs/raw/<type>/<slug> --area "<영역>"
```

## 영역(area)이란

영역은 앱의 **좁은 기능/구조 단위**다(예: `A화면`, `인증 플로우`, `데이터 동기화
엔진`). wiki의 `### <영역>` 헤딩 하나가 그 단위의 **작업 히스토리 타임라인**이다:
최초 구축 → 동작 변경 → 고도화 → … 가 오래된 순서로 쌓이고, 맨 끝(또는 `_(현재)_`
표시)이 현재 최신이다. 이렇게 하면 "지금 A화면을 손대려는데 그동안 무슨 결정들이
있었지?"를 raw를 뒤지지 않고 이 한 장에서 파악한다.

영역은 **durable 진실원**이다. 과거의 `--category`는 CLI 인자로만 존재해 raw에
남지 않았지만, 이제 영역은 각 unit의 `prd.md`(feature)/`bugfix.md`(bugfix)
frontmatter `area:`에 선언된다. wiki는 그 선언에서 파생되는 뷰이고,
`harness:check`가 **선언한 영역 == 렌더된 `### 헤딩`**을 기계강제한다.

## 영역 결정 (소스 우선순위)

ingest는 아래 우선순위로 영역을 정한다.

1. `--area "<영역>"` (콤마로 여러 개)
2. 주 아티팩트 frontmatter `area:` (durable 진실원; 여러 개는 콤마)
3. `--category "<영역>"` (레거시 별칭; 단일 값)
4. feature면 실패, bugfix/chore면 운영 버킷(`프로젝트 운영`)으로 fallback

`--category`와 frontmatter `area`가 충돌하면 frontmatter를 채택하고 경고한다(진실원은
하나다). **정규 경로는 frontmatter에 영역을 선언하는 것**이다 — `$kickoff --area`가
시드하거나 `$prd-helper`가 채운다. 그래야 재타이핑 없이 ingest가 동작하고 lineage
게이트가 켜진다.

### 넓은 영역 금지

feature 영역은 `아키텍처`, `기능`, `기타`, `Product & Architecture`, `프로젝트 운영`
같은 큰 바구니에 넣지 않는다(ingest가 거부하고 `harness:check`도 막는다). 이 프로젝트의
실제 화면/구조/기능 단위에 맞는 구체적인 영역으로 나눈다.

### 한 unit이 여러 영역에 걸칠 때

피처 작업 중 소규모의 다른 영역 작업이 섞이는 일은 흔하다. 그럴 때는 `area:`에 콤마로
여러 영역을 적는다(예: `area: "A화면, 인증 플로우"`). ingest는 각 영역의 `###` 아래에
같은 줄을 하나씩 링크하므로, 그 작업이 관련된 **모든 영역의 타임라인**에 나타난다.

## 규칙

- 수정 가능한 파일은 `docs/wiki/index.md` 하나다.
- wiki는 합성/요약 문서가 아닌 LLM Wiki다. 새 링크는 `harness:ingest`로 추가하고, 상태
  주석 갱신만 해당 줄을 직접 1줄 수정한다(아래 "현재 포인터와 상태 변경 반영").
- 같은 raw unit을 같은 영역에 여러 번 ingest해도 중복 줄이 생기면 안 된다(영역별 멱등).
- raw 본문 내용을 wiki에 요약하지 않는다. 줄에는 링크와 짧은 navigation 라벨만 둔다.
- 새 wiki page, log, frontmatter sync, rebuild metadata를 만들지 않는다.

## 줄 형식과 시간순 삽입

ingest가 만드는 줄:

```md
- `YYYY-MM-DD` **<제목>** — [PRD](…) · [ADR](…)
```

선두 `` `YYYY-MM-DD` ``는 주 아티팩트 frontmatter `date`에서 파생한 정렬 라벨이다(합성이
아니다). ingest는 그 영역 섹션 안에서 이 날짜의 **오름차순 위치**에 줄을 끼워 넣는다.
`harness:check`는 (1) 렌더된 날짜가 링크된 raw의 frontmatter date와 일치하는지(위조
차단, hard), (2) 섹션 안 날짜가 오름차순인지(nudge)를 본다.

## 현재 포인터와 상태 변경 반영

"현재 최신 결정"은 별도 필드가 아니라 **파생**된다: 시간순 최하단이면서 superseded 되지
않은 줄이 현재다. 여기에 모델이 선택적으로 navigation 라벨을 얹는다(의미 판단).

- 새 결정이 이전 결정을 대체하면: 이전 줄에 `_(superseded by <대상>)_`를 달고(대응 ADR도
  `superseded`로 표시), 새 줄 끝에 `_(현재)_`를 옮긴다.
- `harness:check`는 구조만 강제한다: 영역당 `_(현재)_` **최대 1개**, `_(현재)_` 줄은
  superseded 주석을 함께 갖지 못하고 그 줄의 ADR이 `superseded` 상태여도 안 된다. "어느
  줄이 현재인가"의 판단 자체는 모델 몫이다.

이는 navigation 라벨 갱신이며 raw 본문을 wiki로 옮기는 것이 아니다. 결정 내용은 raw
ADR에 남고, wiki는 신선한 길잡이만 유지한다.

## 검증

```sh
npm run harness:check
```

검사는 wiki link가 실제 raw file을 가리키는지, 모든 raw unit이 wiki에서 찾을 수 있는지,
선언한 영역과 렌더된 헤딩이 일치하는지, 타임라인 날짜가 위조되지 않았는지, 현재 포인터가
구조 불변식을 지키는지 확인한다. feature가 broad 버킷에 들어갔는지도 함께 본다.

## 실패 모드

- **나쁨:** PRD 내용을 wiki에 길게 복사한다.
- **좋음:** wiki에는 링크 한 줄만 두고 상세는 raw file에 둔다.

- **나쁨:** 영역을 `--category`로만 넘기고 raw에 남기지 않아 다음 세션이 분류를 재입력한다.
- **좋음:** `prd.md` frontmatter `area:`에 영역을 선언해 durable하게 남긴다.

- **나쁨:** 새 결정 줄만 추가하고 대체된 이전 줄과 `_(현재)_`를 그대로 둔다.
- **좋음:** 이전 줄에 `_(superseded by …)_`, 새 줄에 `_(현재)_`로 계보를 신선하게 유지한다.
