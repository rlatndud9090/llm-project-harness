# 프로젝트 Wiki — 방향성 & 문서 네비게이션

> 이 한 장은 에이전트가 작업 시작 시 로드하는 **얇은 네비게이션 인덱스**다.
> 프로젝트 방향성을 짧게 제시하고, 모든 raw work unit(PRD/ADR/Bugfix/Notes)으로
> 가는 카테고리별 링크를 제공한다. 상세 종합본은 두지 않으며, 깊이 들어갈 때는
> 링크된 raw 문서를 직접 Read해 능동 탐색한다.
>
> 갱신: 새 raw unit 추가 시
> `npm run harness:ingest -- docs/raw/<type>/<slug> --category "<분류>"`로 해당
> 링크를 카테고리에 증분 추가한다.

## 큰 방향성

- **무엇**: TODO
- **누구를 위해**: TODO
- **핵심 경험 / 목표**: TODO
- **어떻게**: TODO
- **지식 경계**: raw PRD/ADR/notes가 진실 원천이고, 이 index는 navigation만 맡는다.

## Raw Units (카테고리별)

각 항목은 raw source(PRD/ADR/Bugfix/Notes)로의 링크다. 카테고리는 네비게이션
라벨일 뿐이며, 상세는 링크된 문서를 직접 Read한다.

카테고리 설계 원칙:

- feature 카테고리 이름과 분류축은 각 프로젝트가 소유한다. 다른 프로젝트 카테고리를 그대로 복사하지 않는다.
- feature는 `아키텍처`, `기능`, `기타`, `Product & Architecture` 같은 큰 바구니에 넣지 않는다.
- 새 feature를 ingest할 때는 반드시 `--category`로 프로젝트에 맞는 분류를 명시한다.
- 해당 카테고리가 아직 없으면 ingest가 새 `###` 헤딩을 자동으로 추가한다.

### 프로젝트 운영

## Maintenance

- 새 raw work unit은 `docs/raw/{feature,bugfix,chore}/branch-slug/` 아래에 둔다.
- raw unit을 추가하면 `npm run harness:ingest -- docs/raw/<type>/<slug> --category "<분류>"`를 실행한다.
- wiki는 single index를 유지하고, 상세 설명은 raw 문서에 남긴다.
