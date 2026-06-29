# Wiki Ingest 프로토콜

raw unit이 추가되거나 상태가 의미 있게 바뀌면 `docs/wiki/index.md`에 한 줄
링크를 추가한다. wiki는 합성 문서가 아니라, 프로젝트의 **분류 체계**를 따라 모든
raw unit으로 가는 길을 제공하는 navigation index다.

## 명령

```sh
npm run harness:ingest -- docs/raw/<type>/<slug>
```

## 규칙

- 수정 가능한 파일은 `docs/wiki/index.md` 하나다.
- wiki는 합성/요약 문서가 아닌 LLM Wiki다. 새 링크는 `harness:ingest`로 추가하고, 상태 주석 갱신만 해당 줄을 직접 1줄 수정한다(아래 "상태 변경 반영").
- 같은 raw unit을 여러 번 ingest해도 중복 줄이 생기면 안 된다.
- raw 본문 내용을 wiki에 요약하지 않는다.
- 적절한 카테고리 아래에 링크 한 줄만 추가한다.
- 새 wiki page, log, frontmatter sync, rebuild metadata를 만들지 않는다.
- feature는 `아키텍처`, `기능`, `Product & Architecture`, `Project Operations` 같은 broad bucket에 넣지 않는다.

## 분류 체계 (카테고리)

wiki는 단순한 링크 더미가 아니라, 프로젝트가 정의한 분류 체계를 따르는 색인이다.
ingest할 때 raw unit의 내용(PRD/ADR)을 근거로 index의 기존 카테고리 중 가장 적합한
하나를 고른다. 맞는 카테고리가 없으면 새 카테고리를 만든다. **분류는 의미 판단이므로
`--category`로 명시한다.**

특히 feature는 html-editor-fe처럼 사용자 경험/도메인 축의 **세부 카테고리**로 분류한다.
예: `기반 · 인프라`, `텍스트 서식`, `블록 구조`, `리치 콘텐츠`, `디자인 시스템 · UI`.
중요한 점은 카테고리 이름이 아니라 **분류 수준**이다. `아키텍처`처럼 너무 넓은
이름 하나로 몰아넣지 않는다.

```sh
npm run harness:ingest -- docs/raw/<type>/<slug> --category "<분류 이름>"
```

feature는 `--category`가 **필수**다. 또한 `--category` 값은 이미 `docs/wiki/index.md`
에 존재하는 `###` 세부 카테고리 중 하나여야 한다. 새 세부 카테고리가 필요하면
ingest 전에 `index.md` 헤딩을 먼저 추가한다. 이렇게 해야 세션마다 분류 체계가 흔들리지
않고, wiki index가 프로젝트 공용 taxonomy로 유지된다.

bugfix/chore는 `--category`를 생략할 수 있고, 이 경우 프로젝트 운영 카테고리로
fallback한다.

| raw type | fallback 카테고리 |
| --- | --- |
| `feature` | 없음 (`--category` 필수) |
| `bugfix` | `프로젝트 운영` |
| `chore` | `프로젝트 운영` |

카테고리는 프로젝트가 자유롭게 정의·조정하는 분류축이다. 상세 내용은 링크된 raw에
두고, 카테고리는 그 분류축만 제공한다.

## 상태 변경 반영

raw unit이 처음 추가되면 `harness:ingest`가 링크 한 줄을 만든다. 이미 링크된 unit의
상태가 의미있게 바뀌면(예: ADR이 `superseded`로 전환) ingest는 멱등이라 새 줄을
만들지 않는다. 이때는 모델이 `index.md`의 해당 줄에 상태 주석을 직접 1줄 덧붙인다.

```md
- **제목** — [PRD](...) · [ADR](...) _(superseded by <대상>)_
```

이는 navigation 라벨 주석이며 raw 본문을 wiki로 옮기는 것이 아니다. 결정 내용 자체는
raw ADR에 남고, wiki는 신선한 길잡이만 유지한다.

## 검증

```sh
npm run harness:check
```

검사는 wiki link가 실제 raw file을 가리키는지, 모든 raw unit이 wiki에서
찾을 수 있는지 확인한다. feature unit이 broad bucket에 들어갔는지, 그리고 wiki가
html-editor-fe 수준의 세부 카테고리(최소 4개)를 갖췄는지도 함께 본다.

## 실패 모드

- **나쁨:** PRD 내용을 wiki에 길게 복사한다.
- **좋음:** wiki에는 링크 한 줄만 두고 상세는 raw file에 둔다.

- **나쁨:** category를 만들 때마다 새 wiki page를 만든다.
- **좋음:** single index가 비대해질 때만 별도 ADR로 확장한다.
