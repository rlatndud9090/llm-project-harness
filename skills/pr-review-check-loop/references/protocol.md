# PR Review Check Loop — Protocol

이 문서는 `pr-review-check-loop` 스킬의 **상태기계·조기종료 방지 규칙·복구 규칙**을 정의한다.
SKILL.md보다 이 문서가 더 상세하며, 충돌 시 **이 문서의 non-negotiable 규칙이 우선**한다.

> 이 프로토콜의 존재 이유: Codex 원본 스킬에서 "루프가 완전히 끝나지 않았는데 에이전트가 제멋대로 종료하는" 현상이 반복됐다. 아래 규칙은 그 조기종료를 막기 위한 것이며, 임의로 완화하면 안 된다.

---

## 0. 절대 규칙 (Non-Negotiable)

- 재리뷰(`@codex review`)를 올린 뒤에는 아래 **세 가지 중 하나**가 나올 때까지 루프를 유지한다. 그 외의 어떤 이유로도 완료로 간주하지 않는다.
  1. **Codex의 명시적 무이슈 판정** (본문 텍스트 매치 또는 초기 자동리뷰의 PR 본문 `+1`)
  2. **사용자의 명시적 중단**
  3. **복구 불가능한 blocker** (권한/인증/PR 상태 등)
- 아래 신호들은 **단독으로 완료 근거가 될 수 없다.**
  - CI 성공
  - CI 미구성(N/A)
  - `eyes` 접수 확인
  - watch 프로세스의 `timeout` 결과
- **thread resolved 상태는 완료조건이 아니다.** 스레드 resolve는 Codex의 신호가 아니라 **에이전트의 행동**이므로 완료 게이트에 넣지 않는다. (넣으면 에이전트가 resolve하지 않는 한 무이슈 응답이 와도 watch가 영구 대기하는 데드락이 된다 — 실측 hang.) resolve는 선택적 정리일 뿐 done 판정과 무관하다.
- **watch 1회가 `timeout`으로 끝나는 것은 종료가 아니라, 같은 cycle을 재개하라는 신호다.** `timeout`을 성공/완료로 보고하면 프로토콜 위반이다.
- 새 Codex 리뷰/코멘트가 도착하면 **반드시 읽고**, 타당한 항목을 반영한 뒤 다시 재리뷰 요청 루프로 돌아간다. 읽지 않고 넘어가면 스킬 실패다.
- 루프 진입 시점에 **이미 존재하는** 미처리 Codex 리뷰/스레드/코멘트가 있으면, "지금 새 리뷰 없음"으로 끝내지 말고 그것부터 `process_reviews`로 처리한다.
- 기본모드는 **live-watch**다. 사용자가 명시적으로 "이번 패스까지만"/"스냅샷"을 요청하지 않으면 one-pass로 축소하지 않는다.
- 아래 판단·행동은 **메인 에이전트만** 최종 수행한다.
  - accept / reject / needs-clarification 최종 판정
  - 검증 게이트의 최종 채택, 커밋, 푸시
  - PR/리뷰 답글, thread resolve
  - `@codex review` 작성/삭제/재작성
  - live-watch 시작/재개/종료
- 단, **구현(코드 작성·편집)과 검증 증거 수집은 OMC 에이전트·스킬**(`executor`/`architect`/`planner`/`verifier`/`code-reviewer`/`ralph`/`ralplan` 등)에 위임할 수 있다. 위임하더라도 바로 위 목록의 최종 판단·행동(accept/reject·needs-clarification 판정, 검증 게이트 채택, 커밋·푸시, 답글·thread resolve, `@codex review`, live-watch 제어)은 메인 에이전트만 수행한다.
- 수정·푸시는 **PR head 브랜치 한정**. 모든 force 계열 push 금지(`--force`, `--force-with-lease`, `+`-refspec, non-fast-forward 강제).
- 의사결정(approved PRD / accepted ADR)에 반하는 지적은 **사용자 논의 전 절대 코드 반영 금지** (SKILL.md 5절).
- 토큰 효율 규칙은 §8을 따른다 — §8은 위 non-negotiable을 **완화하지 않는다**(같은 정보를 더 적은 토큰으로 다룰 뿐).

---

## 1. 상태기계 (States)

| State | 의미 | 진출(Exit) |
| --- | --- | --- |
| `identify` | PR 식별 + 상태/브랜치 확보 | `process_reviews`, `blocked` |
| `process_reviews` | 새/기존 리뷰를 읽고 판정·반영·검증·푸시 | `post_trigger`, `blocked`, `done` |
| `post_trigger` | `@codex review` 재리뷰 코멘트 작성 | `wait_ack`, `watch` |
| `wait_ack` | 트리거 코멘트에 Codex `eyes` 접수 확인 | `watch`, `fallback_split`, `trigger_only_retry`, `blocked` |
| `fallback_split` | 합본 코멘트를 요약+트리거로 분리 | `wait_ack`, `blocked` |
| `trigger_only_retry` | 한 줄짜리 트리거 코멘트만 재작성 | `wait_ack`, `blocked` |
| `watch` | 새 Codex 활동/무이슈/watch-timeout 대기 (백그라운드 프로세스) | `process_reviews`, `done`, `watch_timeout`, `blocked` |
| `watch_timeout` | 1회 watch 예산 소진 | **`watch` (기본)**, `checkpoint`, `blocked`, `cancelled` |
| `checkpoint` | 컨텍스트/턴 한계 → 상태 파일 기록 후 재개 안내 | `blocked`(재개 대기), 재호출 시 `identify` |
| `done` | 최신 cycle 기준 명시적 무이슈 종료 | terminal |
| `blocked` | 사용자 결정/권한/인증/PR 상태 등이 막음 | resume 전까지 terminal |
| `cancelled` | 사용자가 중단을 요청함 | terminal |

기본 흐름:

```
identify → process_reviews → post_trigger → wait_ack → watch
                 ↑                                        │
                 │  new_activity                          │
                 └────────────────────────────────────────┤
                                                           ├─ no_issues → done
                                                           └─ timeout   → watch (재개)
```

---

## 2. 트리거 규칙 (Trigger Rules)

### 2.1 First-cycle Trigger (기본 — PR 생성 자동리뷰 없음)

PR 생성 시 Codex 자동리뷰가 붙지 않는 설정이 기본이다. 그래서 루프 최초 진입에서 처리할
기존 리뷰가 없으면(`process_reviews`가 0건) 곧장 `post_trigger`로 가서 **설명·요약 없는 bare
`@codex review` 한 줄**을 단다(수정한 게 없으니 반영 요약도, 답글 대상도 없다). 그 트리거
코멘트의 `eyes`로 `wait_ack` → `watch`에 진입한다(`trigger_ack_state=acknowledged`).

- 빈 첫 조회를 `done`(clean)으로 오판하지 않는다 — 리뷰 0건은 "아직 리뷰 전"이지 "무이슈"가
  아니다. 무이슈는 트리거 뒤 Codex의 명시적 응답으로만 판정한다(§3).

### 2.1b (변형) Initial PR Auto-review — 자동리뷰를 쓰는 저장소만

Codex가 새 PR에 자동리뷰를 거는 저장소용 **변형**(기본 경로 아님). 시작 시 이미 리뷰/PR 본문
리액션이 보이면 이 경로로 처리된다.

- 첫 사이클에는 수동 `@codex review`를 작성하지 않는다.
- Codex bot이 PR 본문에 `eyes` 리액션 → 자동리뷰 접수로 간주, 바로 `watch` 진입.
- 그 뒤 Codex bot이 PR 본문에 `+1` 리액션 → 자동리뷰 무이슈 응답.
- 기준값:
  - `trigger_ts`: PR 생성 시각
  - `trigger_comment_id`: `0`
  - `trigger_ack_state`: `pr-body-auto-review`
- 자동리뷰 사이클에서 실제 Codex 피드백이 생기면 일반 수동 트리거 루프로 합류.

### 2.2 Trigger Format

- **첫 트리거(반영 전 — §2.1):** 정확히 한 줄 `@codex review`. 설명/요약 없음.
- **재리뷰 트리거(반영·푸시 후):** 합본 코멘트 1개 — 첫 줄 `@codex review` + 반영 요약 불릿.

```text
@codex review

- 반영 내용 1
- 반영 내용 2
```

규칙:

- **첫 줄은 언제나 정확히 `@codex review`** (앞뒤 공백 없음, 대소문자 그대로).
- 반영 요약(둘째 줄부터)은 **재리뷰 트리거에서만** 허용 — 첫 트리거는 반영한 게 없어 붙이지 않는다.
- 작성 도구: `gh pr comment` 대신 **`gh api .../issues/{n}/comments`** 를 써서 응답에서 `id`(→ `trigger_comment_id`)와 `created_at`(→ `trigger_ts`)를 즉시 확보한다. (MCP `add_issue_comment`도 id를 반환하면 사용 가능.)

### 2.3 Ack (`eyes`) Check

- 재리뷰 요청 직후 바로 watch에 들어가지 않는다. 먼저 트리거 코멘트에 Codex bot(`chatgpt-codex-connector`)의 `eyes` 반응을 확인한다.
- helper `ack` 서브커맨드 사용:
  - **front-loaded 스케줄**(기본 `8,12,20,30,45,60` — 첫 확인 ~8초)로 확인. Codex `eyes`는 거의 즉시 달리므로 옛 "60초 대기 후 첫 확인"의 낭비를 없앤다. 사이클마다 최대 1분씩 절약.
  - 작성자 확인 가능하면 `user.login == chatgpt-codex-connector` 여야 인정
  - 작성자 확인 불가 환경에서만 aggregate `eyes > 0`를 약한 fallback으로 허용
- 예외:
  - 초기 PR 자동리뷰 사이클은 issue comment 트리거가 없어 이 단계를 건너뛴다.
  - PR 본문 `eyes` 확인이 이미 끝났으면 바로 `watch` 진입.

### 2.4 Ack Failure Fallback

합본 코멘트가 접수되지 않으면(=`ack` helper가 `result=="request-failed"` 반환 — 스케줄 전 시도 소진) (`fallback_split`):

1. 합본 코멘트 삭제 (`gh api -X DELETE .../issues/comments/{id}`)
2. 반영 요약 코멘트 1개 작성
3. 한 줄짜리 `@codex review` 코멘트 1개 작성
4. 그 한 줄짜리 코멘트에 대해 다시 `ack`(→ `request-failed`까지) 확인

그 뒤에도 접수되지 않으면 (`trigger_only_retry`):

- 요약 코멘트는 유지
- 한 줄짜리 트리거 코멘트만 삭제 후 재작성
- 다시 `ack` 확인

> 접수 판정 기준은 **helper의 `request-failed` 결과**이지 고정 횟수가 아니다(ack 스케줄 길이는 §2.3의 기본 `8,12,20,30,45,60`=6회이며 바뀔 수 있다 — 횟수를 하드코딩하지 않는다).

그래도 접수 안 되면 `blocked`로 보고(무한 재시도 금지) — 단, **이미 접수/응답이 온 리뷰를 못 읽은 상태로 blocked 처리하지 말 것**.

---

## 3. Watch 실행 (Claude 특화)

### 3.1 왜 백그라운드인가

- Claude Code의 `Bash` 도구는 1회 호출 최대 timeout이 10분이다. helper의 기본 `--max-total-wait 7200`(2시간)을 **포그라운드로 돌리면 Bash timeout에 걸려 watch가 죽는다.**
- 따라서 watch는 **반드시 `run_in_background: true`로 실행**한다. 백그라운드 프로세스가 끝나면 harness가 에이전트를 재호출하며, 그때 stdout의 JSON verdict를 읽는다.
- 백그라운드 watch는 에이전트 컨텍스트를 소모하지 않으므로, 기다리는 동안 에이전트가 조기 종료할 이유가 없다.

실행 예:

```bash
PR_REVIEW_WATCH="${CLAUDE_PLUGIN_ROOT}/skills/pr-review-check-loop/scripts/pr_review_watch.py"
python3 "$PR_REVIEW_WATCH" watch \
  --owner <OWNER> --repo <REPO> --pr-number <N> \
  --trigger-ts <TRIGGER_TS> \
  --trigger-comment-id <TRIGGER_COMMENT_ID> \
  --trigger-ack-state <acknowledged|pr-body-auto-review>
```

> helper 내부가 `GITHUB_TOKEN`/`GH_TOKEN`을 자체적으로 벗기므로(무효 토큰이 인증을 가리는 환경에서도 안전) helper 실행엔 별도 처리가 필요 없다. helper 밖에서 직접 `gh`를 호출할 때는 **`gh ...`** 로 한다.

### 3.2 watch 결과 처리

helper stdout의 `result` 필드로 분기:

- `new_activity` → **즉시 `process_reviews`로 복귀.** `state.codex_issue_comments` / `codex_reviews` / `codex_thread_comments`를 읽어 새 지적을 처리한다.
- `no_issues` → **종료 후보.** helper가 이미 `ci_state ∈ {SUCCESS, NONE}` + `has_actual_response == true` + 명시적 무이슈 판정을 함께 검증한 상태다. 이 조건 하에서만 `done`. (unresolved thread 수는 진단 정보로만 verdict에 실리고 완료를 막지 않는다.)
- `timeout` → **종료 금지.** 같은 `trigger_ts`/`trigger_comment_id`/`trigger_ack_state`로 watch를 **다시 백그라운드 실행**한다(`watch_timeout → watch`). 새 2시간을 여는 것이지, 완료가 아니다.
- (백그라운드 프로세스가 죽었거나 결과가 비면) → 프로세스 생존 여부 확인 후, 같은 트리거로 재개. 중복 watch를 동시에 띄우지 않는다.

### 3.3 완료(`done`) 조건 — 모두 충족해야 함

1. 최신 trigger 이후 Codex의 **실제 응답**이 존재 (`has_actual_response == true`)
2. 아래 중 하나:
   - 수동 `@codex review` 이후 **명시적 무이슈 문구** (helper의 `NO_ISSUES_PATTERNS` 매치)
   - 초기 PR 자동리뷰에서 Codex bot의 PR 본문 `+1` 리액션
3. CI가 모두 성공(`SUCCESS`)이거나, configured check가 전혀 없어 `NONE`

위 3개를 helper의 `no_issues` verdict가 캡슐화한다. 에이전트가 임의로 3을 생략하고 `done` 하지 않는다.

> **thread resolved는 완료조건이 아니다(§0).** 스레드 resolve는 Codex 신호가 아니라 에이전트 행동이므로 done을 막지 않는다. resolve는 하고 싶으면 선택적으로 하되(정리 목적), 안 해도 무이슈 판정이 서면 `done`이다.

---

## 4. Loop Semantics

- 루프 진입 시 이미 존재하는 Codex review/thread/issue comment가 있으면 그것부터 읽고 `process_reviews`로 시작한다.
- "새 trigger 이후 활동만" 보는 증분 조회는 **기존 미처리 리뷰가 없다는 것이 확인된 뒤에만** 사용한다.
- `watch`에서 새 Codex 활동이 생기면 즉시 `process_reviews`로 복귀. 새 활동 = issue comment / pull review / review thread comment (+ 초기모드에서는 PR 본문 reaction).
- 증분 조회는 helper가 `since` 기반으로 처리한다(issue comments / review comments) — 에이전트는 verdict만 받는다.
- `done`은 §3.3의 4조건을 모두 만족할 때만 가능.

---

## 5. Watch Cadence & Time Budget

### 5.1 예산

- helper 기본 `--max-total-wait 7200`은 **1회 watch 호출의 예산**이다.
- 기본모드에서는 1회 watch timeout을 최종 종료로 쓰지 않는다.
- timeout 시 같은 `trigger_ts`/`trigger_comment_id`로 **즉시 다음 watch를 연다.**
- 사용자 중단이나 blocker가 없는 한 `watch_timeout → watch` 복귀가 기본이다.

### 5.2 적응형 폴링 cadence (반응성 — 2026-07 재설계)

백그라운드 watch는 **에이전트 토큰을 소모하지 않고** 값싼 `gh` 콜만 쓴다(인증 한도 5000/hr의 극히 일부). 따라서 폴 간격은 토큰이 아니라 **반응성** 기준으로 정한다. helper가 두 cadence를 상태로 전환한다:

- **COLD**(첫 응답 대기): 기본 `30,30,30,30,30,45,45,60,60,90,90,120` — 초반은 30초 고정(실측상 Codex 응답 중앙값 ~6분, 대부분 이 구간에 옴), 이후 완만히 오르되 **상한 120초**. 옛 스케줄의 780초(13분) 정체 구간을 제거했다.
- **HOT**(종료 임박): 기본 20초. Codex가 이미 무이슈를 냈고 **CI/스레드만 대기** 중이거나, 응답은 왔는데 **CI가 아직 PENDING**이면 HOT으로 전환한다. "이미 무이슈 떴는데 CI 끝나길 한참 기다리는" 지연을 없앤다(옛날엔 이 대기가 climbing backoff에 걸려 최대 13분). CI가 FAILURE면(고쳐야 하므로 임박 아님) COLD로 복귀.

효과: 인식 지연 최대 13분 → **≤2분**(HOT 구간은 ~20초). cadence 전환은 sleep 길이만 바꿀 뿐 **§0의 완료·읽기 규칙과 §3.3 done 4조건은 그대로**다.

> **helper는 나쁜 타임스탬프에 죽지 않는다.** `parse_iso`가 `...Z`와 숫자 오프셋(`...+09:00`)을 모두 견고하게 파싱한다. 과거엔 오프셋 형식 하나가 폴 예외를 일으켜 남은 예산 내내 watch가 침묵 사망(같은 코멘트 영구 미인식)했다 — 실측 7회. 이제 그 실패 모드는 없다.

---

## 6. Interruption & Context-limit Recovery

### 6.1 turn abort / tool cancel / 세션 재개

- 먼저 기존 백그라운드 watch 프로세스가 아직 살아 있는지 확인한다(BashOutput/프로세스 조회). 살아 있으면 그 결과를 계속 수집하고 **새 watch를 중복 실행하지 않는다.**
- 죽어 있으면 같은 `trigger_ts`/`trigger_comment_id`/`trigger_ack_state`로 즉시 재개한다.
- 재개 후에도 완료 조건은 여전히 명시적 무이슈 판정이다.

### 6.2 컨텍스트/턴 한계 → checkpoint (조기종료 금지)

에이전트 컨텍스트가 한계에 다가오면, **"다 됐다"고 거짓 완료하지 말고** 상태를 파일로 체크포인트한 뒤 사용자에게 재개 방법을 알린다.

체크포인트 파일 경로:

```
~/.cache/pr-review-check-loop/pr-<owner>-<repo>-<N>.json
```

최소 필드:

```json
{
  "owner": "...", "repo": "...", "pr_number": 0,
  "head_ref": "...", "head_sha": "...",
  "state": "watch | watch_timeout | process_reviews | ...",
  "trigger_ts": "YYYY-MM-DDTHH:MM:SSZ",
  "trigger_comment_id": 0,
  "trigger_ack_state": "acknowledged | pr-body-auto-review",
  "cycles_done": 0,
  "last_verdict": "new_activity | timeout | ...",
  "pending": ["아직 반영/답글 안 한 항목 요약"],
  "note": "재개 시 필요한 컨텍스트"
}
```

재개: 사용자가 `/pr-review-check-loop <PR>` 를 다시 호출하면 이 파일을 읽어 **같은 cycle을 이어간다.** 체크포인트는 완료가 아니라 일시중지이며, 보고 시 반드시 "미완료 — 재개 필요"임을 명시한다.

---

## 7. Reporting Discipline

- 사용자에게 능동 보고해도 되는 시점:
  - 실제 새 Codex 리뷰 활동이 도착했을 때
  - 명시적 무이슈 판정 또는 초기 PR 자동리뷰 `+1`이 확인됐을 때(→ `done`)
  - 사용자 판단이 필요한 blocker가 생겼을 때
  - 사용자가 snapshot/중단을 명시적으로 요청했을 때
  - 컨텍스트 한계로 checkpoint 했을 때(미완료 명시)
- **단순 watch timeout은 성공 보고 사유가 아니다.**
- 이미 존재하던 Codex 리뷰를 읽지 않은 채 "현재 시점 새 리뷰 없음"으로 보고하면 프로토콜 위반이다.
- 최종 완료 보고에는 §SKILL.md Output Contract 항목을 모두 포함한다.

---

## 8. Token Efficiency (필수 준수 — non-negotiable을 완화하지 않음)

이 섹션은 §0의 완료·읽기 규칙을 **완화하지 않는다.** "모든 새 Codex 코멘트를 읽는다", "명시적 무이슈까지 루프 유지", "timeout→watch 재개"는 그대로다. 아래는 **같은 정보를 더 적은 토큰으로** 다루는 방법일 뿐이다.

- **수집 투영 (O1):** issue/review/inline 코멘트는 항상 `--jq`로 (a) Codex 봇만 서버사이드 필터, (b) 에이전트가 실제 쓰는 필드만 투영해 가져온다. raw 전량 덤프는 코멘트 1건당 `user`(~1.2KB)+`_links`가 순수 노이즈다(실측 raw 대비 **-85%**). 본문(`body`)은 그대로 유지하므로 "모든 Codex 코멘트를 읽는다" 규칙 위반이 아니다.
- **전량 재수집 금지 (O2):** full `--paginate` 스캔은 **루프 최초 진입 1회**(기존 미처리분 확보, §4)로 한정. 이후 사이클은 §3.2 watch verdict의 `state.codex_issue_comments/codex_reviews/codex_thread_comments`(helper가 `since` 증분·투영)만 처리한다. outdated 확인용 `diff_hunk`/현재 head 코드는 **해당 코멘트만** 개별 재조회.
- **repair 위임 (O5):** 코드 수정·심층 파일검증은 `executor`/`verifier`/`explore` 등에 위임해 **그쪽 컨텍스트**에서 churn을 소모한다. 멀티사이클 내내 살아있어야 하는 건 메인 루프 컨텍스트다. §0의 최종판단·행동(**accept/reject·needs-clarification 판정, 검증 게이트 최종 채택**, 커밋·푸시, 답글·thread resolve, `@codex review`, watch 제어)은 여전히 메인만 수행한다. 위임한 executor/verifier/explore는 **구현·검증 증거만** 만들고, 그 증거의 채택(검증 게이트 통과 판정)은 메인이 **별도 패스**로 한다 — 위임 컨텍스트의 self-approve 금지(§0:26-32).
- **스코프 읽기:** step4 소스 확인은 코멘트가 준 `path:line` 범위와 스코프된 `git diff`만. 전파일 읽기 금지.
- **검증 로그 캡처 (O4):** 검증 명령은 파일로 리다이렉트 후 `grep`/`tail` 요약만 읽는다. 긴 검증은 `run_in_background`.
- **명세 1회 로드 (O6):** protocol.md는 루프 시작 시 1회. 사이클마다 SKILL.md/protocol.md 재읽기 금지.
- **watch verdict 투영:** helper는 `codex_issue_comments`도 `{id,login,created_at,body}`로 투영해 반환한다(reviews/thread와 동일). raw 누수 금지.
