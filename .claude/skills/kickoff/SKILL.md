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
명시한다. 이 unit이 발전시키는 영역을 알면 `--area "<영역>"`로 시드하면
`prd.md`/`bugfix.md` frontmatter `area:`에 채워진다(여러 개는 콤마). `$next-feature`
앵커에 영역이 있으면 kickoff이 자동으로 시드한다.

무엇을 할지 아직 정하지 못했으면 먼저 `$next-feature`로 후보를 추천받는다.
raw 골격이 생기면 `$prd-helper`로 PRD 작성을 잇는다.

`$kickoff`는 각 단위에 단계 체크포인트 원장 `state.md`도 만든다(승인 게이트·세션
인수인계용). 새 세션은 이 파일을 가장 먼저 읽어 현재 단계와 승인 여부를 판단한다.

## Claude Code — agents 화면 세션 제목 (필수)

`npm run harness:kickoff`으로 브랜치·raw 골격을 만든 직후 **즉시** 현재 세션의 agents
화면(FleetView) 제목을 `<프로젝트 약어> <작업명>` 형식으로 바꾼다. next-feature 단계에서
붙였던 `<약어> next-feature` 제목의 `next-feature` 부분을, 확정된 작업 단위 이름으로
교체하는 것이다(약어 prefix는 그대로 유지). (대화형·background 세션 모두 항상 실행한다.)

- **프로젝트 약어**: next-feature와 같은 규칙. 현재 프로젝트 폴더명(git 루트 basename)을
  `-`/`_`/공백으로 나눈 각 토큰의 첫 글자를 대문자로 모아 `<...>`로 감싼다
  (`poke-battle-quiz` → `<PBQ>`). 아래 스니펫이 자동 계산한다.
- **작업명 = 브랜치 slug의 하이픈을 공백으로 바꾼 표현**. 예: `feature/do-next-thing` →
  `do next thing`, `bugfix/session-restore` → `session restore`. 즉 최종 제목은
  `<PBQ> do next thing`처럼 된다.
- slug은 kickoff 명령의 `--slug` 값 또는 현재 브랜치 `{type}/{slug}`의 `{slug}` 부분이다
  (kickoff 출력의 `- unit: {type}/{slug}` 줄에서도 확인할 수 있다).
- 방법: 아래 스크립트의 `slug=` 값만 실제 slug로 바꿔 실행한다. agents 화면 제목은
  `~/.claude/jobs/<job>/state.json`의 `name` 필드이며, `nameSource`를 `user`로 두어야
  Claude Code 자동 영문 이름이 덮어쓰지 않는다.

```bash
slug="do-next-thing"  # ← 실제 작업 단위 slug로 바꾼다 (브랜치 {type}/{slug}의 {slug})
proj="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")"
abbr="$(printf '%s' "$proj" | tr '_ ' '--' | awk -F'-' '{s="";for(i=1;i<=NF;i++)if($i!="")s=s toupper(substr($i,1,1));print s}')"
[ "${#abbr}" -lt 2 ] && abbr="$(printf '%s' "$proj" | tr '[:lower:]' '[:upper:]' | cut -c1-3)"
work="$(printf '%s' "$slug" | tr '-' ' ')"
python3 - "$CLAUDE_CODE_SESSION_ID" "<$abbr> $work" <<'PY'
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
