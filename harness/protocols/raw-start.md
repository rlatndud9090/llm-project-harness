# Raw 시작 프로토콜

작업 단위가 확정된 뒤 raw source를 생성할 때 사용한다. 작업 단위가 아직
정해지지 않았다면 먼저 `$do-next`와 `do-next.md`를 사용한다. `work-intake.md`와
`prd-drafting.md`는 `$do-next` 내부 호환 단계다.

## 목적

- branch 이름과 raw path를 1:1로 맞춘다.
- 작업 시작 시 PRD/ADR/notes의 위치를 고정한다.
- 이후 wiki ingest, artifact check, commit trailer가 같은 work unit id를
  가리키게 만든다.

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
npm run harness:start -- --title "데이터 계약"
```

`main`에서 미리 만들 때는 명시한다.

```sh
npm run harness:start -- --type feature --slug data-contract --title "데이터 계약"
```

## 생성 파일

| type | 생성 파일 |
| --- | --- |
| `feature` | `prd.md`, `adr.md`, `notes.md` |
| `bugfix` | `bugfix.md`, `notes.md` |
| `chore` | `notes.md` |

bugfix/chore라도 제품 방향, 데이터 구조, 엔진 경계처럼 제품/도메인 durable
decision을 바꾸면 PRD/ADR을 추가한다. 작고 결정이 없는 프로젝트 운영 변경은
notes-only로 처리할 수 있다.

## 완료 조건

```sh
npm run harness:ingest -- docs/raw/<type>/<slug>
npm run harness:check
```

`harness:check`는 현재 브랜치와 raw path가 맞는지 확인한다.
