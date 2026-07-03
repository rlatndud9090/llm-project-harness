---
name: next-feature
description: "다음 작업 단위 후보를 추천하고 하나를 선택할 때 사용한다."
---

# Next Feature 어댑터

공용 기준은 `.harness/harness/protocols/next-feature.md`다.

## 실행 순서

1. `.harness/harness/protocols/next-feature.md`를 읽는다.
2. 목표/비목표/결정 경계를 확정한다(`$deep-interview`가 있으면 그 스킬을 우선 사용하고, 없으면 현재 런타임의 구조화 질문 도구를 우선 사용하며 그마저 없을 때만 명시 질문).
3. `.harness/harness/roles/intake-helper.md`, `unit-planner.md`로 후보 3~5개를 만든다.
4. 1순위 추천과 이유를 제시하고 사용자가 하나를 선택하게 한다.

후보는 branch name, raw path, scope, non-scope, 검증 방법, PRD/ADR 필요성을
포함한다. 구현이나 PRD 작성은 하지 않는다. 선택된 작업 단위는 `$kickoff`로 넘긴다.

## 질문 도구

- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 사용한다.
- 질문 transport는 deep-interview 내부에서 현재 surface에 맞게 선택한다.
- `$deep-interview`가 없을 때만 현재 런타임의 구조화 질문 도구로 직접 fallback한다.
- 구조화 질문 도구도 없을 때만 간결한 명시 질문으로 fallback한다.

## Claude Code 실행 (선택)

ClaudeCode에서는 자기 도구로 더 자연스럽게 진행한다(공용 절차는 동일).

- 결정 경계 질문은 `AskUserQuestion`으로 선택지를 제시한다.
- 후보 발굴/단위 쪼개기는 `intake-helper`, `unit-planner` 서브에이전트(Agent 도구)로 돌린다.
- `$deep-interview`가 설치돼 있으면 그 스킬을 먼저 쓰고, 없을 때만 `AskUserQuestion`을 기본 질문 도구로 쓴다.

## Claude Code — agents 화면 세션 제목 (필수)

이 스킬을 실행하면 **즉시** 현재 세션의 agents 화면(FleetView) 제목을
`<프로젝트 약어> next-feature` 형식으로 바꾼다. 어떤 프로젝트의 어떤 세션이 "다음 작업
단위 탐색" 중인지 목록에서 한눈에 보이게 하기 위함이다. (대화형·background 세션 모두 항상 실행한다.)

- **프로젝트 약어**: 현재 프로젝트 폴더명(git 루트 basename)을 `-`/`_`/공백으로 나눈 각
  토큰의 첫 글자를 대문자로 모아 `<...>`로 감싼다. 예: `poke-battle-quiz` → `<PBQ>`.
  약어가 1글자 이하로 나오면 폴더명 앞 3글자를 대문자로 쓴다(`frontend` → `<FRO>`). 아래
  스니펫이 자동 계산하며, 어색하면 사람이 읽기 좋은 2~4글자로 바꿔도 된다.
- agents 화면 제목은 `~/.claude/jobs/<job>/state.json`의 `name` 필드다. 아래 스크립트로
  현재 세션(`$CLAUDE_CODE_SESSION_ID`)에 해당하는 job의 `name`을 `<약어> next-feature`로
  설정하고 `nameSource`를 `user`로 지정한다(`user`여야 Claude Code 자동 영문 이름이 덮어쓰지 않는다).

```bash
proj="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")"
abbr="$(printf '%s' "$proj" | tr '_ ' '--' | awk -F'-' '{s="";for(i=1;i<=NF;i++)if($i!="")s=s toupper(substr($i,1,1));print s}')"
[ "${#abbr}" -lt 2 ] && abbr="$(printf '%s' "$proj" | tr '[:lower:]' '[:upper:]' | cut -c1-3)"
python3 - "$CLAUDE_CODE_SESSION_ID" "<$abbr> next-feature" <<'PY'
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

> 작업 단위를 확정해 `$kickoff`로 넘어가면, kickoff이 제목의 `next-feature` 부분을
> 확정된 작업명으로 교체한다(약어 prefix는 유지).

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[next-feature]`를 붙인다.**

- 형식: `result: [next-feature] {한 줄 요약}`
- 예: `result: [next-feature] 후보 4개 추천 — feature/main-layout 1순위`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
