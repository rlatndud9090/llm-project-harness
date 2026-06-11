# /raw-start

현재 작업 브랜치에 대응하는 raw unit을 생성한다.

## 실행

```sh
npm run harness:start -- $ARGUMENTS
```

## 예시

```sh
npm run harness:start -- --type feature --slug quiz-data-contract --title "퀴즈 데이터 계약"
npm run harness:start -- --title "특성 트리거 시스템"
```

공용 기준은 `docs/harness/protocols/raw-start.md`다.

작업 단위가 아직 확정되지 않았으면 먼저 `$do-next`를 사용한다. 제품/구조/하네스
정책 변경이면 notes-only로 끝내지 말고 PRD/ADR 필요성을 검토한다.
