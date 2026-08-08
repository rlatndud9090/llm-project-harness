---
name: pr-review-check-once
description: PR에 Codex가 자동으로 남긴 리뷰 코멘트를 1회(one-pass) 점검·검증하고, 정당한 지적은 PR 브랜치에서 수정·푸시한 뒤 각 코멘트에 답글로 반영 내용을 설명한다(gh CLI 우선, MCP 폴백). PR 링크를 인자로 받거나, 없으면 현재 세션이 다루던 PR을 추론한다. 의사결정(PRD/ADR)에 반하는 지적은 적용 전 사용자와 논의. "코덱스 리뷰 확인", "PR 코멘트 확인", "check codex review", "리뷰 코멘트 반영", "리뷰 한번만 확인" 등에 사용. 재리뷰를 요청하고 무이슈까지 계속 감시·반복하는 라이브 워치 루프가 필요하면 pr-review-check-loop.
---

# pr-review-check-once

PR에 달린 **Codex 자동 리뷰**를 가져와 프로젝트 정보 + 현재 세션 컨텍스트로 검증하고, 정당한 지적은 PR 브랜치에서 수정·푸시한 뒤 **각 코멘트에 답글**로 반영 내용을 설명하는 **1회성(one-pass) 경량 스킬**.

> 🔁 **재리뷰 요청 + 무이슈까지 반복(live-watch loop)** 이 필요하면 **`/llm-project-harness:pr-review-check-loop`** 스킬을 쓴다. 이 스킬은 한 번 확인·반영·푸시·답글하고 종료하는 경량 버전이며, GitHub 작업은 **`gh` CLI 우선**(토큰 효율), gh 미가용 시 `mcp__github__*` MCP 폴백이다.

> ⚠️ **적용 대상 제한 — Codex 자동 리뷰가 없는 호스트는 제외.** Codex 자동 리뷰는 **github.com** 레포에만 붙는다. 시작 시 `git remote get-url origin`으로 호스트를 확인해 **`github.com`이 아니면(예: GitHub Enterprise 호스트) 이 스킬을 적용하지 않는다**: Codex 리뷰가 존재하지 않으므로, 그 사실을 사용자에게 한 줄로 알리고 **즉시 종료**한다(코드 변경·푸시·답글 금지).

## Trigger
- 사용자가 `/pr-review-check-once` 명령 사용 (구 `/check-codex-review`)
- "코덱스 리뷰 확인", "PR 코멘트 확인", "리뷰 코멘트 반영", "리뷰 한번만 확인", "check codex review" 등 요청

## Arguments
`/pr-review-check-once [PR_LINK_OR_NUMBER]`

- **PR_LINK_OR_NUMBER** (선택): PR URL(`https://github.com/<owner>/<repo>/pull/<N>`), `owner/repo#N`, 또는 단순 `#N`(현재 repo 기준).
  - 생략 시 **현재 세션이 다루던 PR을 추론**한다(절차 1). 추론 불가 시에만 사용자에게 명시적 링크를 요청한다.

**예시:**
- `/pr-review-check-once https://github.com/<owner>/<repo>/pull/4`
- `/pr-review-check-once #4`
- `/pr-review-check-once` — 세션 컨텍스트에서 PR 추론

## 핵심 규칙 (반드시 준수)

1. **GitHub 작업은 `gh` CLI 우선.** 모든 조회/쓰기는 **`gh ...`** 로 한다. 조회는 `--jq`로 Codex 봇만 서버사이드 필터 + 필요한 필드만 투영해 토큰을 아낀다. **`gh`가 없거나 인증 불가하면** `mcp__github__*` MCP로 폴백한다(deferred면 `ToolSearch` 선행). gh·MCP 둘 다 없으면 답글·푸시 불가 — 절차 0대로 사용자에게 보고한다. **write(답글/커밋 코멘트) 직전 계정·호스트 가드**: `gh api user -q .login`으로 인증 계정과 `git remote get-url origin`으로 repo 호스트를 확인해 의도한 계정·호스트와 다르거나 불명확하면 중단한다(계정 오발송 방지). 특정 계정을 고정하지 않는다.
2. **Codex 리뷰 포맷 / clean 신호:**
   - 리뷰할 게 **있으면** → PR에 **코멘트**(인라인 리뷰 코멘트 / 리뷰 본문 / 대화 코멘트)로 달린다.
   - 리뷰할 게 **하나도 없으면** → PR 본문에 **👍(`:+1:`) 리액션**으로 보인다. **clean 판정의 1차 신호는 "Codex 작성자의 리뷰·인라인 코멘트·대화 코멘트가 모두 0건(빈 배열)"** 이다(리뷰 조회가 빈 배열인 것은 동기화 지연이 아니라 **검토 완료 + 무지적**을 뜻한다). gh는 리액션을 읽을 수 있으므로(`gh api .../issues/<N>/reactions`) Codex 👍 존재로 **보조 확인**한다.
3. **의사결정 가드:** 코멘트가 프로젝트의 확정된 의사결정(하네스 장착 시 `docs/raw/feature/<slug>/{prd,adr}.md`의 approved PRD / accepted ADR)에 **반하는 내용**이면, 임의로 적용하지 않는다. 사용자에게 충돌을 설명하고 **ADR supersede 여부를 먼저 논의**한 뒤 결정에 따른다.
4. **수정은 항상 PR의 head 브랜치에서만.** `main`/기본 브랜치 직접 커밋·푸시 금지. **history 재작성 push 전면 금지**(`--force`, `--force-with-lease`, `+`-refspec, 강제 non-fast-forward 포함).
5. 커밋·푸시·답글은 이 스킬 호출로 위임된 작업이라 진행 가능하나, **의사결정 충돌 / 사실관계 불확실한 큰 변경 / 비정상 상태(머지·닫힘·fork·non-fast-forward)** 는 사용자 확인을 먼저 받는다.

## 실행 절차

### 0. gh 인증 선확인 (MCP 폴백)
1. **`gh` 인증 확인:** `gh auth status` 로 로그인이 살아 있는지 확인. 죽어 있으면 사용자에게 재로그인 요청(`! gh auth login`) 후 중단.
2. **계정·호스트 가드:** `gh api user -q .login`으로 인증 계정과 `git remote get-url origin`으로 repo 호스트를 확인한다. 의도한 계정·호스트와 다르거나 불명확하면 중단·보고(계정 오발송 방지). 특정 계정을 고정하지 않는다.
3. **gh 미가용 시 MCP 폴백:** `gh`가 없거나 인증 불가하면 `ToolSearch`로 `+github`(또는 `+pull_request`)를 검색해 `mcp__github__*` GitHub MCP 도구로 폴백한다. **gh·MCP 둘 다 없으면** 답글·푸시 불가를 사용자에게 보고(공개 PR이면 `WebFetch`로 read-only 수집 정도만 가능). 이후 read-only로만 진행하거나 중단.

### 1. PR 식별
우선순위대로 시도:
1. **인자**에 PR 링크/번호가 있으면 사용. URL/`owner/repo#N`/`#N`에서 `owner`·`repo`·`number` 파싱. `#N`만 있으면 `git remote get-url origin`에서 owner/repo 추출.
2. 인자가 없으면 **현재 세션 컨텍스트에서 추론**:
   - 이번 대화에서 **생성/언급된 PR**(URL 또는 `#N`)이 있으면 그 PR.
   - 없으면 **현재 git 브랜치**(`git rev-parse --abbrev-ref HEAD` — 디렉터리명 아님)를 head로 하는 **열린 PR**을 조회: `gh pr list --repo <O>/<R> --head <branch> --state open --json number,title,url`.
   - owner/repo는 `git remote get-url origin`에서 추출.
3. 위로도 특정 안 되면 **사용자에게 명시적 PR 링크 요청** 후 중단(유일하게 허용된 needs-input).

확정 PR을 한 번 조회해 **head·base·state·fork 여부**를 확보한다:
```bash
gh pr view <N> --repo <O>/<R> \
  --json number,state,isDraft,headRefName,headRefOid,headRepositoryOwner,baseRefName,url
```
`state`(OPEN/CLOSED/MERGED)·`headRefName`·`headRefOid`·head repo owner와 base repo owner 관계(=fork 판별)를 확인한다.

### 2. Codex 리뷰 수집 (gh `--jq` 투영 — Codex 봇만 서버사이드 필터)
PR의 **리뷰 본문 + 인라인 리뷰 코멘트 + 대화 코멘트**를 모은다. 항상 `--jq`로 (a) Codex 봇만 필터하고 (b) 실제 쓰는 필드만 투영한다(raw 전량 덤프 금지 — `user`(~1.2KB)+`_links`가 순수 노이즈):
```bash
# inline 리뷰 코멘트 (Codex only, 투영)
gh api repos/<O>/<R>/pulls/<N>/comments --paginate \
  --jq '[.[]|select(.user.type=="Bot" and (.user.login|ascii_downcase|test("codex")))|{id,login:.user.login,created_at,path,line,position,in_reply_to_id,diff_hunk,body}]'
# 리뷰 본문 (Codex only, 투영)
gh api repos/<O>/<R>/pulls/<N>/reviews --paginate \
  --jq '[.[]|select(.user.type=="Bot" and (.user.login|ascii_downcase|test("codex")))|{id,login:.user.login,state,submitted_at,body}]'
# 대화(issue) 코멘트 (Codex only, 투영)
gh api repos/<O>/<R>/issues/<N>/comments --paginate \
  --jq '[.[]|select(.user.type=="Bot" and (.user.login|ascii_downcase|test("codex")))|{id,login:.user.login,created_at,body}]'
# 사람 코멘트는 "보고만" → 작성자+링크(+개수)만
gh api repos/<O>/<R>/issues/<N>/comments --paginate \
  --jq '[.[]|select(.user.type!="Bot")|{login:.user.login,created_at,html_url}]'
```
- (gh 미가용 폴백: MCP `pull_request_read` get_reviews / get_review_comments, `issue_read` get_comments도 가능하나, 필드 투영이 안 돼 대량일수록 토큰상 불리하다.)
- **Codex 봇 필터:** `user.type == "Bot"` **AND** login이 `chatgpt-codex-connector[bot]`(보조: login에 `codex` 포함, 대소문자 무시). 애매하면 사용자에게 "이 코멘트가 Codex 자동 리뷰가 맞는지" 확인. 사람 코멘트는 자동 수정 대상이 아니다(보고만).
- **Codex 항목이 0건이면(세 조회 모두 빈 배열)** → **clean**. 리액션으로 보조 확인:
  ```bash
  gh api repos/<O>/<R>/issues/<N>/reactions
  ```
  Codex bot의 `+1`(무이슈) 흔적이 있으면 clean 확정. 그대로 "리뷰할 것 없음(clean)" 보고 후 종료.
  - 단, **PR이 방금 열렸거나 Codex 리뷰 이벤트 흔적이 전혀 없으면(리액션도 없음)** 아직 리뷰 전일 수 있으니, 그 사실을 보고하고 대기/재시도 여부를 사용자에게 묻는다. (무이슈까지 자동 감시가 필요하면 `/llm-project-harness:pr-review-check-loop`.)

### 3. 컨텍스트 종합 + 검증
각 Codex 코멘트를 다음으로 교차 검증:
- **프로젝트 정보**: `CLAUDE.md`, 관련 소스, 테스트.
- **현재 세션 컨텍스트**(있으면): 이번 작업의 결정·구현 의도.
- **하네스 산출물**(장착 시): 해당 피처의 `prd.md`(approved) / `adr.md`(accepted) / `notes.md`.

**outdated 선판별**: 인라인 코멘트의 `position`이 `null`이거나 `diff_hunk`가 현재 head 코드와 불일치하면 'outdated 가능' 플래그를 달고, **현재 head의 해당 코드를 먼저 확인**한다. 이미 해소된 지적은 수정 없이 "현재 코드에서 이미 처리됨(SHA 인용)" 답글만 단다.

각 코멘트 분류:
- **valid-bug** — 실제 결함. **수정 전 재현/실패 테스트로 결함을 먼저 입증**한다(입증 불가하면 false-positive 후보로 강등·재검토).
- **valid-improvement** — 합리적 개선. 비용 대비 가치 판단 후 수정 또는 보류(보류 시 이유 답글).
- **false-positive** — 코드/컨텍스트상 틀린 지적. 수정 없이 근거 답글.
- **decision-conflict** — 확정 의사결정(PRD/ADR)에 반함 → **4단계**.

판정이 모호하거나 영향이 크면 별도 검증 서브에이전트(`verifier`/`code-reviewer`)로 적대 검증을 거친다.

### 4. 의사결정 충돌 가드 (decision-conflict)
코멘트가 approved PRD / accepted ADR 결정에 반하면 **임의로 적용하지 않는다.** 사용자에게:
1. 충돌하는 코멘트 내용,
2. 그에 반하는 **ADR/PRD 결정과 근거(approval 사유 포함)**,
3. 선택지 — **(a)** 결정 유지 + Codex에 "의도된 설계"라고 답글, **(b)** ADR supersede
를 제시하고 **사용자 결정을 먼저 받는다.** 결정 전에는 그 항목을 수정하지 않는다.

→ (b) supersede 선택 시: `/llm-project-harness:adr-helper` 흐름으로 **새 ADR(accepted) 작성 + 기존 ADR status를 `superseded`로 갱신**까지 완료한 **뒤** 코드 수정에 착수한다(문서만 남고 코드가 안 바뀌거나, 코드만 바뀌고 ADR이 stale로 남는 일 방지).

> ⚠️ **하네스 주의(accepted ADR 불변)**: 이 하네스의 `harness:check`는 **accepted/superseded ADR 본문 변경을 차단**한다. 그러므로 (a) 결정 유지 + 추적만 할 때 노트는 **`adr.md`가 아니라 `notes.md`(후속작업 섹션)** 에 남긴다. ADR 결정 자체를 바꾸려면 (b) supersede ADR로만 한다.

### 5. 수정 작업 (valid 항목)
**진입 전 상태 게이트**:
- PR `state`가 `MERGED`/`CLOSED` → 자동 수정·푸시 **중단**, 사용자에게 "이미 머지/닫힘 — head에 follow-up 커밋 vs 새 PR/이슈" 확인.
- `headRepositoryOwner` ≠ base repo owner(=**fork PR**) → push 권한 없을 수 있으니 **자동 푸시 보류**, "답글만 달거나 제안 패치를 코멘트로 제시" 확인.

게이트 통과 시:
1. **PR head 브랜치에서 작업.** 브랜치 판정은 디렉터리명이 아니라 `git rev-parse --abbrev-ref HEAD`로만 한다. 현재 체크아웃이 `headRefName`이 아니면 체크아웃/worktree로 전환. 백그라운드 잡/공유 체크아웃이면 worktree로 격리.
2. 코멘트별 **최소·정확한 수정**. valid-bug는 3단계의 실패 테스트가 수정 후 통과하는지 확인(test-first).
3. **하네스 장착 시**: `npm run harness:gate`(또는 프로젝트의 test/build)를 **green**으로 만든 뒤 진행.
4. **커밋**: 프로젝트 커밋 컨벤션 준수. 하네스라면 Lore 커밋(의도 + 관련 PRD/ADR 링크 + 트레일러). 프로젝트가 쓰는 트레일러(예: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`)를 끝에 붙인다.
5. **푸시**: push 직전 `git rev-parse --abbrev-ref HEAD`가 `headRefName`과 일치하는지 검증한 뒤 head 브랜치에 push. **non-fast-forward가 나면 푸시 중단** → 원인(원격이 앞섬/잘못된 브랜치) 보고 후 사용자 확인. **모든 force 계열 push 금지.**

### 6. 답글 (반영 설명)
처리한 **각 Codex 코멘트에 in-thread 답글**:
- **수정함**: 무엇을 어떻게 고쳤는지 + 커밋 SHA.
- **이미 처리됨(outdated)**: 현재 코드에서 해소된 근거(SHA 인용).
- **보류함**(valid-improvement): 이유 + 후속 계획.
- **false-positive**: 수정 안 한 근거(코드/컨텍스트 인용).
- **decision-conflict → 결정 유지**: 해당 ADR/PRD 결정 인용해 "의도된 설계" 설명.

**답글 폴백 체인**: 인라인 스레드 reply → 불가하면 **단일 PR 대화 코멘트**에 각 항목별 **원 코멘트 링크/인용 + 처리 결과**를 묶어서 단다(어느 코멘트에 대한 답인지 식별 유지) → 쓰기 경로 자체가 없으면 답글 불가를 보고하고 처리 요약을 사용자에게 직접 전달(7단계 보고로 대체).
```bash
# 인라인 스레드 reply (gh)
gh api repos/<O>/<R>/pulls/<N>/comments/<comment_id>/replies -f body='...'
# 단일 대화 코멘트 (gh)
gh api repos/<O>/<R>/issues/<N>/comments -f body='...'
```
(gh 미가용 폴백: MCP `add_reply_to_pull_request_comment` / `add_issue_comment`.)

### 7. 완료 보고
사용자에게 요약 보고:
- PR 링크·head 브랜치,
- 발견한 Codex 코멘트 수,
- 수정 N건(+커밋 SHA·푸시 결과) / 이미 처리 N건 / 보류 N건 / false-positive N건 / 의사결정 충돌 N건(논의 결과),
- harness:gate 결과(green 여부),
- 단 답글 목록.

clean인 경우엔 "리뷰할 것 없음"만 간결히 보고. (반영 후 재리뷰를 걸고 무이슈까지 반복하고 싶다면 `/llm-project-harness:pr-review-check-loop`로 이어가도록 안내.)

## 주의사항
- **`gh` CLI 우선** — 항상 `gh ...`, 조회는 `--jq` 투영+Codex 필터. gh 미가용 시에만 `mcp__github__*` MCP 폴백(deferred면 `ToolSearch` 선행). **gh·MCP 둘 다 없으면 답글·푸시 불가** → 사용자에게 보고. write 전 계정·호스트 가드(`gh api user -q .login` 인증 계정 + `git remote get-url origin` 호스트 확인, 다르거나 불명확하면 중단; 특정 계정 고정 금지).
- **clean 판정 = Codex 리뷰·인라인·대화 코멘트 세 조회 모두 빈 배열.** 리뷰 조회 빈 배열은 비정상이 아니다. gh는 리액션(👍)을 읽을 수 있어 보조 확인에 쓴다.
- Codex 봇 = `user.type=="Bot"` + `chatgpt-codex-connector[bot]`(보조: login에 codex 포함). 사람 코멘트는 보고만.
- 의사결정에 반하는 지적은 **사용자 논의 전 절대 코드 반영 금지.**
- 수정·푸시는 **PR head 브랜치 한정**. **머지/닫힘/fork/non-fast-forward**는 멈추고 사용자 확인. **force 계열 push 전면 금지.**
- valid-bug는 **수정 전 실패 테스트로 결함 입증** 후 고친다(false-positive 오반영 방지).
- 답글은 **반영 사실과 근거**를 구체적으로 — Codex가 닫을 수 있도록.
- 백그라운드 잡/공유 체크아웃에서는 worktree 격리로 작업.
- **무이슈까지 자동 반복이 필요하면 → `/llm-project-harness:pr-review-check-loop`.**
