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
명시한다.

무엇을 할지 아직 정하지 못했으면 먼저 `$next-feature`로 후보를 추천받는다.
raw 골격이 생기면 `$prd-helper`로 PRD 작성을 잇는다.

## Claude Code — agents 화면 세션 제목 (필수)

`npm run harness:kickoff`으로 브랜치·raw 골격을 만든 직후 **즉시** 현재 세션의 agents
화면(FleetView) 제목을 **작업 단위 이름(branch slug)** 으로 바꾼다. next-feature 단계에서
붙였던 `next-feature` 제목을, 확정된 작업 단위 이름으로 교체하는 것이다.
(대화형·background 세션 모두 항상 실행한다.)

- **제목 = 브랜치명에서 type prefix를 뺀 slug**. 예: `feature/main-layout` → `main-layout`,
  `bugfix/session-restore` → `session-restore`, `chore/intake-helper` → `intake-helper`.
- slug은 kickoff 명령의 `--slug` 값 또는 현재 브랜치 `{type}/{slug}`의 `{slug}` 부분이다
  (kickoff 출력의 `- unit: {type}/{slug}` 줄에서도 확인할 수 있다).
- 방법: 아래 스크립트의 두 번째 인자(`"main-layout"`)만 실제 slug로 바꿔 실행한다.
  agents 화면 제목은 `~/.claude/jobs/<job>/state.json`의 `name` 필드이며, `nameSource`를
  `user`로 두어야 Claude Code 자동 영문 이름이 덮어쓰지 않는다.

```bash
python3 - "$CLAUDE_CODE_SESSION_ID" "main-layout" <<'PY'
import json, sys, glob, os
sid, title = sys.argv[1], sys.argv[2]
if not sid:
    sys.exit("CLAUDE_CODE_SESSION_ID 미설정 — 제목 설정 건너뜀")
target = None
for p in glob.glob(os.path.expanduser("~/.claude/jobs/*/state.json")):
    try:
        d = json.load(open(p))
    except Exception:
        continue
    if d.get("sessionId") == sid or d.get("resumeSessionId") == sid:
        target = (p, d)
        break
if not target:
    sys.exit(f"job state.json 없음(sessionId={sid}) — 제목 설정 건너뜀")
p, d = target
d["name"] = title
d["nameSource"] = "user"
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
print("agents 화면 제목 설정:", title)
PY
```

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[kickoff]`를 붙인다.**

- 형식: `result: [kickoff] {한 줄 요약}`
- 예: `result: [kickoff] feature/main-layout 브랜치·raw 골격 생성 완료`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
