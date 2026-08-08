---
name: pr-review-check-loop
description: PR에 달린 Codex 자동 리뷰를 clean 상태까지 밀어붙이는 라이브 워치 루프. 코멘트를 검증·반영·푸시하고 각 스레드에 답글을 단 뒤 @codex review로 재리뷰를 요청하고, 새 리뷰가 없다는 Codex의 명시적 무이슈 판정이 나올 때까지 백그라운드 watch로 계속 감시하며 반복한다. "코덱스 리뷰 루프", "리뷰 끝까지 돌려", "무이슈까지", "check codex review loop", "리뷰 반영 반복" 등에 사용. 1회만 확인하는 경량 버전은 pr-review-check-once.
---

# PR Review Check Loop

PR에 달린 **Codex 자동 리뷰**를 가져와 프로젝트/세션 컨텍스트로 검증하고, 정당한 지적은 PR head 브랜치에서 수정·푸시한 뒤 **각 코멘트에 답글**로 반영 내용을 설명하고, **`@codex review`로 재리뷰를 요청**한 다음, **Codex가 명시적으로 "무이슈"라고 응답할 때까지 백그라운드 watch로 계속 감시하며 같은 루프를 반복**하는 스킬.

> 이 스킬은 codex의 `codex-pr-review-loop`를 Claude Code 환경으로 이식한 것이다. 원본은 "루프가 안 끝났는데 에이전트가 제멋대로 종료하는" 문제를 막기 위해 명세가 계속 보강됐다. **[references/protocol.md](references/protocol.md)의 non-negotiable 규칙을 절대 완화하지 말 것.**

> ⚠️ **적용 대상 제한 — Codex 자동 리뷰가 없는 호스트는 제외.** Codex 자동 리뷰는 **github.com** 레포에만 붙는다. 시작 시 `git remote get-url origin`으로 호스트를 확인해 **`github.com`이 아니면(예: GitHub Enterprise 호스트) 이 스킬(루프 포함)을 적용하지 않는다**: Codex 리뷰가 존재하지 않으므로, 그 사실을 사용자에게 한 줄로 알리고 **즉시 종료**한다(watch 루프 시작·코드 변경·푸시·답글 금지).

## Trigger
- 사용자가 `/pr-review-check-loop` 명령 사용
- "코덱스 리뷰 루프", "리뷰 끝까지 돌려줘", "무이슈 뜰 때까지", "리뷰 반영 반복", "check codex review loop" 등

## Arguments
`/pr-review-check-loop [PR_LINK_OR_NUMBER] [--snapshot]`

- **PR_LINK_OR_NUMBER** (선택): PR URL(`https://github.com/<owner>/<repo>/pull/<N>`), `owner/repo#N`, 또는 `#N`(현재 repo 기준). 생략 시 세션 컨텍스트/현재 브랜치로 추론(절차 1). 추론 불가 시에만 사용자에게 링크 요청.
- **`--snapshot`** (선택): 장시간 watch 없이 **현재 보이는 리뷰까지만** 1-pass 처리(기존 `pr-review-check-once`와 동등). 이 플래그가 없으면 **항상 live-watch가 기본**이다.

**예시:**
- `/pr-review-check-loop https://github.com/<owner>/<repo>/pull/4`
- `/pr-review-check-loop #4`
- `/pr-review-check-loop` — 세션 컨텍스트에서 PR 추론, live-watch

---

## 핵심 규칙 (반드시 준수)

1. **기본모드 = live-watch to clean.** `--snapshot`을 명시하지 않으면 one-pass로 끝내지 않는다. 재리뷰 요청 뒤 Codex의 **명시적 무이슈 판정**이 나올 때까지 백그라운드 watch로 계속 감시·반복한다.
2. **완료 조건은 Codex의 실제 무이슈 응답뿐이다.** 아래만으로는 절대 완료가 아니다 — CI 성공 / CI 미구성 / `eyes` 접수 / **watch `timeout`**. `timeout`은 종료가 아니라 **같은 cycle 재개 신호**다. **thread resolved 상태는 완료조건이 아니다**(에이전트 행동이지 Codex 신호가 아님 — 게이트에 넣으면 데드락). (protocol.md §0, §3)
3. **GitHub 작업은 `gh`가 기본이다**(gh 우선 — MCP는 폴백). 직접 `gh` 호출은 `gh ...`로 한다(helper 스크립트는 내부적으로 무효 `GITHUB_TOKEN`/`GH_TOKEN`을 자체 strip). 쓰기(답글/재리뷰/resolve)는 `gh` 우선, 불가 시 `mcp__github__*` 폴백. **git push는 `git`으로**, head 브랜치 한정. **write(답글/재리뷰) 전 계정·호스트 가드**: `gh api user -q .login`으로 인증 계정과 `git remote get-url origin`으로 repo 호스트를 확인해 의도한 계정·호스트와 다르거나 불명확하면 중단한다(계정 오발송 방지). 특정 계정을 고정하지 않는다.
4. **수정은 항상 PR head 브랜치에서만.** `main`/기본 브랜치 직접 커밋·푸시 금지. **모든 force 계열 push 전면 금지**.
5. **의사결정 가드:** 코멘트가 approved PRD / accepted ADR에 반하면 임의 적용 금지. 사용자와 supersede 여부를 먼저 논의(5절).
6. **조기종료 금지 / 거짓완료 금지.** 새 리뷰가 왔는데 안 읽거나, 기존 미처리 리뷰를 놔둔 채 "새 리뷰 없음"으로 끝내면 스킬 실패. 컨텍스트 한계 시엔 완료라 거짓말하지 말고 **checkpoint 후 재개 안내**(protocol.md §6.2).
7. 커밋·푸시·답글·재리뷰는 이 스킬 호출로 위임된 작업이라 진행 가능하나, **의사결정 충돌 / 사실 불확실한 큰 변경 / 비정상 상태(머지·닫힘·fork·non-fast-forward) / 권한·인증 부족**은 사용자 확인을 먼저 받는다.

---

## 실행 절차

### 0. 사전 점검 (gate)

1. **`gh` 인증 확인:** `gh auth status` 로 로그인이 살아 있는지 확인. 죽어 있으면 사용자에게 재로그인 요청(`! gh auth login`) 후 중단. `gh`가 없거나 인증 불가하면 → GitHub MCP(`mcp__github__*`)로 read-only 폴백만 가능(watch 루프 불가 → 사실상 `pr-review-check-once` 수준으로 축소되고, 그 사실을 사용자에게 보고).
2. **helper 경로 확인:** `PR_REVIEW_WATCH="${CLAUDE_PLUGIN_ROOT}/skills/pr-review-check-loop/scripts/pr_review_watch.py"` (플러그인에 함께 배포되는 helper를 쓴다).
3. **모드 결정:** `--snapshot`이면 snapshot pass, 아니면 live-watch(기본).

### 1. PR 식별
우선순위:
1. **인자**의 PR 링크/번호. URL/`owner/repo#N`/`#N` 파싱. `#N`만 있으면 `git remote get-url origin`에서 owner/repo 추출.
2. 인자 없으면 **세션 컨텍스트 추론**: 이번 대화에서 생성/언급된 PR → 그 PR. 없으면 **현재 git 브랜치**(`git rev-parse --abbrev-ref HEAD`)를 head로 하는 열린 PR 조회.
3. **체크포인트 확인:** `~/.cache/pr-review-check-loop/pr-<owner>-<repo>-<N>.json`이 있으면 중단됐던 cycle을 재개(protocol.md §6).
4. 위로도 특정 안 되면 사용자에게 링크 요청 후 중단(유일하게 허용된 needs-input).

확정 후 PR을 조회해 아래를 확보한다:
```bash
gh pr view <N> --repo <OWNER>/<REPO> \
  --json number,state,isDraft,headRefName,headRefOid,headRepositoryOwner,baseRefName,mergeable,url
```
`state`(OPEN/CLOSED/MERGED)·`headRefName`·`headRefOid`·head repo와 base repo 관계를 확인한다.

### 2. Codex 리뷰 수집
1. **리뷰 본문 + 인라인 리뷰 코멘트 + 대화(issue) 코멘트**를 모은다. **토큰 효율(필수, protocol §8): 항상 `--jq`로 (a) Codex 봇만 서버사이드 필터하고 (b) 실제 쓰는 필드만 투영해서 가져온다.** raw 전량 덤프는 코멘트 1건당 `user`(~1.2KB)+`_links`만으로 순수 노이즈가 쌓인다(실측 raw 대비 **-85%**).
   ```bash
   # inline 리뷰 코멘트 (Codex only, 투영)
   gh api repos/<O>/<R>/pulls/<N>/comments --paginate \
     --jq '[.[]|select(.user.type=="Bot" and (.user.login|ascii_downcase|test("codex")))|{id,login:.user.login,created_at,path,line,position,in_reply_to_id,body}]'
   # 리뷰 본문 (Codex only, 투영)
   gh api repos/<O>/<R>/pulls/<N>/reviews --paginate \
     --jq '[.[]|select(.user.type=="Bot" and (.user.login|ascii_downcase|test("codex")))|{id,login:.user.login,state,submitted_at,body}]'
   # 대화(issue) 코멘트 (Codex only, 투영)
   gh api repos/<O>/<R>/issues/<N>/comments --paginate \
     --jq '[.[]|select(.user.type=="Bot" and (.user.login|ascii_downcase|test("codex")))|{id,login:.user.login,created_at,body}]'
   # 사람 코멘트는 "보고만" → 본문 말고 작성자+링크(+개수)만 (있으면 사용자에게 알림)
   gh api repos/<O>/<R>/issues/<N>/comments --paginate \
     --jq '[.[]|select(.user.type!="Bot")|{login:.user.login,created_at,html_url}]'
   ```
   - **전량 재수집은 루프 최초 진입(기존 미처리분 확보) 1회로 한정한다(O2).** 이후 사이클은 8단계 watch verdict의 `state.codex_*`(helper가 이미 `since` 증분·투영)만 처리하고, `diff_hunk`/현재 head 코드는 outdated 확인이 필요한 **해당 코멘트만** 개별 재조회한다(`gh api repos/<O>/<R>/pulls/comments/<id>`). 매 사이클 full `--paginate`를 반복하지 않는다.
   - (MCP `pull_request_read` get_reviews / get_review_comments, `issue_read` get_comments도 가능하나, 필드 투영이 안 되므로 대량일수록 `--jq` 경로가 토큰상 유리하다.)
2. **Codex 봇 필터:** `user.type == "Bot"` **AND** login이 `chatgpt-codex-connector[bot]`(보조: login에 `codex` 포함, 대소문자 무시). 사람 코멘트는 자동 수정 대상이 아니다(보고만).
3. **첫 조회 분기:**
   - **미처리 Codex 항목이 있으면** → 4단계로.
   - **0건이면** → 리액션으로 상태를 구분한다:
     ```bash
     gh api repos/<O>/<R>/issues/<N>/reactions
     ```
     - Codex bot의 `+1`(무이슈) 흔적이 있으면 → 이미 clean. 보고 후 종료.
     - `eyes`만 있거나 리액션이 없으면 → **아직 리뷰 전이거나 트리거 필요.** live-watch 기본이므로 **7단계로 가서 `@codex review`를 걸고 watch에 진입**한다(빈 첫조회를 clean으로 오판하지 않는다). `--snapshot`이면 "현재 리뷰 없음"만 보고.

### 3. (없음 — 2단계에서 흡수)

### 4. 컨텍스트 종합 + 검증
각 Codex 코멘트를 교차 검증:
- **프로젝트 정보:** `CLAUDE.md`, 관련 소스/테스트.
- **현재 세션 컨텍스트:** 이번 작업의 결정·의도.
- **하네스 산출물**(장착 시): `docs/raw/feature/<slug>/{prd,adr,notes}.md`.

**outdated 선판별:** 인라인 코멘트 `position`이 `null`이거나 `diff_hunk`가 현재 head와 불일치면 'outdated 가능' 플래그 → 현재 head의 해당 코드부터 확인. 이미 해소됐으면 수정 없이 "현재 코드에서 처리됨(SHA 인용)" 답글만.

각 코멘트 분류:
- **valid-bug** — 실제 결함. **수정 전 재현/실패 테스트로 결함을 먼저 입증**(입증 불가 시 false-positive 후보로 강등·재검토).
- **valid-improvement** — 합리적 개선. 비용 대비 가치 판단 후 수정/보류(보류 시 이유 답글).
- **false-positive** — 틀린 지적. 수정 없이 근거 답글.
- **decision-conflict** — 확정 의사결정에 반함 → 5단계.

판정이 모호하거나 영향이 크면 `verifier`/`code-reviewer` 서브에이전트로 적대 검증.

**수정 경로 판정 (repair route):** accept한 항목이 정해지면 수정 규모로 실행 경로를 고른다. 위임 호출 형태는 에이전트 = `Task(subagent_type="oh-my-claudecode:<name>")`, 스킬 = `/oh-my-claudecode:<name>`(또는 Skill 도구). **어떤 경로로 위임하든 accept/reject 최종판정·검증 게이트 채택·커밋·푸시·답글·재리뷰·watch 제어는 메인 에이전트만 수행**하며(protocol.md §0), 위임 결과도 6단계(수정·검증·커밋·푸시) 게이트 — head 브랜치 한정·force 금지·valid-bug는 test-first — 를 그대로 거친다.
- **국소 수정** — 단일 파일·자명한 오타/가드. 메인 에이전트가 직접 고치거나 `executor`(기본 model=sonnet)에 위임.
- **다중 파일·검증 루프** — 2~5 파일·테스트 동반. `executor`(model=opus)로 구현한 뒤 **별도** `verifier`(read-only) 패스로 증거를 확보하고(같은 컨텍스트 self-approve 금지) 메인 에이전트가 최종 채택; 완강한 다파일 반복은 `/oh-my-claudecode:ralph`로 감싼다.
- **설계 재정의** — 리뷰가 설계 가정을 흔듦. `architect`(read-only 진단) → `planner` 또는 고위험이면 `/oh-my-claudecode:ralplan`으로 계획 고정 → `executor`(model=opus, 완강하면 `/oh-my-claudecode:ralph`) 구현 → `verifier` 검증.
- **제품 결정·충돌** — 요구가 상충하거나 제품 판단 필요. 구현 위임 금지, **5단계 의사결정 충돌 가드**로 넘긴다.

### 5. 의사결정 충돌 가드
코멘트가 approved PRD / accepted ADR에 반하면 **임의 적용 금지.** 사용자에게 (1) 충돌 코멘트, (2) 반하는 결정과 근거, (3) 선택지 — **(a)** 결정 유지 + Codex에 "의도된 설계" 답글 / **(b)** ADR supersede — 를 제시하고 결정을 먼저 받는다.
- (b) 선택 시: 새 ADR(accepted) 작성 + 기존 ADR status `superseded` 갱신을 **먼저** 완료한 뒤 코드 수정 착수.
- (a) 유지 시 추적 노트는 `adr.md`가 아니라 `notes.md`(후속작업)에 남긴다(accepted ADR 불변 하네스 가드).

### 6. 수정 + 검증 + 커밋 + 푸시
**진입 전 상태 게이트:**
- PR `state`가 `MERGED`/`CLOSED` → 자동 수정·푸시 중단, "head follow-up 커밋 vs 새 PR/이슈" 사용자 확인.
- `headRepositoryOwner` ≠ base repo owner(=fork PR) → push 권한 없을 수 있으니 자동 푸시 보류, "답글만/제안 패치 코멘트" 확인.

게이트 통과 시:
1. **PR head 브랜치에서 작업.** 브랜치 판정은 `git rev-parse --abbrev-ref HEAD`로만. 현재 체크아웃이 `headRefName`이 아니면 체크아웃/worktree 전환. 백그라운드 잡/공유 체크아웃이면 worktree 격리.
2. 코멘트별 **최소·정확한 수정.** valid-bug는 4단계 실패 테스트가 통과하는지 확인(test-first).
3. **검증:** 가장 작은 증명 가능한 검증부터 → 저장소 실제 진입점으로 확장(`package.json`의 test/lint/typecheck/build, `pyproject.toml`/pytest, Makefile, 저장소 `AGENTS.md`/README). 하네스면 `npm run harness:gate`를 green으로. **토큰 효율(O4): 검증 명령은 로그를 파일로 캡처하고 요약만 읽되, 종료코드를 1차 게이트로 삼는다** — 예: `npm run harness:gate > "$TMP/gate.log" 2>&1; rc=$?` 후 `grep -niE 'fail|failed|✗|✘|error|assert|traceback' "$TMP/gate.log"` + `tail -n 20 "$TMP/gate.log"`, 그리고 `[ $rc -ne 0 ] && echo "FAILED(rc=$rc)"`. **최종 pass/fail은 `rc`로 판정**(grep은 보조 요약) — 문구 없이 종료코드만 실패인 케이스를 놓치지 않는다. 로그 전문을 컨텍스트로 끌어오지 않는다. 오래 걸리는 검증은 `run_in_background`.
4. **커밋:** 저장소 커밋 컨벤션 준수. 트레일러(예: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`)를 끝에.
5. **푸시:** push 직전 `git rev-parse --abbrev-ref HEAD` == `headRefName` 검증 후 `git push`. **non-fast-forward면 푸시 중단** → 원인 보고 후 사용자 확인. **force 계열 전면 금지.**

### 7. 답글 + 재리뷰 요청
1. **각 Codex 코멘트에 in-thread 답글** (반영/이미 처리(SHA)/보류(이유)/false-positive(근거)/의사결정 유지(ADR 인용)). 폴백: 인라인 스레드 reply(`gh api .../pulls/<N>/comments/<id>/replies` 또는 MCP `add_reply_to_pull_request_comment`) → 불가하면 단일 대화 코멘트에 각 항목 링크/인용+처리결과 묶어서. 스레드 resolve는 선택(정리 목적 — **완료조건 아님**, 안 해도 무이슈 판정이 서면 done. `gh api graphql` resolveReviewThread).
2. **재리뷰 요청** — 트리거 코멘트 작성. 응답에서 `id`·`created_at`를 확보:
   ```bash
   gh api repos/<O>/<R>/issues/<N>/comments \
     -f body=$'@codex review\n\n- 반영 내용 1\n- 반영 내용 2' \
     --jq '{id: .id, created_at: .created_at}'
   ```
   - **첫 줄은 정확히 `@codex review`** (앞뒤 공백 없음).
   - 반환된 `id` → `TRIGGER_COMMENT_ID`, `created_at` → `TRIGGER_TS`.
3. **ack(eyes) 확인** (helper, read-only):
   ```bash
   python3 "$PR_REVIEW_WATCH" ack --owner <O> --repo <R> --pr-number <N> --comment-id <TRIGGER_COMMENT_ID>
   ```
   - `acknowledged` → 8단계. `request-failed` → protocol.md §2.4 fallback_split → trigger_only_retry.
   - 초기 PR 자동리뷰 모드(수동 트리거 없음)면 이 단계 건너뛰고 PR 본문 `eyes`로 접수 확인.

### 8. Live-watch (기본모드)
`eyes` 접수(또는 초기모드 PR 본문 접수) 후 **백그라운드 watch 실행** (protocol.md §3):
```bash
python3 "$PR_REVIEW_WATCH" watch \
  --owner <O> --repo <R> --pr-number <N> \
  --trigger-ts <TRIGGER_TS> \
  --trigger-comment-id <TRIGGER_COMMENT_ID> \
  --trigger-ack-state <acknowledged|pr-body-auto-review>
```
> **반드시 `run_in_background: true`로 실행.** helper 기본 예산 2시간은 Bash 10분 timeout을 초과하므로 포그라운드로 돌리면 watch가 죽는다.
> **폴링은 적응형(protocol §5.2):** 첫 응답 대기는 COLD(초반 30초, 상한 120초), 무이슈 판정 후 CI/스레드만 남았거나 CI PENDING이면 HOT(20초)로 전환해 종료 임박 시 빠르게 인식한다. 백그라운드 폴은 토큰이 아니라 값싼 `gh` 콜만 쓰므로 간격을 반응성 기준으로 잡는다. 간격 조정이 필요하면 `--schedule`/`--hot-interval`로 넘긴다(기본값 권장).

watch 종료 시 stdout JSON `result` 분기:
- **`new_activity`** → 즉시 **2단계로 복귀**(state의 새 코멘트/리뷰 읽기 → 4~7 반복).
- **`no_issues`** → helper가 CI(SUCCESS/NONE)·has_actual_response·명시적 무이슈까지 검증한 상태 → **`done`, 9단계 보고.** (thread resolved 여부는 완료와 무관.)
- **`timeout`** → **종료 금지.** 같은 트리거로 watch를 **다시 백그라운드 실행**(cycle 재개). 사용자 중단/blocker/컨텍스트 한계가 아니면 계속.
- 프로세스가 죽었으면: 생존 확인 후 같은 트리거로 재개(중복 watch 금지).

컨텍스트 한계가 오면 → protocol.md §6.2 checkpoint 파일 기록 + "미완료, 재개 필요" 보고. **완료라 거짓말하지 않는다.**

### 9. 완료 보고 (Output Contract)
최종 보고에 최소 포함:
1. PR 링크·head 브랜치, 몇 cycle 돌았는지
2. 검토한 Codex 코멘트/스레드 수와 판정(수정 N / 이미처리 N / 보류 N / false-positive N / 의사결정충돌 N)
3. 반영 커밋 SHA·push 결과
4. 실행한 검증 명령과 핵심 결과(harness:gate green 여부)
5. PR에 남긴 답글·재리뷰 요청 요약
6. **종료 근거** — Codex의 명시적 무이슈 판정 / 사용자 중단 / 복구 불가 blocker / (checkpoint면) 미완료 재개안내 중 무엇인지

**단순 watch timeout을 최종 성공 보고로 쓰지 않는다.** snapshot 모드면 "이번 패스 처리분 + 재리뷰 요청함, watch 미수행"을 명시.

---

## 주의사항
- **GitHub 작업은 `gh`가 기본**(gh 우선) — 항상 `gh ...`. helper는 자체 strip. gh 인증 죽으면 `mcp__github__*` read-only 폴백만. write(답글/재리뷰) 전 계정·호스트 가드(`gh api user -q .login` 인증 계정 + `git remote get-url origin` 호스트 확인, 다르거나 불명확하면 중단; 특정 계정 고정 금지).
- **완료 = Codex의 명시적 무이슈 판정.** watch `timeout`·CI·eyes는 단독 완료 근거 아님. thread resolved는 완료조건이 아니다(에이전트 행동 — 게이트 금지).
- **timeout → watch 재개**가 기본. 조기종료·거짓완료 금지. 컨텍스트 한계는 checkpoint로.
- Codex 봇 = `user.type=="Bot"` + `chatgpt-codex-connector[bot]`(보조: login에 codex 포함). 사람 코멘트는 보고만.
- 의사결정 반하는 지적은 사용자 논의 전 코드 반영 금지.
- 수정·푸시는 PR head 브랜치 한정. 머지/닫힘/fork/non-fast-forward는 멈추고 확인. force 계열 전면 금지.
- valid-bug는 수정 전 실패 테스트로 결함 입증 후 고친다.
- 백그라운드 잡/공유 체크아웃은 worktree 격리.
- 1회만 확인하고 끝내려면 → **`/llm-project-harness:pr-review-check-once`** 스킬(경량 1-pass, gh 우선).

### 토큰 효율 (필수 — protocol.md §8, non-negotiable을 완화하지 않음)
- **수집은 항상 투영+Codex필터(`--jq`).** raw 전량 덤프 금지. 전량 재수집은 루프 진입 1회, 이후는 watch verdict delta 처리(O1·O2). "모든 Codex 코멘트를 읽는다"는 `body`를 그대로 유지하므로 위반 아님.
- **repair(코드 수정)·심층 파일검증은 `executor`/`verifier`/`explore` 서브에이전트로 위임한다(O5).** 파일 읽기·수정 churn을 **그쪽 컨텍스트**에서 소모 — 멀티사이클 내내 살아있어야 하는 메인 루프 컨텍스트를 비운다. **accept/reject·needs-clarification 판정, 검증 게이트 최종 채택, 커밋·푸시, 답글·thread resolve, 재리뷰(`@codex review`), watch 제어는 메인만 수행(protocol §0).** 위임한 verifier는 증거만 만들고 그 채택은 메인이 별도 패스로 한다(위임 컨텍스트 self-approve 금지 — §4 본문·protocol §0과 동일).
- **step4 소스 확인은 코멘트가 준 `path:line` 범위만** 읽는다(전파일 읽기 금지). `git diff`도 해당 파일로 스코프.
- **검증 로그는 파일 캡처 후 grep/tail 요약(O4).** 긴 검증은 `run_in_background`.
- **명세는 1회만 읽는다(O6).** protocol.md는 루프 시작 시 1회, SKILL.md는 이미 컨텍스트에 있음 — 사이클마다 재읽기 금지.

## Resources
- 상태기계·조기종료 방지·복구 규칙: [references/protocol.md](references/protocol.md)
- read-only watch helper: [scripts/pr_review_watch.py](scripts/pr_review_watch.py) (`ack` / `watch` 서브커맨드)
