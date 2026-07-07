---
name: kickoff
description: "확정된 작업 단위의 브랜치와 raw directory, 템플릿을 생성할 때 사용한다."
---

# Kickoff 어댑터

공용 기준은 `.harness/harness/protocols/kickoff.md`다.

## 실행

```sh
npm run harness:kickoff -- --title "<한국어 제목>"
```

현재 브랜치가 `main`이거나 유효한 work branch가 아니면 `--type`, `--slug`를
명시한다. 이 unit이 발전시키는 영역을 알면 `--area "<영역>"`로(여러 개는 콤마),
area 상위의 섹션을 알면 `--section "<섹션>"`로(단일 값) 시드하면
`prd.md`/`bugfix.md` frontmatter의 `area:`/`section:`에 채워진다. `$next-feature`
앵커에 영역·섹션이 있으면 kickoff이 자동으로 시드한다. 섹션은 선택이며, 프로젝트에
섹션이 2개 이상 선언되면 wiki가 섹션별 파일로 분리된다.

무엇을 할지 아직 정하지 못했으면 먼저 `$next-feature`로 후보를 추천받는다.
raw 골격이 생기면 `$prd-helper`로 PRD 작성을 잇는다.

`$kickoff`는 각 단위에 단계 체크포인트 원장 `state.md`도 만든다(승인 게이트·세션
인수인계용). 새 세션은 이 파일을 가장 먼저 읽어 현재 단계와 승인 여부를 판단한다.
