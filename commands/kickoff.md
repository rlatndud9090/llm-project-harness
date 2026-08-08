# /kickoff

확정된 작업 단위의 브랜치에 대응하는 raw unit을 생성한다.

## 인자 판정

`$ARGUMENTS`가 **이슈 번호나 GitHub 이슈 URL 하나뿐**이면(`42`, `#42`,
`https://github.com/o/r/issues/42`) "GitHub 이슈로 시작" 경로다. 그렇지 않으면 인자를
그대로 스크립트에 넘긴다.

## 실행 (일반)

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/kickoff.mjs" $ARGUMENTS
```

> 실행 **전** 항상 origin/main 기준 전용 워크트리로 격리한다(`EnterWorktree`, 이름
> `<type>/<slug>`). 주 워킹트리(main-wt)는 개발자가 직접 쓰는 자리라 kickoff이 자동
> 전환하지 않는다(base에서 격리 없이 부르면 힌트만). 상세는
> `${CLAUDE_PLUGIN_ROOT}/harness/protocols/kickoff.md`의 "브랜치 처리".

## 실행 (GitHub 이슈로 시작)

`$ARGUMENTS`가 이슈 번호/URL 하나면 스크립트에 그대로 넘기지 말고 먼저 이슈를 조회·분류한다:

1. `git remote get-url origin`으로 `owner/repo`를 얻는다.
2. `gh` CLI(`gh issue view <번호> --repo <owner>/<repo> --json title,body,labels`)로 이슈
   제목·본문·라벨을 읽는다. **`gh` 미설치·미인증이면 GitHub MCP 도구(`mcp__github*__issue_read`/
   `get_issue`/`search_issues` 등)로 폴백**한다.
3. 유형을 판정한다(feature/bugfix/chore). 라벨 힌트: `bug`→bugfix,
   `enhancement`/`feature`→feature, `chore`/`dependencies`/`documentation`→chore. 모호하면
   본문으로 판단하고, 제품 판단이 필요하면 feature로 승격한다.
4. kebab-case 영어 slug와 한국어 제목을 도출한다(영역이 분명하면 `--area`도).
5. 도출한 값으로 실행하고 원본 이슈를 `--issue`로 남긴다:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/kickoff.mjs" --type <feature|bugfix|chore> --slug <slug> --title "<제목>" --issue <번호|URL>
   ```

## 예시

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/kickoff.mjs" --type feature --slug data-contract --title "데이터 계약"
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/kickoff.mjs" --title "메인 레이아웃" --area "메인 레이아웃"
node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/kickoff.mjs" --type bugfix --slug session-restore --title "세션 복원 실패" --issue 42
```

`--area "<영역>"`(선택)는 이 unit이 발전시키는 기능/구조 영역을 `prd.md`/`bugfix.md`
frontmatter에 시드한다(여러 개는 콤마). `--section "<섹션>"`(선택)은 area 상위의 섹션을
`section:`에 시드한다(단일 값; 프로젝트에 섹션이 2개 이상이면 wiki가 섹션별 파일로 분리됨).
`$next-feature` 앵커에 영역·섹션이 있으면 자동 시드된다.

공용 기준은 `${CLAUDE_PLUGIN_ROOT}/harness/protocols/kickoff.md`다.

무엇을 할지 아직 정하지 못했으면 먼저 `$next-feature`를 사용한다. raw 골격이
생기면 `$prd-helper`로 PRD 작성을 잇는다.
