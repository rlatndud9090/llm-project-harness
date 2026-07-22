# Kickoff 프로토콜

`$kickoff`는 확정된 작업 단위의 초기세팅 단계다. 브랜치와 raw path를 1:1로
맞추고 PRD/ADR/notes 템플릿 골격을 생성한다.

이 단계는 독립 진입점이다. 작업 단위를 이미 정했다면 `$next-feature`를 건너뛰고
바로 `$kickoff`로 들어와도 된다. 무엇을 할지 아직 모르면 먼저 `$next-feature`로
후보를 추천받는다.

## 목적

- branch 이름과 raw path를 1:1로 맞춘다.
- 작업 시작 시 PRD/ADR/notes의 위치를 고정한다.
- 이후 wiki ingest, artifact check, commit trailer가 같은 work unit id를 가리키게 만든다.

## 브랜치 규칙

```txt
feature/<kebab-case-purpose>
bugfix/<kebab-case-purpose>
chore/<kebab-case-purpose>
```

좋은 예:

```txt
feature/main-layout
feature/data-contract
feature/share-result
bugfix/session-restore
chore/intake-helper-harness
```

나쁜 예:

```txt
feature/update
feature/misc
bugfix/fix
chore/work
```

## 명령

현재 브랜치가 유효하면 type과 slug를 추론한다.

```sh
npm run harness:kickoff -- --title "데이터 계약"
```

`main`에서 미리 만들 때는 명시한다.

```sh
npm run harness:kickoff -- --type feature --slug data-contract --title "데이터 계약"
```

### 브랜치 처리 (상황감지)

`$kickoff`은 raw 골격을 만들기 **전에** 작업 브랜치를 정리한다. 전역 git 상태를
바꾸는 자동 전환은 안전한 경우로만 제한한다.

| 상황 | 동작 |
| --- | --- |
| `main`/`master` + 작업 트리 clean | 작업 브랜치를 **자동 생성·전환**(`git checkout -b <type>/<slug>`) |
| 이미 이 유닛의 작업 브랜치 위 | 그대로 둔다 (branch-first) |
| 목표 브랜치가 이미 존재 | 전환하지 않고 힌트만 (`git checkout <branch>`를 직접) |
| 다른 브랜치 / 무관한 커밋 안 된 변경 / detached HEAD / 비-git | 브랜치를 건드리지 않고 힌트만 |

여기서 "clean"은 **kickoff 자신의 산출물을 제외**하고 본다. `$next-feature`가 남긴
`docs/raw/.next-unit` 앵커(이번 kickoff이 소비한다)와 대상 unit의 raw 디렉터리
(`docs/raw/<type>/<slug>/`, 이번에 만들거나 재실행 잔재)만 남아 있으면 여전히 자동
전환한다. 이 자기 산출물을 "커밋 안 된 변경"으로 오인하면 `$next-feature → $kickoff`
정상 플로우에서 앵커 하나 때문에 auto-checkout이 막히고 raw 골격 생성까지 블록되기
때문이다. **무관한 WIP가 하나라도 섞이면** dirty로 남아 아래 힌트 경로를 탄다.

즉 개발자가 `main`에서 (kickoff 산출물 외에) 깨끗한 상태로 kickoff하면 브랜치가 알아서
생기고, 이미 작업 브랜치를 파 둔 branch-first 습관도 그대로 동작한다. 그 밖의 상황에서는
kickoff이 자동 전환을 **하지 않고**, 진입한 에이전트가 사용자에게 **워크트리로 격리할지
(EnterWorktree) 현재 위치에서 브랜치를 팔지(`--checkout`)** 물어본 뒤 진행한다. 어느 쪽을
고르든 raw 골격 생성과 `.next-unit` 소비는 브랜치 결정과 무관하게 그대로 진행된다.

- `--checkout`: 현재 위치에서 `<type>/<slug>` 브랜치를 강제로 생성·전환한다.
- `--no-branch`: 브랜치 로직을 완전히 끈다(둘이 겹치면 `--no-branch`가 우선).

### `--area` / `--section` (선택): 영역·섹션 시드

이 unit이 발전시키는 기능/구조 영역을 이미 알면 `--area "<영역>"`로 시드한다(여러
영역은 콤마). kickoff이 `prd.md`(feature)/`bugfix.md`(bugfix) frontmatter의 `area:`에
값을 채운다. `$next-feature`가 `docs/raw/.next-unit` 앵커에 영역을 남겼다면 kickoff이
그 3번째 필드를 자동으로 읽어 시드한다. 미지정 시 `area:`는 비어 있고 `$prd-helper`가
채운다.

area보다 큰 **섹션**(웹앱의 최상위 라우팅/제품 영역 단위)을 이미 알면 `--section
"<섹션>"`로 함께 시드한다(단일 값). frontmatter `section:`에 채워지며, 앵커의 4번째
필드에서도 자동으로 읽는다. 섹션은 선택이다 — 안 쓰면 모든 area가 index.md 한 장에
남고, 프로젝트에 섹션이 2개 이상 선언되는 순간 `harness:ingest`가 `docs/wiki/<섹션>.md`로
자동 분리한다. 상세는 `wiki-ingest.md`의 "섹션(section)과 분리" 참고.

```sh
npm run harness:kickoff -- --title "위젯 그리드" --section "대시보드" --area "위젯 그리드"
```

## 생성 파일

| type | 생성 파일 |
| --- | --- |
| `feature` | `prd.md`, `adr.md`, `notes.md`, `state.md` |
| `bugfix` | `bugfix.md`, `notes.md`, `state.md` |
| `chore` | `notes.md`, `state.md` |

`state.md`는 이 작업 단위의 **단계 체크포인트이자 승인 증거 원장**이다. 새 세션이나
새 에이전트가 작업을 이어받을 때 가장 먼저 읽어 지금 어느 단계인지, 승인을 받았는지
판단한다. feature 단위의 `state.md`는 PRD/ADR 승인 게이트를 포함하며, 승인 전환은
오직 `harness:approve`로만 기록된다.

## bugfix / chore 아티팩트 정책

작업 유형은 "브랜치 이름"이 아니라 "결정의 성질"로 정한다.

- **bugfix**: 알려진 의도 동작을 복원하는 일이다. `bugfix.md` 하나면 충분하다(증상 →
  원인 → 수정 → 회귀 방지). **PRD는 만들지 않는다** — 왜/무엇이 완료인가는 기존 스펙에
  이미 정해져 있기 때문이다. `bugfix.md`는 `review`/`fixed` 상태에서 증상·원인·수정·회귀
  방지 섹션을 갖춰야 한다(`harness:check`가 강제).
- **chore**: 의존성 bump, 설정, 무동작 리팩터, 툴링 같은 운영성 작업이다. `notes.md`
  하나로 처리하며 status 라이프사이클도 승인 게이트도 없다.
- **durable decision을 건드리면 유형과 무관하게 ADR을 추가한다.** durable decision은:
  의존성 추가/변경, 데이터 스키마나 영속 포맷 변경, export된 인터페이스나 엔진/모듈 경계
  변경, 되돌리기 어렵고 대안 기록이 필요한 선택.
- **제품 판단이 필요하면**(무엇을 해야 하나, 사용자가 골라야 할 트레이드오프, 새 수용
  기준/비목표) 그건 bugfix/chore가 아니다. **feature로 승격**해 PRD를 쓴다.

## 완료 조건

```sh
npm run harness:check
```

`harness:check`는 현재 브랜치와 raw path가 맞는지 확인하며, **kickoff 직후에도 green이어야
한다.** feature/bugfix 골격은 아직 review 전이라 wiki에 링크되지 않는데(첫 ingest는
`$prd-helper`가 PRD를 review로 올릴 때 — 2-touch), 링크/영역 게이트가 **review 전 unit을
면제**하므로 미링크가 에러가 아니다. chore는 area·section이 없어 `$kickoff`가 생성 직후
운영 버킷에 바로 링크한다. 즉 kickoff이 끝나면 어떤 유형이든 check가 통과한다.

## 다음 단계

raw 골격이 생기면 `$prd-helper`로 **PRD만** 작성한다. `$kickoff`가 만든 `adr.md`
스켈레톤은 이 시점에 건드리지 않는다 — ADR 작성은 별도 단계(`$adr-helper`)의 몫이고,
`state.md`의 `stage`가 `adr-draft`로 올라간 뒤에만 허용된다(그 전에는 런타임 가드와
`harness:check`가 막는다). `$prd-helper`는 ADR 필요 여부만 판단해 PRD `## ADR 필요 여부`에
남기고, 필요하면 `$adr-helper`로 넘긴다. wiki ingest는 `$prd-helper`가 PRD를 review로
올릴 때 처음 실행하고(첫 touch), 통합/커밋 직전에 계보를 큐레이션하며 다시 실행한다
(둘째 touch). 상세는 `wiki-ingest.md`의 "실행 시점(2-touch)" 참고.
