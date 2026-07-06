# /kickoff

확정된 작업 단위의 브랜치에 대응하는 raw unit을 생성한다.

## 실행

```sh
npm run harness:kickoff -- $ARGUMENTS
```

## 예시

```sh
npm run harness:kickoff -- --type feature --slug data-contract --title "데이터 계약"
npm run harness:kickoff -- --title "메인 레이아웃" --area "메인 레이아웃"
```

`--area "<영역>"`(선택)는 이 unit이 발전시키는 기능/구조 영역을 `prd.md`/`bugfix.md`
frontmatter에 시드한다(여러 개는 콤마). `$next-feature` 앵커에 영역이 있으면 자동 시드된다.

공용 기준은 `.harness/harness/protocols/kickoff.md`다.

무엇을 할지 아직 정하지 못했으면 먼저 `$next-feature`를 사용한다. raw 골격이
생기면 `$prd-helper`로 PRD 작성을 잇는다.
