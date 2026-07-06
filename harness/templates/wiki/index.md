# 프로젝트 Wiki — 방향성 & 문서 네비게이션

> 이 한 장은 에이전트가 작업 시작 시 로드하는 **얇은 네비게이션 인덱스**다.
> 프로젝트 방향성을 짧게 제시하고, 모든 raw work unit(PRD/ADR/Bugfix/Notes)으로
> 가는 **영역(area)별 시간순 계보** 링크를 제공한다. 상세 종합본은 두지 않으며,
> 깊이 들어갈 때는 링크된 raw 문서를 직접 Read해 능동 탐색한다.
>
> 갱신: 새 raw unit 추가 시
> `npm run harness:ingest -- docs/raw/<type>/<slug> --area "<영역>"`로 해당 링크를
> 그 영역의 `### 헤딩` 아래 시간순으로 증분 추가한다.

## 큰 방향성

- **무엇**: TODO
- **누구를 위해**: TODO
- **핵심 경험 / 목표**: TODO
- **어떻게**: TODO
- **지식 경계**: raw PRD/ADR/notes가 진실 원천이고, 이 index는 navigation만 맡는다.

## Raw Units (영역별 계보)

각 `### <영역>`은 앱의 **좁은 기능/구조 단위**(예: `A화면`, `인증 플로우`,
`데이터 동기화 엔진`)다. 그 아래 줄은 그 영역에 가해진 작업 단위의 링크이며,
**오래된 → 최신** 순서로 쌓인다. 영역 이름은 각 unit의 `prd.md`/`bugfix.md`
frontmatter `area:`에서 오고, 반드시 `### 헤딩` 문자열과 정확히 일치한다
(`harness:check`가 강제).

영역 설계 원칙:

- 영역 이름과 분류축은 각 프로젝트가 소유한다. 다른 프로젝트 영역을 그대로 복사하지 않는다.
- feature는 `아키텍처`, `기능`, `기타`, `Product & Architecture` 같은 큰 바구니에 넣지 않는다.
- 한 unit이 여러 영역을 발전시키면 `area:`에 콤마로 나열하고, ingest가 각 영역 `###` 아래에 링크한다.
- 새 영역이 아직 없으면 ingest가 새 `###` 헤딩을 자동으로 추가한다.

읽는 법 — 한 영역 아래 줄들은 시간순이고, 각 줄의 선두 `` `YYYY-MM-DD` ``는 raw
frontmatter date에서 온 정렬 라벨이다. `_(superseded by …)_`는 결정이 대체된 지점,
`_(현재)_`는 그 영역의 현재 최신 결정(영역당 최대 1개)이다. 상세는 링크를 Read한다:

```md
- `2024-03-15` **최초 구축** — [PRD](…) · [ADR](…) _(superseded by 정렬 동작 변경)_
- `2025-02-10` **정렬 동작 변경** — [PRD](…) · [ADR](…)
- `2026-06-20` **인라인 편집 고도화** — [PRD](…) · [ADR](…) _(현재)_
```

### 프로젝트 운영

## Maintenance

- 새 raw work unit은 `docs/raw/{feature,bugfix,chore}/branch-slug/` 아래에 둔다.
- raw unit을 추가하면 `npm run harness:ingest -- docs/raw/<type>/<slug> --area "<영역>"`를 실행한다(레거시 별칭: `--category`).
- wiki는 single index를 유지하고, 상세 설명은 raw 문서에 남긴다.
