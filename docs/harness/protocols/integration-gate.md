# 통합 게이트 프로토콜

통합 게이트는 "완료라고 말해도 되는가"를 판단하는 마지막 검증 순서다.
모든 단계는 신선한 출력으로 확인해야 한다.

## 명령

```sh
npm run harness:gate
```

내부 실행 순서이며, 순서를 바꾸지 않는다.

```sh
npm run harness:check
npm run lint
npm run build
npm run test:run
```

## 규칙

- 순서를 바꾸지 않는다.
- 실패한 단계가 있으면 즉시 멈추고 원인을 수정한다.
- 수정 후에는 `npm run harness:gate`를 처음부터 다시 실행한다.
- 테스트 파일이 아직 없어 `--passWithNoTests`로 통과한 경우 final/report에 명시한다.
- UI 변경이 있으면 `ui-verification.md`도 적용한다.
- 실행만 하고 넘어가지 않는다. 각 단계의 fresh output을 읽고 성공/실패를 판단한다.
- `harness:check` 실패는 raw/wiki/adapter 추적성 문제로 보고 우회하지 않는다.
- docs-only 변경도 `harness:check`와 staged diff 확인은 생략하지 않는다.

## 단계별 실패 처리

| 실패 단계 | 처리 |
| --- | --- |
| `harness:check` | raw/wiki/branch/frontmatter 문제를 먼저 수정 |
| `lint` | 코드 스타일, unused, hook rule 등 수정 |
| `build` | TypeScript/API/import 문제 수정 |
| `test:run` | 실패 테스트를 읽고 구현 또는 테스트 수정 |

## 완료 출력

```md
## 검증
- harness:check: 통과
- lint: 통과
- build: 통과
- test:run: 통과 또는 no tests
- UI 검증: 해당/비해당
- Not-tested: 알려진 검증 공백
```

## 실패 모드

- **나쁨:** docs-only 변경이라며 gate를 생략한다.
- **좋음:** `harness:gate`를 실행하고, UI 검증이 불필요하면 이유를 남긴다.

- **나쁨:** `build`만 통과하고 테스트까지 통과한 것처럼 보고한다.
- **좋음:** 각 단계 출력과 결과를 분리해서 보고한다.
