---
name: merge-and-clean
description: 대상 PR을 squash merge한 뒤, 그 head 브랜치가 사는 전용 worktree와 로컬·원격 브랜치를 정리하고, 주 워킹트리(main-wt)는 건드리지 않은 채 로컬 base(main) ref만 origin과 ff로 최신화하는 원-샷 정리 스킬. head는 항상 별도 worktree에 있다고 가정하고, main-wt는 개발자 몫이라 checkout으로 전환하지 않는다(base가 거기 열려 있으면 clean일 때만 제자리 ff-only, 아니면 ref ff). GitHub 쓰기·조회는 gh CLI, 브랜치/worktree/pull 같은 로컬 작업은 git. PR 링크/번호를 인자로 받거나, 없으면 현재 세션 컨텍스트·현재 브랜치의 열린 PR로 추론하고(추론 시 머지 전 1줄 확인), 유추 불가하면 사용자에게 명시적 PR 링크를 요구한다. "머지하고 정리", "merge and clean", "PR 머지하고 브랜치 치워", "머지 후 정리·최신화" 등에 사용.
---

# merge-and-clean

대상 PR을 **squash merge**하고, 그 head가 사는 **전용 worktree와 로컬/원격 브랜치를 정리**한 뒤,
**주 워킹트리(main-wt)는 그대로 둔 채** 로컬 base(보통 `main`) ref를 **원격과 ff로 최신화**하고
끝내는 원-샷 스킬. head는 항상 별도 worktree에 있다고 가정한다(그 자리가 main-wt를 점유하지
않는다 — 하네스 kickoff이 항상 워크트리로 격리하므로). 한 번 호출 = PR 하나를 머지+정리(루프 아님).

> **GitHub 조회·머지는 `gh` CLI**(gh 우선, 토큰 효율) — 항상 `gh ...`. 이 스킬은 repo 자신의 호스트를 gh로 다룬다; gh 미가용·타호스트는 인증된 `mcp__github__*` MCP 폴백, 그마저 불가면 중단.
> 브랜치/worktree 삭제·checkout·fetch·pull 같은 **로컬 작업은 `git`**.
> 원격 브랜치 삭제도 `git push <remote> --delete`로 한다.
> **어떤 것도 `--force`/force-push를 쓰지 않는다.**

## Arguments

`/merge-and-clean [PR_LINK_OR_NUMBER]`

- **PR_LINK_OR_NUMBER**(선택): PR URL(`https://github.com/<owner>/<repo>/pull/<N>`),
  `owner/repo#N`, 또는 `#N`(현재 repo 기준). 생략 시 추론(절차 1).

## 확정 변수 (절차 전체에서 재사용)

- `<O>/<R>` = repo owner/name · `<N>` = PR 번호
- `<head>` = PR head 브랜치(=삭제 대상) · `<base>` = PR base 브랜치(=보통 main, 삭제 금지)
- `<remote>` = base가 추적하는 실제 리모트 이름(하드코딩 `origin` 금지 — 아래에서 탐지)
- `<main-wt>` = 주 워킹트리 절대경로(**개발자 예약 — checkout으로 전환 금지**)
- `<main-wt-branch>` = 주 워킹트리가 **현재 체크아웃한 브랜치**(2단계에서 캡처). `<base>`면 제자리 ff, base가 아닌 개발자 브랜치면 base는 워킹트리를 안 건드리는 ref ff로 올린다(규칙 8). head는 항상 별도 worktree라 이 값이 `<head>`면 **예상 밖 → 중단·확인**
- `<merged_head_sha>` = 이 PR이 머지한 head 커밋 sha(3단계 머지 응답의 머지커밋 sha가 아니라 **2단계 read의 `headRefOid`**) — 정리 안전 게이트의 기준

## 핵심 규칙 (non-negotiable)

1. **머지 가능 전제.** `merged==true`면 머지 스킵·정리만. `state==CLOSED`(미머지)거나, `mergeable==false`
   또는 `mergeable_state`가 dirty/blocked/behind면 **정리하지 않고 중단·보고.** `mergeable==null`(GitHub이
   아직 계산 중, tri-state)은 충돌이 아니다 — 짧게 재조회하고, 그래도 미확정이면 중단·확인. 에이전트가
   충돌을 임의 해소하지 않는다.
2. **데이터 손실 방지 게이트(단일 시점 스냅샷).** 파괴적 정리 직전 **한 번** 계산하고 그 결과를 정리 전
   구간에 재사용한다. 아래 중 하나라도면 **삭제를 멈추고 사용자 확인:**
   - `<head>`를 체크아웃한 워킹트리/worktree에 **커밋 안 된 변경**(`git status --porcelain` 비어있지 않음).
   - **머지된 스냅샷을 넘어선 로컬 `<head>` 커밋**이 있음 — 판정은 `git -C <main-wt> rev-list <merged_head_sha>..<head>`가
     비어있지 않음(=로컬 head가 머지된 sha보다 앞섬). 동치로 `git rev-parse <head>` == `<merged_head_sha>`면 안전.
     **`git cherry`/patch-id 비교는 절대 쓰지 않는다** — squash 머지는 여러 커밋을 한 커밋으로 접어 patch-id가 달라져서,
     cherry가 **이미 머지된 커밋도 '미반영(+)'으로 오판**(squash 후 항상 비어있지 않음)한다. sha 비교가 squash·fork·미푸시 모두에 견고하다.
   - **로컬 `<head>`가 존재하는데 위 판정 명령이 실패(exit≠0)** — 예: `<merged_head_sha>`가 로컬에 없음/모호. "없음=안전" 간주 금지,
     **판정 불가 → 사용자 확인**(핵심 규칙 7). exit code와 stderr를 stdout 공백과 반드시 구분한다. (로컬 `<head>` 자체가 없으면 삭제할 것이 없어 스킵.)
3. **base 브랜치는 절대 삭제하지 않는다.** 삭제 대상은 오직 `<head>`.
4. **force 금지.** force-push·`git push --force*`·`worktree remove --force`(미확인) 전면 금지. 로컬
   `git branch -D`는 로컬 포인터 삭제라 force-push가 아니며, **규칙 2의 sha 판정이 안전(로컬 `<head>` ==
   `<merged_head_sha>`, 또는 `rev-list <merged_head_sha>..<head>` 빈값)일 때만** 무확인 허용한다(아니면 확인).
5. **fork PR이면 원격 `<head>`를 건드리지 않는다**(소유·권한 다름). 머지·로컬 정리만.
6. **파괴 전 tip 기록.** `git branch -D`/worktree remove 전에 `git -C <main-wt> rev-parse <head>`(그리고
   `git -C <main-wt> reflog`)로 head 팁 SHA를 보고에 남겨 되돌림 여지를 확보한다.
7. **비정상 상태는 멈추고 확인.** 이미 머지·닫힘·충돌·dirty·base 미반영 커밋·detached HEAD·판정 불가·
   fork·리모트/인증 오류·권한 부족 등. **거짓 완료 보고 금지 — 실제 수행분만 보고.**
8. **주 워킹트리는 개발자 예약 — 절대 `checkout`으로 전환하지 않는다.** `<main-wt>`는 개발자가 직접 작업·확인하는
   자리다. 하네스 kickoff이 작업을 **항상 별도 worktree로 격리**하므로 `<head>`가 main-wt를 점유하는 일은 없다.
   따라서:
   - `<head>` 정리는 그것이 사는 **별도 worktree**에서만 한다. main-wt는 손대지 않는다.
   - base 로컬 ref 최신화는 `<main-wt-branch>`로 분기한다:
     - main-wt가 **base 위**(개발자가 `main`을 열어 둠) → **제자리 `merge --ff-only`**(clean일 때만 전진, 아니면 보고·no force). checkout-전환이 아니라 이미 있는 base를 앞으로 감는 것뿐이다.
     - main-wt가 **base가 아닌 다른 브랜치**(개발자 작업) → base는 체크아웃 안 됐으므로 워킹트리를 안 건드리는 **`git fetch <remote> <base>:<base>`(ref ff)** 로 로컬 base ref만 올린다. main-wt의 브랜치·미커밋 변경은 그대로 보존.
   - main-wt가 dirty여도 ref-ff 경로(base 아닌 브랜치)는 워킹트리를 안 건드려 안전하고, base 위 제자리 ff-only는 clean일 때만 전진한다.
   - `<main-wt-branch>`가 `<head>`면 **예상 밖**(kickoff은 항상 워크트리 격리) → 파괴 전 **중단·확인**(규칙 7). 이 판정은 `<main-wt-branch>`(2단계 캡처)로 하며, 블록 A가 진단, 블록 B가 분기한다.

## gh 계정·호스트 가드

`git remote get-url <remote>`로 repo 호스트를 확인한다. 이 스킬은 repo 자신의 호스트를 gh로 다룬다.

- **파괴적 쓰기(머지·브랜치/원격 삭제) 전 계정·호스트 가드:** `gh api user -q .login`으로 인증 계정과 `git remote get-url <remote>`로 repo 호스트를 확인한다. 의도한 계정·호스트와 다르거나 불명확하면 중단한다(계정 오발송 방지). 특정 계정을 고정하지 않는다.
- gh 인증 호스트와 repo 호스트가 다르면(예: repo가 별도 GitHub Enterprise 호스트) → 그 호스트에 인증된 `mcp__github__*` MCP 폴백. 폴백도 불가하면 사용자에게 알리고 중단(다른 호스트로 머지 시도 금지 — 404).
- gh가 없거나 인증이 죽어 있으면 → 같은 호스트에 인증된 `mcp__github__*` MCP 폴백. 폴백도 불가하면 사용자에게 알리고 중단.

## 실행 절차

### 1. PR 식별
우선순위:
1. **인자**의 PR 링크/번호. URL·`owner/repo#N`·`#N` 파싱. `#N`만 있으면 `git remote get-url <remote>`에서 owner/repo 추출.
2. 인자 없으면 **세션 컨텍스트 추론**: 이번 대화에서 생성/머지 대상으로 다룬 PR. **추론으로 특정하면 파괴 전에
   반드시 "식별한 PR: <링크> — 진행할까요?" 1줄 확인**(엉뚱한 PR 머지=비가역). 근거가 약하면 4번으로 폴백.
3. 그래도 없으면 **현재 git 브랜치**(`git rev-parse --abbrev-ref HEAD`)를 head로 하는 열린 PR 조회
   (`gh pr list --repo <O>/<R> --head <branch> --state open --json number,url`).
4. 위로도 특정 안 되면 **사용자에게 명시적 PR 링크를 요구**(유일하게 허용된 needs-input).

### 2. 사전 조회(최소 1콜) + 변수 확정 + 게이트

**조회는 mergeability 확인용 단 한 번의 read로 끝낸다.** 리뷰 무이슈 판정(Codex `+1`/무이슈 문구)은
`/llm-project-harness:pr-review-check-loop` 소관이므로 **여기서 reviews/threads/reactions/comments를 재조회하지 않는다**
(중복 조회 = 순수 토큰 낭비). merge-and-clean이 read에서 확인할 것은 오직 **mergeability + 정리에 필요한 ref/fork**다.

1. `<remote>` 확정: `git rev-parse --abbrev-ref <base>@{upstream}`(성공 시 리모트명 추출) 또는 `git remote`가
   하나뿐이면 그것. 여러 개면 base upstream 우선, 불명확하면 사용자 확인.
2. `<main-wt>` 확정: `git worktree list --porcelain | awk '/^worktree /{sub(/^worktree /,"");print;exit}'`(주 워킹트리; **공백 포함 경로 안전** — `$2` 필드분할 금지). 이어서 `<main-wt-branch>` 캡처: `git -C <main-wt> symbolic-ref --quiet --short HEAD`(detached면 빈값 → 규칙 7 중단 대상). 이 값이 `<base>`인지(개발자가 main을 열어 둠) 아니면 다른 개발자 브랜치인지가 블록 B의 base 최신화 방식을 가른다(규칙 8 — main-wt는 개발자 예약이라 어느 경우에도 checkout 전환 안 함; `<head>`면 예상 밖 → 중단·확인).
3. gh 계정·호스트 가드(위) → `gh api user -q .login`으로 인증 계정 확인.
4. **단일 PR read:** `gh pr view <N> --repo <O>/<R> --json state,mergeable,mergeStateStatus,headRefName,headRefOid,baseRefName,headRepositoryOwner,url`.
   `gh`가 `--json`으로 이미 서버사이드 투영하므로, 아래 필드만 변수화하고 객체 전량을 다시 인용/에코하지 않는다:
   - `state`(OPEN/CLOSED/**MERGED**) — gh는 머지를 `state==MERGED`로 준다(별도 `merged` bool 불필요)
   - `mergeable`(MERGEABLE/CONFLICTING/**UNKNOWN**) · `mergeStateStatus`(CLEAN/DIRTY/BLOCKED/BEHIND/UNSTABLE/UNKNOWN)
   - `<head>`=`headRefName` · `<base>`=`baseRefName` · `<merged_head_sha>`=`headRefOid`
   - fork 판별 = `headRepositoryOwner.login` ≠ `<O>`(base owner)
   - `url`
5. 게이트(핵심 규칙 1):
   - `state=="MERGED"` → 머지 스킵, **4단계(정리)로**.
   - `state=="CLOSED"`(미머지) → 중단·보고.
   - `mergeable=="CONFLICTING"` 또는 `mergeStateStatus`∈{DIRTY,BLOCKED,BEHIND} → 중단·보고("머지 가능 상태 아님").
   - `mergeable=="UNKNOWN"` 또는 `mergeStateStatus`=="UNKNOWN" → 계산 중. 몇 초 뒤 4번 **재조회는 이 tri-state 확정 때만**(1~2회). 그래도 미확정이면 중단·확인.
   - 통과 = `state=="OPEN"` && `mergeable=="MERGEABLE"`(가능하면 `mergeStateStatus`=="CLEAN").

### 3. Squash merge (gh)
```bash
gh pr merge <N> --repo <O>/<R> --squash [--subject '<...>'] [--body '<...>']
```
- **`--delete-branch`를 쓰지 않는다** — 브랜치 정리는 4단계의 안전 게이트(스냅샷 sha 일치)를 거쳐야 하므로 gh에 위임하지 않고 직접 한다.
- squash 커밋 제목/본문은 기본(PR 제목/설명)을 쓰거나 저장소 관례에 맞춰 `--subject`/`--body`로 명시.
- `<merged_head_sha>`는 머지커밋 sha가 **아니라** 2단계 `headRefOid`임에 유의(정리 게이트 기준).
- 머지 실패(권한·규칙·충돌) → 중단·원인 보고(정리 단계로 넘어가지 않는다). (gh 미가용 폴백: `mcp__github__merge_pull_request(merge_method="squash")`.)

### 4. 정리(로컬/원격) + base 최신화 — 배치 2블록

> **round-trip·출력 최소화:** git을 개별 명령으로 흩뿌리지 않고 **두 블록**으로 묶어 각각 한 번에 실행한다.
> 모든 git은 `git -C <main-wt> …`(에이전트 cwd가 삭제 대상 worktree 안이거나 콜마다 리셋돼도 안전).
> **블록 A는 read-only 게이트**(에이전트가 결과 보고 판단), **블록 B는 파괴적 정리+최신화**(A에서 안전 확정 후).

#### 블록 A — 스냅샷 안전 게이트 (read-only, 규칙 2를 여기서 한 번 계산)
플레이스홀더를 확정 변수로 치환해 실행한다. 출력은 **결정 라인만** 나온다.
```bash
MAIN_WT='<main-wt>'; HEAD='<head>'; BASE='<base>'; REMOTE='<remote>'; MERGED_SHA='<merged_head_sha>'
G(){ git -C "$MAIN_WT" "$@"; }
G fetch --quiet "$REMOTE"                                   # 머지 커밋을 <remote>/<base>에 반영·비교 신선도
if G show-ref --verify --quiet "refs/heads/$HEAD"; then
  echo "HEAD_LOCAL=1  TIP=$(G rev-parse "$HEAD")"           # tip 기록(규칙 6)
  if AHEAD="$(G rev-list "$MERGED_SHA".."$HEAD" 2>/tmp/mac_gate.err)"; then
    echo "AHEAD_COUNT=$(printf '%s' "$AHEAD" | grep -c .)"  # 0이어야 안전(규칙 2)
  else
    echo "GATE_CMD_FAILED=1"; cat /tmp/mac_gate.err          # 판정 불가 → 확인(규칙 2·7)
  fi
  WT="$(G worktree list --porcelain | awk -v b="refs/heads/$HEAD" '/^worktree /{p=$0;sub(/^worktree /,"",p)} /^branch /{if($2==b)print p}')"  # 공백경로 안전
  echo "HEAD_WORKTREE=${WT:-<none>}"
  [ -n "$WT" ] && echo "DIRTY=$(git -C "$WT" status --porcelain | grep -c .)"   # 0이어야 안전
else
  echo "HEAD_LOCAL=0"                                        # 로컬 head 없음 → 삭제할 것 없음(정상 스킵)
fi
echo "MAIN_WT_BRANCH=$(G symbolic-ref --quiet --short HEAD || echo '<detached>')"  # 규칙 8: base/head/제3자 판정
if G rev-parse --verify --quiet "refs/heads/$BASE" >/dev/null; then
  echo "BASE_DIVERGED=$(G rev-list --count "$REMOTE/$BASE".."$BASE" 2>/dev/null || echo '?')"  # ff-only 예고
fi
```
**안전 판정(에이전트):** 자동 삭제 허용 = `HEAD_LOCAL=0` **또는** (`AHEAD_COUNT=0` **&&** `DIRTY=0` **&&** `GATE_CMD_FAILED` 없음).
아니면 **삭제 멈추고 사용자 확인**(규칙 2·7). `BASE_DIVERGED>0`이면 블록 B의 ff-only가 거부될 것을 미리 알린다.
**`MAIN_WT_BRANCH` 판정(규칙 8):** `<base>`면 개발자가 main을 열어 둔 정상 케이스(블록 B가 제자리 ff-only). **base가 아닌 다른 브랜치면 개발자 작업** — 블록 B는 `IS_FORK`처럼 이 값을 필수 치환해 checkout을 건너뛰고 base를 ref ff로 올린다. `<head>`면 **예상 밖**(kickoff은 항상 격리) → 파괴 전 중단·확인. `<detached>`면 파괴 전 중단·확인(규칙 7).

#### 블록 B — 파괴적 정리 + base 최신화 (A에서 안전 확정 후에만)
**`IS_FORK`·`MWB`는 필수 치환 플레이스홀더**: `IS_FORK`(`<is_fork>`)는 2단계 fork 판별을 fork면 `1`·아니면 `0`으로,
`MWB`(`<main-wt-branch>`)는 2단계 캡처한 주 워킹트리 현재 브랜치로 넣는다(규칙 8 — checkout 분기 기준). 둘 다
하드코딩 기본값 아님(치환 안 하면 명백히 틀린 값이 되도록). 블록 B는 모든 파괴 단계에 **fail-closed 가드**를 둔다:
로컬/원격 삭제는 **머지 스냅샷과 tip이 정확히 일치할 때만**, 판정 불가(명령 실패)는 **삭제 대신 중단**한다. 각 단계
실패는 에코 후 규칙대로 계속/중단(`set -e` 쓰지 않음).
```bash
MAIN_WT='<main-wt>'; HEAD='<head>'; BASE='<base>'; REMOTE='<remote>'; MERGED_SHA='<merged_head_sha>'; IS_FORK='<is_fork>'; MWB='<main-wt-branch>'
G(){ git -C "$MAIN_WT" "$@"; }
# 0) 로컬 head 안전 가드(fail-closed): 로컬 head가 머지 스냅샷과 정확히 같거나(rev-parse==MERGED)
#    rev-list가 성공&비어있을 때만 통과. rev-list 실패(=MERGED 미해결, 판정 불가)는 ABORT(규칙 2·7).
if G show-ref --verify --quiet "refs/heads/$HEAD"; then
  if [ "$(G rev-parse "$HEAD")" != "$MERGED_SHA" ]; then
    if AH="$(G rev-list "$MERGED_SHA".."$HEAD" 2>/dev/null)"; then
      [ -n "$AH" ] && { echo "ABORT: local $HEAD ahead of merged snapshot — not deleting"; exit 3; }
    else
      echo "ABORT: cannot resolve $MERGED_SHA locally — undecidable (규칙 2·7)"; exit 3
    fi
  fi
fi
# 1) main-wt 위치 판정(규칙 8). main-wt는 개발자 예약 — 절대 checkout으로 전환하지 않는다.
#    head는 항상 별도 worktree라 main-wt를 비울 일이 없다(head-점유는 예상 밖 → ABORT).
G symbolic-ref -q HEAD >/dev/null || { echo "ABORT: main worktree detached (규칙 7)"; exit 4; }
if [ "$MWB" = "$HEAD" ]; then                                # 예상 밖: head가 main-wt 점유(kickoff은 항상 격리)
  echo "ABORT: head가 주 워킹트리를 점유 중 — 예상 밖(kickoff은 항상 워크트리 격리). 수동 확인(규칙 7·8)"; exit 5
elif [ "$MWB" = "$BASE" ]; then                              # 개발자가 base(main)를 열어 둠 → 제자리 ff만(5), checkout 안 함
  echo "MAIN_WT=on-base"; MW_ON_BASE=1
else                                                         # base가 아닌 개발자 작업 브랜치 → checkout 금지, base는 ref ff(5)
  echo "MAIN_WT_DEV_BRANCH=$MWB (개발자 예약 — checkout 안 함, base는 5)에서 ref ff)"; MW_ON_BASE=0
fi
# 2) worktree 정리(--force 금지; dirty는 A에서 이미 게이트; 공백경로 안전). remove 실패는 비치명.
#    ⚠️ 현재 세션(에이전트)이 그 worktree 안에서 실행 중이면 lock으로 remove가 막힌다("cannot remove a
#    locked working tree" / 로컬 head 삭제도 "used by worktree"로 막힘). 이 경우 도구별 워크트리 이탈
#    (ClaudeCode는 ExitWorktree)로 먼저 그 worktree를 벗어난 뒤 remove·branch -D를 재시도한다.
WT="$(G worktree list --porcelain | awk -v b="refs/heads/$HEAD" '/^worktree /{p=$0;sub(/^worktree /,"",p)} /^branch /{if($2==b)print p}')"
if [ -n "$WT" ]; then G worktree remove "$WT" && echo "WT_REMOVED=$WT" || echo "WT_REMOVE_FAILED=$WT (잠금? 세션이 점유 중이면 워크트리 이탈 후 재시도)"; else echo "WT=none"; fi
# 3) 로컬 head 삭제(0단계 가드 통과 상태)
if G show-ref --verify --quiet "refs/heads/$HEAD"; then
  G branch -D "$HEAD" && echo "LOCAL_DELETED=$HEAD" || echo "LOCAL_DELETE_FAILED=$HEAD"; else echo "LOCAL=absent"; fi
# 4) 원격 head 삭제(fork면 스킵; 존재는 exit-code로, **원격 tip==머지 스냅샷일 때만** 삭제 — 스냅샷 이후 push분 보호; 실패는 비치명)
if [ "$IS_FORK" = 1 ]; then echo "REMOTE=fork-skip"; else
  if OUT="$(G ls-remote --heads "$REMOTE" "$HEAD" 2>/tmp/mac_lsr.err)"; then
    if [ -n "$OUT" ]; then
      REMOTE_SHA="$(printf '%s\n' "$OUT" | head -1 | cut -f1)"
      if [ "$REMOTE_SHA" = "$MERGED_SHA" ]; then
        G push "$REMOTE" --delete "$HEAD" && echo "REMOTE_DELETED=$HEAD" || echo "REMOTE_DELETE_FAILED(non-fatal)=$HEAD"
      else
        echo "REMOTE_SKIP=tip $REMOTE_SHA != merged $MERGED_SHA (스냅샷 이후 이동 → 삭제 보류·확인)"
      fi
    else echo "REMOTE=absent/auto-deleted"; fi
  else echo "REMOTE=LSREMOTE_ERROR"; cat /tmp/mac_lsr.err; fi
fi
# 5) base 최신화(원격 삭제분까지 prune. force 금지). main-wt가 base면(MW_ON_BASE=1) 워킹트리에서 ff-only;
#    base가 아닌 개발자 브랜치면(MW_ON_BASE=0, 규칙 8) 워킹트리를 안 건드리는 ref ff로 로컬 base ref만 올린다.
G fetch --prune "$REMOTE"
if [ "$MW_ON_BASE" = 1 ]; then
  G merge --ff-only "$REMOTE/$BASE" && echo "BASE_FF=OK@$(G rev-parse --short HEAD)" || echo "BASE_FF=REFUSED(diverged; 보고+확인, no force)"
else
  # base는 어느 워킹트리에도 체크아웃 안 됨(개발자가 base 아닌 브랜치) → ref ff 안전. non-ff면 거부(force 금지).
  G fetch "$REMOTE" "$BASE:$BASE" && echo "BASE_FF=REF-OK@$(G rev-parse --short "$BASE")" || echo "BASE_FF=REF-REFUSED(non-ff 또는 base가 체크아웃됨; 보고+확인, no force)"
fi
```

### 5. 완료 보고 (Output Contract)
- **정상 완료 시:** ① 머지한 PR 링크·번호, base←head, squash 여부 · ② 머지 커밋 `sha` · ③ 정리 결과(삭제한
  로컬 브랜치 / 원격 브랜치[확인삭제 · auto-delete · fork 스킵 · **스냅샷 이후 이동으로 보류(REMOTE_SKIP)** · 삭제실패(사유)] / 제거한 worktree 경로 / 기록한 head tip SHA) ·
  ④ base 최신화 결과(main-wt가 base면 제자리 ff 반영·현재 HEAD; **base가 아닌 개발자 브랜치면 ref ff로 로컬 base만 올리고 main-wt 브랜치·미커밋 변경은 보존**) · ⑤ 스킵·경고가 있었으면 사유(main-wt는 개발자 예약이라 checkout 생략·워크트리 lock 이탈 등 포함). (블록 A/B의 에코 라인이 그대로 보고 근거.)
- **중단/미머지로 끝난 경우:** 식별된 PR(또는 "미특정") + 중단 사유(미머지/충돌/mergeable 미확정/dirty/base
  미반영 커밋/판정 불가/인증/권한) + 다음 필요 조치. 정상 완료 항목(①~④)은 "해당 없음"으로 명확히.

## 토큰 효율 (이 스킬의 필수 규율)

원-샷 스킬이라 멀티사이클 컨텍스트 부담은 없지만, MCP 페이로드·git round-trip·verbose 출력이 토큰을 먹는다.
아래를 지킨다(정보량·안전은 그대로, 같은 일을 더 적은 토큰으로).

- **최소 조회 (M1):** GitHub read는 **mergeability 확인용 `gh pr view --json` 단 1콜**. 리뷰 무이슈 판정은
  `/llm-project-harness:pr-review-check-loop` 소관 — reviews/threads/reactions/comments **재조회 금지**. `mergeable==UNKNOWN` 재조회만 예외(1~2회).
- **페이로드 투영 (M2):** `gh pr view --json <필드목록>`으로 **서버사이드 투영**해 필요한 필드만 가져온다(2단계 목록 필드만).
  객체 전량을 다시 인용/에코하지 않는다.
- **git 배치 (M3):** 정리·최신화는 개별 명령이 아니라 **블록 A(read-only 게이트) + 블록 B(파괴+최신화) 2회 실행**으로 묶어
  round-trip을 15+ → 2로 줄인다. 각 블록은 **결정 라인만** 에코해 그대로 보고 근거가 되게 한다.
- **긴 출력 캡처 (M4):** 예상 못 한 대용량 출력(예: 광범위 `git status`, 충돌 로그)은 파일로 캡처 후 `grep`/`tail` 요약만 읽는다.
  블록 A/B는 애초에 요약만 내도록 설계돼 있다.
- **명세 1회 로드 (M5):** 이 SKILL.md는 호출 시 1회만. 단계마다 재읽기 금지.

## 실패 모드
- **나쁨:** `origin/<head>` 비교(ref 부재 시 fatal) 또는 `cherry <base> <head>`(squash patch-id 오판, 항상 비어있지 않음)로 판정 → 오탐/유실.
  **좋음:** `<merged_head_sha>` sha 비교(`rev-list <merged_head_sha>..<head>` 빈값)로 판정하고, 명령 실패는 "판정 불가→확인".
- **나쁨:** mergeable==UNKNOWN을 충돌로 오판해 정상 PR 중단 / enum을 잘못 비교.
  **좋음:** tri-state로 다뤄 UNKNOWN은 재조회, CONFLICTING만 중단. gh `--json` 필드명(headRefName/baseRefName/mergeStateStatus) 사용.
- **나쁨:** 리터럴 `origin` 하드코딩 → 비-origin 리모트에서 전부 실패.
  **좋음:** base upstream에서 `<remote>` 탐지해 치환.
- **나쁨:** 원격 삭제 실패로 전체 중단 / cwd가 삭제된 worktree라 이후 명령 연쇄 실패.
  **좋음:** 원격 삭제 실패는 비치명(계속), 모든 정리는 `git -C <main-wt>`.
- **나쁨:** mergeability 확인하러 reviews/threads까지 다 끌어와 토큰 낭비 / PR 객체 전량을 컨텍스트에 덤프.
  **좋음:** read 1콜, 필요한 필드만 투영, git은 2블록 배치·요약 에코(토큰 효율).
- **나쁨:** 안전 가드가 fail-**open** — `rev-list <merged>..<head>` 실패(exit≠0, MERGED 미해결)의 빈 stdout을 "0개 앞섬=안전"으로 읽어 삭제 강행 / 원격 tip을 스냅샷과 비교 안 하고 존재만으로 삭제 / `IS_FORK` 기본 0에 기대 fork 오삭제.
  **좋음:** fail-**closed** — 로컬은 rev-parse 일치 또는 rev-list(성공&빈값)만 통과·판정불가는 ABORT, 원격은 `ls-remote` tip==`<merged_head_sha>`일 때만 삭제, `IS_FORK`는 필수 치환 플레이스홀더.
- **나쁨:** 개발자가 쓰는 main-wt를 무조건 `checkout <base>`로 전환하거나 head를 비우려 든다 → 개발자 브랜치·미커밋 변경이 튕겨 작업이 깨진다.
  **좋음:** main-wt는 개발자 예약이라 절대 checkout하지 않는다(규칙 8). base 위면 제자리 ff-only, base가 아니면 `fetch <remote> <base>:<base>` ref ff로 로컬 base만 올린다. `<main-wt-branch>`가 head면 예상 밖 → 중단·확인. head 정리는 항상 별도 worktree에서.
- **나쁨:** 에이전트 자신이 head worktree 안에서 실행 중인데 `worktree remove`가 lock으로 실패하자 정리 실패로 보고하고 멈춘다.
  **좋음:** 세션이 그 worktree를 점유(lock)하면 먼저 워크트리를 벗어난 뒤(ExitWorktree 등) remove·branch -D를 재시도한다.
- **나쁨:** 아무것도 안 했는데 "정리 완료" 보고.
  **좋음:** 블록 에코 라인 기준 실제 수행분만·스킵/중단 사유 명시.
