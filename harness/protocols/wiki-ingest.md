# Wiki Ingest 프로토콜

raw unit이 추가되거나 상태가 의미 있게 바뀌면 `docs/wiki/index.md`에 한 줄
링크를 추가한다. wiki는 합성 문서가 아니라 navigation index다.

## 명령

```sh
npm run harness:ingest -- docs/raw/<type>/<slug>
```

## 규칙

- 수정 가능한 파일은 `docs/wiki/index.md` 하나다.
- 같은 raw unit을 여러 번 ingest해도 중복 줄이 생기면 안 된다.
- raw 본문 내용을 wiki에 요약하지 않는다.
- 링크 한 줄만 추가한다.
- 새 wiki page, log, frontmatter sync, rebuild metadata를 만들지 않는다.

## 카테고리 기본값

| raw type | 기본 카테고리 |
| --- | --- |
| `feature` | `Product & Architecture` |
| `bugfix` | `Project Operations` |
| `chore` | `Project Operations` |

필요하면 category를 명시할 수 있지만, 카테고리는 navigation label일 뿐이다.

## 검증

```sh
npm run harness:check
```

검사는 wiki link가 실제 raw file을 가리키는지, 모든 raw unit이 wiki에서
찾을 수 있는지 확인한다.

## 실패 모드

- **나쁨:** PRD 내용을 wiki에 길게 복사한다.
- **좋음:** wiki에는 링크 한 줄만 두고 상세는 raw file에 둔다.

- **나쁨:** category를 만들 때마다 새 wiki page를 만든다.
- **좋음:** single index가 비대해질 때만 별도 ADR로 확장한다.
