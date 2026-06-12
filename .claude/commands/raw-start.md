# /raw-start

현재 작업 브랜치에 대응하는 raw unit을 생성한다.

## 실행

```sh
npm run harness:start -- $ARGUMENTS
```

## 예시

```sh
npm run harness:start -- --type feature --slug data-contract --title "데이터 계약"
npm run harness:start -- --title "메인 레이아웃"
```

공용 기준은 `.harness/harness/protocols/raw-start.md`다.

작업 단위가 아직 확정되지 않았으면 먼저 `$do-next`를 사용한다. 제품/도메인
결정이면 PRD/ADR 필요성을 검토하고, 작은 프로젝트 운영 변경은 notes로
추적한다.
