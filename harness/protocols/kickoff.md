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

bugfix/chore라도 durable decision을 바꾸면 PRD/ADR을 추가한다. 여기서 durable
decision은 다음 중 하나다: 의존성 추가/변경, 데이터 스키마나 영속 포맷 변경,
export된 인터페이스나 엔진/모듈 경계 변경, 되돌리기 어렵고 대안 기록이 필요한 선택.
이에 해당하지 않는 작고 결정이 없는 프로젝트 운영 변경은 notes-only로 처리할 수 있다.

## 완료 조건

```sh
npm run harness:check
```

`harness:check`는 현재 브랜치와 raw path가 맞는지 확인한다.

## 다음 단계

raw 골격이 생기면 `$prd-helper`로 PRD를 작성한다. PRD 작성 과정에서 ADR이
필요하다고 판단되면 `$adr-helper`로 ADR을 작성한다. wiki ingest는 PRD 초안이
자리를 잡은 뒤 실행한다.
