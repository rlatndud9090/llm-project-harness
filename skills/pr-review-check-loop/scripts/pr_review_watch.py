#!/usr/bin/env python3
"""Read-only helpers for the pr-review-check-loop skill (Claude Code port).

Subcommands:
- ack: wait for Codex bot `eyes` reaction on an issue comment
- watch: monitor Codex review activity after a trigger

For initial PR auto-review cycles, `watch` may be started directly with:
- `trigger_ts=<PR created timestamp>`
- `trigger_comment_id=0`
- `trigger_ack_state=pr-body-auto-review`

In that mode:
- PR body `eyes` means auto-review was accepted
- PR body `+1` means Codex found no major issues

This script never writes comments, resolves threads, or mutates GitHub state.
Those orchestration actions remain the main agent's responsibility.

Claude Code port notes (differs from the codex original):
- Every `gh` invocation strips `GITHUB_TOKEN` from the child environment, so an
  invalid/expired `GITHUB_TOKEN` in the shell cannot shadow the keyring token.
  (This is the single most common failure mode in this environment.)
- `append_stat` never raises: a stats-write failure must not kill a watch,
  because a dead watch reads as a premature "done".
- Default stats path lives under ~/.cache/pr-review-check-loop (not ~/.codex).

Responsiveness redesign (2026-07):
- `parse_iso` accepts BOTH `...Z` and numeric-offset (`...+09:00`) timestamps.
  The old strptime('%Y-%m-%dT%H:%M:%SZ') raised on the offset form, and because
  that exception bubbled up to the per-poll handler, a single offset-form
  timestamp silently killed the watch for its entire remaining budget (every
  later poll re-hit the same comment and re-raised). Measured 7 real occurrences.
- `watch` uses an adaptive cadence instead of a fixed climbing backoff. The old
  schedule ramped to a 780s (13-min) plateau, so once past the early polls a
  Codex reply or a just-gone-green CI took up to 13 min to notice. Measured:
  Codex responses land mostly within ~6 min (median), yet 18% of polls sat in
  the 780s plateau. New model: a flat-then-gently-capped COLD schedule (default
  ceiling 120s) for the "waiting for the first reply" window, plus a fast HOT
  interval (default 20s) whenever a verdict is imminent — Codex already said
  "no issues" and we are only waiting on CI, or CI is still PENDING after a
  reply. Background polling costs no agent tokens; only cheap gh calls.
- `ack` polls on a fast front-loaded schedule (first check ~8s) because the
  Codex `eyes` reaction is near-instant; the old flat 60s first-check wasted a
  full minute per cycle before even looking.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CODEX_LOGIN = "chatgpt-codex-connector"
RECENT_REVIEW_WINDOW = 50
DEFAULT_STATS_PATH = (
    Path.home() / ".cache" / "pr-review-check-loop" / "poll_stats.jsonl"
)
NO_ISSUES_PATTERNS = (
    "didn't find any major issues",
    "did not find any major issues",
    "no major issues",
    "found no issues",
    "no issues found",
)

# --- Cadence defaults (see the "Responsiveness redesign" note above) ---------
# COLD: used while waiting for Codex's first reply. Flat 30s over the window
# where replies actually land (median ~6 min), then a gentle climb capped at
# 120s so a long stall still gets noticed within ~2 min (was 780s).
DEFAULT_WATCH_SCHEDULE = "30,30,30,30,30,45,45,60,60,90,90,120"
# HOT: used when a terminal verdict is imminent (no-issues seen, only CI
# pending; or CI still PENDING after a reply). Detection latency ~= this value.
DEFAULT_HOT_INTERVAL = 20
# ACK: front-loaded — the Codex `eyes` reaction is near-instant.
DEFAULT_ACK_SCHEDULE = "8,12,20,30,45,60"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(ts: str) -> datetime:
    """Parse a GitHub ISO-8601 timestamp into an aware UTC datetime.

    Robust to both the usual `...Z` form and the numeric-offset form
    (`...+09:00`) that some responses have been observed to return. Python 3.9's
    `datetime.fromisoformat` accepts the offset form but NOT a trailing `Z`, so
    normalize `Z` -> `+00:00` first. A crash here used to silently kill the whole
    watch (the exception propagated to the per-poll handler, which just kept
    re-hitting the same offending timestamp), so keep this total and forgiving.
    """
    raw = ts.strip()
    normalized = (raw[:-1] + "+00:00") if raw.endswith(("Z", "z")) else raw
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        for fmt in (
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S.%fZ",
        ):
            try:
                dt = datetime.strptime(raw, fmt)
                break
            except ValueError:
                continue
        else:
            raise
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def is_after(candidate: str, baseline: str) -> bool:
    return parse_iso(candidate) > parse_iso(baseline)


def is_codex_actor(login: str | None) -> bool:
    return isinstance(login, str) and login.startswith(CODEX_LOGIN)


def _gh_env() -> dict[str, str]:
    """Environment for `gh` calls with the poisoning GITHUB_TOKEN removed.

    In this environment GITHUB_TOKEN is set to an invalid value that would
    otherwise shadow the valid keyring credential and make every gh call fail.
    """
    env = os.environ.copy()
    env.pop("GITHUB_TOKEN", None)
    env.pop("GH_TOKEN", None)
    return env


def gh_json(args: list[str]) -> Any:
    proc = subprocess.run(
        ["gh", *args], capture_output=True, text=True, env=_gh_env()
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "gh command failed")
    return json.loads(proc.stdout)


def append_stat(path: Path, record: dict[str, Any]) -> None:
    """Best-effort stats append. Never raises — a stats failure must not
    terminate a watch (a dead watch would be read as a premature 'done')."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


def classify_ci(status_rollup: list[dict[str, Any]] | None) -> str:
    if not status_rollup:
        return "NONE"

    states: list[str] = []
    for item in status_rollup:
        if not item:
            continue
        item_type = item.get("__typename")
        if item_type == "CheckRun":
            status = item.get("status") or ""
            conclusion = item.get("conclusion") or ""
            if status and status != "COMPLETED":
                states.append("PENDING")
            elif conclusion in ("SUCCESS", "NEUTRAL", "SKIPPED"):
                states.append("SUCCESS")
            elif conclusion in (
                "FAILURE",
                "STARTUP_FAILURE",
                "TIMED_OUT",
                "CANCELLED",
                "ACTION_REQUIRED",
                "STALE",
            ):
                states.append("FAILURE")
            else:
                states.append("PENDING")
        elif item_type == "StatusContext":
            state = item.get("state") or ""
            if state == "SUCCESS":
                states.append("SUCCESS")
            elif state in ("ERROR", "FAILURE"):
                states.append("FAILURE")
            else:
                states.append("PENDING")

    if any(state == "FAILURE" for state in states):
        return "FAILURE"
    if states and all(state == "SUCCESS" for state in states):
        return "SUCCESS"
    return "PENDING"


def has_no_issues_text(text: str | None) -> bool:
    lowered = (text or "").lower()
    return any(pattern in lowered for pattern in NO_ISSUES_PATTERNS)


def fetch_codex_comment_reactions(owner: str, repo: str, comment_id: int) -> list[dict[str, Any]]:
    return gh_json(
        [
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            f"repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
            "--paginate",
        ]
    )


def fetch_issue_reactions(owner: str, repo: str, issue_number: int) -> list[dict[str, Any]]:
    return gh_json(
        [
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            f"repos/{owner}/{repo}/issues/{issue_number}/reactions",
            "--paginate",
        ]
    )


def advance_since(current_since: str, items: list[dict[str, Any]], *field_names: str) -> str:
    latest = current_since
    for item in items:
        for field_name in field_names:
            value = item.get(field_name)
            if isinstance(value, str) and is_after(value, latest):
                latest = value
    return latest


def fetch_issue_comments_since(owner: str, repo: str, pr_number: int, since: str) -> list[dict[str, Any]]:
    return gh_json(
        [
            "api",
            "-X",
            "GET",
            f"repos/{owner}/{repo}/issues/{pr_number}/comments",
            "-f",
            f"since={since}",
            "-f",
            "per_page=100",
            "--paginate",
        ]
    )


def fetch_review_comments_since(owner: str, repo: str, pr_number: int, since: str) -> list[dict[str, Any]]:
    return gh_json(
        [
            "api",
            "-X",
            "GET",
            f"repos/{owner}/{repo}/pulls/{pr_number}/comments",
            "-f",
            f"since={since}",
            "-f",
            "per_page=100",
            "--paginate",
        ]
    )


def fetch_recent_reviews(owner: str, repo: str, pr_number: int) -> list[dict[str, Any]]:
    result = gh_json(
        [
            "api",
            "graphql",
            "-f",
            "query=query($owner:String!, $repo:String!, $number:Int!, $count:Int!) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviews(last:$count) { nodes { databaseId submittedAt body author { login } } } } } }",
            # String vars MUST use -f (raw): -F coerces an all-digit value to a
            # JSON int, so an all-numeric owner or repo (both are legal on
            # GitHub — the users 0/1/12/123 all exist, and orgs follow the same
            # rule) is sent as `repo: 123`, which GitHub rejects with "Could not
            # coerce value 123 to String" against $owner/$repo:String!. That
            # RuntimeError bubbles up and the watch silently poll-errors for its
            # whole budget. Int vars ($number/$count) keep -F.
            "-f",
            f"owner={owner}",
            "-f",
            f"repo={repo}",
            "-F",
            f"number={pr_number}",
            "-F",
            f"count={RECENT_REVIEW_WINDOW}",
        ]
    )
    return result["data"]["repository"]["pullRequest"]["reviews"]["nodes"]


def fetch_unresolved_codex_threads(owner: str, repo: str, pr_number: int) -> int:
    unresolved = 0
    cursor: str | None = None

    while True:
        result = gh_json(
            [
                "api",
                "graphql",
                "-f",
                "query=query($owner:String!, $repo:String!, $number:Int!, $cursor:String) { repository(owner:$owner, name:$repo) { pullRequest(number:$number) { reviewThreads(first:100, after:$cursor) { pageInfo { hasNextPage endCursor } nodes { isResolved comments(first:1) { nodes { author { login } } } } } } } }",
                # String vars (owner/repo/cursor) MUST use -f: -F would coerce an
                # all-digit value to a JSON int, breaking an all-numeric owner or
                # repo (both legal on GitHub) against $owner/$repo:String!. See
                # fetch_recent_reviews.
                "-f",
                f"owner={owner}",
                "-f",
                f"repo={repo}",
                "-F",
                f"number={pr_number}",
                "-f",
                f"cursor={cursor}" if cursor else "cursor=",
            ]
        )
        review_threads = result["data"]["repository"]["pullRequest"]["reviewThreads"]
        for thread in review_threads["nodes"]:
            first_comment_nodes = thread.get("comments", {}).get("nodes", [])
            first_author = first_comment_nodes[0].get("author", {}).get("login") if first_comment_nodes else None
            if is_codex_actor(first_author) and not thread.get("isResolved"):
                unresolved += 1

        page_info = review_threads["pageInfo"]
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")

    return unresolved


def ack_mode(args: argparse.Namespace) -> int:
    schedule = positive_ints(args.schedule)
    if not schedule:
        raise SystemExit("ack schedule must contain at least one positive integer")

    elapsed = 0
    acknowledged_at: str | None = None
    max_attempts = len(schedule)

    for attempt_index, wait_seconds in enumerate(schedule, start=1):
        time.sleep(wait_seconds)
        elapsed += wait_seconds

        reactions = fetch_codex_comment_reactions(args.owner, args.repo, args.comment_id)
        exact_ack = any(
            reaction.get("content") == "eyes"
            and is_codex_actor(reaction.get("user", {}).get("login"))
            for reaction in reactions
        )
        fallback_ack = any(reaction.get("content") == "eyes" for reaction in reactions)
        acknowledged = exact_ack or (fallback_ack and not exact_ack)
        ack_state = "acknowledged" if acknowledged else "waiting-eyes"
        note = "exact-codex-eyes" if exact_ack else ("aggregate-eyes-fallback" if fallback_ack else "no-eyes-yet")

        if acknowledged:
            acknowledged_at = utc_now_iso()

        append_stat(
            Path(args.stats_path),
            {
                "recorded_at": utc_now_iso(),
                "repo": f"{args.owner}/{args.repo}",
                "pr_number": args.pr_number,
                "mode": "trigger-ack",
                "head_sha": None,
                "trigger_comment_id": args.comment_id,
                "trigger_ack_state": ack_state,
                "attempt_index": attempt_index,
                "wait_seconds": wait_seconds,
                "cumulative_wait_seconds": elapsed,
                "ci_state": None,
                "unresolved_codex_threads": None,
                "new_codex_reviews": 0,
                "new_codex_comments": 0,
                "codex_terminal_state": "waiting",
                "note": note,
            },
        )

        if acknowledged:
            print(
                json.dumps(
                    {
                        "result": "acknowledged",
                        "attempts": attempt_index,
                        "elapsed_seconds": elapsed,
                        "acknowledged_at": acknowledged_at,
                        "trigger_comment_id": args.comment_id,
                        "used_aggregate_fallback": bool(fallback_ack and not exact_ack),
                    },
                    ensure_ascii=False,
                )
            )
            return 0

    append_stat(
        Path(args.stats_path),
        {
            "recorded_at": utc_now_iso(),
            "repo": f"{args.owner}/{args.repo}",
            "pr_number": args.pr_number,
            "mode": "trigger-ack",
            "head_sha": None,
            "trigger_comment_id": args.comment_id,
            "trigger_ack_state": "request-failed",
            "attempt_index": max_attempts,
            "wait_seconds": schedule[-1],
            "cumulative_wait_seconds": elapsed,
            "ci_state": None,
            "unresolved_codex_threads": None,
            "new_codex_reviews": 0,
            "new_codex_comments": 0,
            "codex_terminal_state": "waiting",
            "note": "ack-timeout",
        },
    )
    print(
        json.dumps(
            {
                "result": "request-failed",
                "attempts": max_attempts,
                "elapsed_seconds": elapsed,
                "trigger_comment_id": args.comment_id,
            },
            ensure_ascii=False,
        )
    )
    return 0


def fetch_watch_state(
    owner: str,
    repo: str,
    pr_number: int,
    trigger_ts: str,
    scan_state: dict[str, Any],
) -> dict[str, Any]:
    pr = gh_json(["pr", "view", str(pr_number), "--repo", f"{owner}/{repo}", "--json", "headRefOid,statusCheckRollup"])
    issue_comments = fetch_issue_comments_since(owner, repo, pr_number, scan_state["last_issue_comment_since"])
    review_comments = fetch_review_comments_since(owner, repo, pr_number, scan_state["last_review_comment_since"])
    recent_reviews = fetch_recent_reviews(owner, repo, pr_number)

    scan_state["last_issue_comment_since"] = advance_since(
        scan_state["last_issue_comment_since"], issue_comments, "updated_at", "created_at"
    )
    scan_state["last_review_comment_since"] = advance_since(
        scan_state["last_review_comment_since"], review_comments, "updated_at", "created_at"
    )
    codex_issue_comments = []
    for comment in issue_comments:
        comment_id = comment.get("id")
        if (
            is_codex_actor(comment.get("user", {}).get("login"))
            and isinstance(comment_id, int)
            and is_after(comment["created_at"], trigger_ts)
            and comment_id not in scan_state["seen_issue_comment_ids"]
        ):
            scan_state["seen_issue_comment_ids"].add(comment_id)
            # Project to the fields the agent actually uses (mirrors codex_reviews /
            # codex_thread_comments below). Returning the raw comment leaked a ~1.2KB
            # user object + _links per item into the agent context on every verdict.
            codex_issue_comments.append(
                {
                    "id": comment_id,
                    "login": comment.get("user", {}).get("login"),
                    "created_at": comment["created_at"],
                    "body": comment.get("body", ""),
                }
            )

    codex_thread_comments = []
    for comment in review_comments:
        comment_id = comment.get("id")
        if (
            is_codex_actor(comment.get("user", {}).get("login"))
            and isinstance(comment_id, int)
            and is_after(comment["created_at"], trigger_ts)
            and comment_id not in scan_state["seen_review_comment_ids"]
        ):
            scan_state["seen_review_comment_ids"].add(comment_id)
            codex_thread_comments.append(
                {
                    "thread_id": None,
                    "id": comment_id,
                    "created_at": comment["created_at"],
                    "body": comment.get("body", ""),
                    "path": comment.get("path"),
                }
            )

    codex_reviews = []
    for review in recent_reviews:
        review_id = review.get("databaseId")
        submitted_at = review.get("submittedAt")
        if (
            is_codex_actor(review.get("author", {}).get("login"))
            and isinstance(review_id, int)
            and isinstance(submitted_at, str)
            and is_after(submitted_at, trigger_ts)
            and review_id not in scan_state["seen_review_ids"]
        ):
            scan_state["seen_review_ids"].add(review_id)
            codex_reviews.append(
                {
                    "databaseId": review_id,
                    "submittedAt": submitted_at,
                    "body": review.get("body"),
                    "author": review.get("author"),
                }
            )

    codex_pr_no_issues_reactions = []
    if scan_state.get("trigger_ack_state") == "pr-body-auto-review":
        issue_reactions = fetch_issue_reactions(owner, repo, pr_number)
        for reaction in issue_reactions:
            reaction_id = reaction.get("id")
            created_at = reaction.get("created_at")
            if (
                reaction.get("content") == "+1"
                and is_codex_actor(reaction.get("user", {}).get("login"))
                and isinstance(reaction_id, int)
                and isinstance(created_at, str)
                and is_after(created_at, trigger_ts)
                and reaction_id not in scan_state["seen_issue_reaction_ids"]
            ):
                scan_state["seen_issue_reaction_ids"].add(reaction_id)
                codex_pr_no_issues_reactions.append(reaction)

    unresolved_codex_threads = fetch_unresolved_codex_threads(owner, repo, pr_number)

    has_new_activity = bool(codex_issue_comments or codex_reviews or codex_thread_comments)
    if has_new_activity or codex_pr_no_issues_reactions:
        scan_state["has_seen_actual_response"] = True
    if any(has_no_issues_text(comment.get("body")) for comment in codex_issue_comments) or any(
        has_no_issues_text(review.get("body")) for review in codex_reviews
    ) or bool(codex_pr_no_issues_reactions):
        scan_state["has_seen_no_issues"] = True

    if scan_state["has_seen_no_issues"]:
        terminal_state = "terminal-no-issues"
    elif has_new_activity:
        terminal_state = "new-issues"
    else:
        terminal_state = "waiting"

    return {
        "head_sha": pr["headRefOid"],
        "ci_state": classify_ci(pr.get("statusCheckRollup")),
        "unresolved_codex_threads": unresolved_codex_threads,
        "new_codex_reviews": len(codex_reviews),
        "new_codex_comments": len(codex_issue_comments) + len(codex_thread_comments),
        "new_codex_thread_comments": len(codex_thread_comments),
        "new_codex_reactions": len(codex_pr_no_issues_reactions),
        "codex_terminal_state": terminal_state,
        "has_actual_response": scan_state["has_seen_actual_response"],
        "has_seen_no_issues": scan_state["has_seen_no_issues"],
        "codex_issue_comments": codex_issue_comments,
        "codex_reviews": codex_reviews,
        "codex_thread_comments": codex_thread_comments,
        "codex_pr_no_issues_reactions": codex_pr_no_issues_reactions,
    }


def is_hot(scan_state: dict[str, Any], ci_state: str | None) -> bool:
    """Whether a terminal verdict is imminent, so we should poll on the fast
    HOT interval instead of the COLD backoff.

    Hot when Codex has already said "no issues" and the only thing left is CI
    finishing (CI FAILURE means nothing is imminent — the agent must push a fix
    first — so fall back to cold), or when Codex has responded and CI is still
    running (the green result is close). Thread resolution is NOT a completion
    gate (it is an agent action, not a Codex signal), so it is never waited on.
    """
    if scan_state.get("has_seen_no_issues") and ci_state in ("SUCCESS", "NONE", "PENDING"):
        return True
    if scan_state.get("has_seen_actual_response") and ci_state == "PENDING":
        return True
    return False


def positive_ints(spec: str) -> list[int]:
    """Parse a comma-separated schedule into strictly-positive ints.

    Non-positive entries are dropped: a `0` would make `time.sleep(0)` return
    instantly and the budget clamp treat `min(0, ...)` as `<= 0`, breaking the
    watch loop early and emitting a false `timeout`; a negative would make
    `time.sleep` raise. Callers must reject the empty result.
    """
    return [n for n in (int(part.strip()) for part in spec.split(",") if part.strip()) if n > 0]


def watch_mode(args: argparse.Namespace) -> int:
    cold_schedule = positive_ints(args.schedule)
    if not cold_schedule:
        raise SystemExit("schedule must contain at least one positive integer")
    hot_interval = max(1, int(args.hot_interval))

    elapsed = 0
    attempt_index = 0
    cold_index = 0
    last_ci_state: str | None = None
    stats_path = Path(args.stats_path)
    scan_state: dict[str, Any] = {
        "last_issue_comment_since": args.trigger_ts,
        "last_review_comment_since": args.trigger_ts,
        "seen_issue_comment_ids": set(),
        "seen_review_comment_ids": set(),
        "seen_review_ids": set(),
        "seen_issue_reaction_ids": set(),
        "has_seen_actual_response": False,
        "has_seen_no_issues": False,
        "trigger_ack_state": args.trigger_ack_state,
    }

    while elapsed < args.max_total_wait:
        hot = is_hot(scan_state, last_ci_state)
        if hot:
            wait_seconds = hot_interval
        else:
            wait_seconds = cold_schedule[min(cold_index, len(cold_schedule) - 1)]
            cold_index += 1
        # Never overshoot the total budget on the final sleep.
        wait_seconds = min(wait_seconds, args.max_total_wait - elapsed)
        if wait_seconds <= 0:
            break
        time.sleep(wait_seconds)
        elapsed += wait_seconds
        attempt_index += 1

        try:
            state = fetch_watch_state(args.owner, args.repo, args.pr_number, args.trigger_ts, scan_state)
        except Exception as exc:
            # A transient gh/network error must NOT end the watch. Record and keep polling.
            append_stat(
                stats_path,
                {
                    "recorded_at": utc_now_iso(),
                    "repo": f"{args.owner}/{args.repo}",
                    "pr_number": args.pr_number,
                    "mode": "live-watch",
                    "head_sha": None,
                    "trigger_comment_id": args.trigger_comment_id,
                    "trigger_ack_state": args.trigger_ack_state,
                    "attempt_index": attempt_index,
                    "wait_seconds": wait_seconds,
                    "cadence": "hot" if hot else "cold",
                    "cumulative_wait_seconds": elapsed,
                    "ci_state": None,
                    "unresolved_codex_threads": None,
                    "new_codex_reviews": 0,
                    "new_codex_comments": 0,
                    "codex_terminal_state": "error",
                    "note": f"poll-error: {exc}"[:300],
                },
            )
            continue

        last_ci_state = state["ci_state"]

        note = "poll"
        result: str | None = None

        # 완료 = Codex의 명시적 무이슈 판정(+ CI success/none) + 실제 응답 존재.
        # thread resolved는 **에이전트의 행동**이지 Codex의 신호가 아니므로 완료조건에 넣지 않는다
        # (넣으면 에이전트가 스레드를 resolve하지 않는 한 무이슈 응답이 와도 watch가 영구 대기하는
        # 데드락이 된다 — 실측 50분 hang). unresolved_codex_threads는 진단 정보로만 verdict에 남긴다.
        if (
            state["codex_terminal_state"] == "terminal-no-issues"
            and state["ci_state"] in ("SUCCESS", "NONE")
            and state["has_actual_response"]
        ):
            note = "terminal-no-issues"
            result = "no_issues"
        elif state["codex_terminal_state"] == "new-issues":
            note = "new-codex-activity"
            result = "new_activity"
        elif elapsed >= args.max_total_wait:
            note = "timeout-check"
            result = "timeout"

        append_stat(
            stats_path,
            {
                "recorded_at": utc_now_iso(),
                "repo": f"{args.owner}/{args.repo}",
                "pr_number": args.pr_number,
                "mode": "live-watch",
                "head_sha": state["head_sha"],
                "trigger_comment_id": args.trigger_comment_id,
                "trigger_ack_state": args.trigger_ack_state,
                "attempt_index": attempt_index,
                "wait_seconds": wait_seconds,
                "cadence": "hot" if hot else "cold",
                "cumulative_wait_seconds": elapsed,
                "ci_state": state["ci_state"],
                "unresolved_codex_threads": state["unresolved_codex_threads"],
                "new_codex_reviews": state["new_codex_reviews"],
                "new_codex_comments": state["new_codex_comments"],
                "new_codex_thread_comments": state["new_codex_thread_comments"],
                "new_codex_reactions": state["new_codex_reactions"],
                "codex_terminal_state": state["codex_terminal_state"],
                "note": note,
            },
        )

        if result is not None:
            print(
                json.dumps(
                    {
                        "result": result,
                        "trigger_ts": args.trigger_ts,
                        "trigger_comment_id": args.trigger_comment_id,
                        "cumulative_wait_seconds": elapsed,
                        "state": state,
                    },
                    ensure_ascii=False,
                )
            )
            return 0

    print(
        json.dumps(
            {
                "result": "timeout",
                "trigger_ts": args.trigger_ts,
                "trigger_comment_id": args.trigger_comment_id,
                "cumulative_wait_seconds": elapsed,
            },
            ensure_ascii=False,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read-only helpers for pr-review-check-loop")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ack = subparsers.add_parser("ack", help="wait for Codex bot eyes reaction on a trigger comment")
    ack.add_argument("--owner", required=True)
    ack.add_argument("--repo", required=True)
    ack.add_argument("--pr-number", required=True, type=int)
    ack.add_argument("--comment-id", required=True, type=int)
    ack.add_argument(
        "--schedule",
        default=DEFAULT_ACK_SCHEDULE,
        help="comma-separated per-attempt wait seconds; front-loaded so the "
        "near-instant Codex `eyes` reaction is caught fast (default first check ~8s)",
    )
    ack.add_argument("--stats-path", default=str(DEFAULT_STATS_PATH))
    ack.set_defaults(func=ack_mode)

    watch = subparsers.add_parser("watch", help="watch for Codex review activity after trigger acknowledgement")
    watch.add_argument("--owner", required=True)
    watch.add_argument("--repo", required=True)
    watch.add_argument("--pr-number", required=True, type=int)
    watch.add_argument("--trigger-ts", required=True)
    watch.add_argument(
        "--trigger-comment-id",
        required=True,
        type=int,
        help="Issue comment ID for manual trigger, or 0 for initial PR auto-review mode",
    )
    watch.add_argument("--trigger-ack-state", default="acknowledged")
    watch.add_argument("--max-total-wait", type=int, default=7200)
    watch.add_argument(
        "--schedule",
        default=DEFAULT_WATCH_SCHEDULE,
        help="comma-separated COLD per-poll wait seconds (waiting for Codex's "
        "first reply); flat early then gently capped (default ceiling 120s)",
    )
    watch.add_argument(
        "--hot-interval",
        type=int,
        default=DEFAULT_HOT_INTERVAL,
        help="fast poll interval (seconds) when a terminal verdict is imminent "
        "(no-issues seen, only CI pending; or CI still running)",
    )
    watch.add_argument("--stats-path", default=str(DEFAULT_STATS_PATH))
    watch.set_defaults(func=watch_mode)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
