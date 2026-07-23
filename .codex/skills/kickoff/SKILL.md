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

## GitHub 이슈로 시작 (이슈 번호 인자)

사용자가 다른 말 없이 **이슈 번호나 GitHub 이슈 URL 하나만** 주면 그 이슈로 kickoff
하라는 뜻이다. 스크립트에 번호를 바로 넘기지 말고 먼저 이슈를 읽어 유형을 판정한다:

1. `git remote get-url origin`으로 `owner/repo`를 얻는다.
2. 런타임의 GitHub 통합(GitHub MCP 도구)으로 제목·본문·라벨을 읽는다. `gh` CLI로
   셸아웃하지 않는다(프로젝트가 명시 허용한 경우만 예외).
3. 유형 판정(feature/bugfix/chore) — "결정의 성질"로. 라벨 힌트: `bug`→bugfix,
   `enhancement`/`feature`→feature, `chore`/`dependencies`/`documentation`→chore. 제품
   판단이 필요하면 feature로 승격한다.
4. kebab-case 영어 slug·한국어 제목(·분명하면 `--area`)을 도출한다.
5. 도출한 값으로 실행하고 원본 이슈를 `--issue`로 남긴다:

   ```sh
   npm run harness:kickoff -- --type bugfix --slug session-restore --title "세션 복원 실패" --issue 42
   ```

`--issue`는 provenance를 기록한다(feature/bugfix frontmatter `issue:`, 모든 유형 `state.md`
kickoff 로그 줄). 이슈 번호를 스크립트에 직접 넘기면 실패하며 먼저 조회·분류하라고 알린다.
상세는 `.harness/harness/protocols/kickoff.md`의 "GitHub 이슈로 시작".

`$kickoff`는 각 단위에 단계 체크포인트 원장 `state.md`도 만든다(승인 게이트·세션
인수인계용). 새 세션은 이 파일을 가장 먼저 읽어 현재 단계와 승인 여부를 판단한다.
