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

## 워크트리 격리 (필수 · 주 워킹트리는 개발자 몫)

`harness:kickoff`을 부르기 **전에** 항상 작업을 origin/main 기준 전용 워크트리로 격리한다.
주 워킹트리(main-wt)는 개발자가 직접 작업·확인하는 자리라 절대 건드리지 않는다 — main-wt
상태(clean/dirty·어느 브랜치 위인지)와 무관하게 **항상** 격리한다.

1. `git fetch origin`으로 origin/main을 최신화한다.
2. origin/main을 베이스로 전용 워크트리를 만들고 그 안으로 들어간다.
   - **ClaudeCode**: `EnterWorktree`(이름 `<type>/<slug>`). 기본 `worktree.baseRef=fresh`면
     origin/<기본 브랜치>에서 분기한다(설정이 `head`면 origin/main 기준이 되도록 조정).
   - **Codex**: `git worktree add -b <type>/<slug> <path> origin/main` 후 그 경로로 이동.
3. 그 워크트리 안에서 위 `harness:kickoff`을 실행한다. 이미 `<type>/<slug>` 위라 스크립트가
   브랜치를 건드리지 않고 골격만 만든다.

격리 없이 base(main)에서 부르면 kickoff은 전환하지 않고 "워크트리로 격리하라" 힌트만 낸다.
정말 현재 위치(main-wt)에 브랜치를 파야 할 때만 `--checkout`을 쓴다. 공용 기준은
`.harness/harness/protocols/kickoff.md`의 "브랜치 처리".

## GitHub 이슈로 시작 (이슈 번호 인자)

사용자가 다른 말 없이 **이슈 번호나 GitHub 이슈 URL 하나만** 주면 그 이슈로 kickoff
하라는 뜻이다. 스크립트에 번호를 바로 넘기지 말고 먼저 이슈를 읽어 유형을 판정한다:

1. `git remote get-url origin`으로 `owner/repo`를 얻는다.
2. `gh` CLI(`gh issue view`)로 제목·본문·라벨을 읽는 것을 우선하고, 미설치·미인증이면
   런타임의 GitHub 통합(GitHub MCP 도구)으로 폴백한다.
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
