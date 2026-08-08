---
name: next-feature
description: "다음 작업 단위 후보를 추천하고 하나를 선택할 때 사용한다."
---

# Next Feature 어댑터

공용 기준은 `${CLAUDE_PLUGIN_ROOT}/harness/protocols/next-feature.md`다.

## 실행 순서

1. `${CLAUDE_PLUGIN_ROOT}/harness/protocols/next-feature.md`를 읽는다.
2. 목표/비목표/결정 경계를 확정한다(`$deep-interview`가 있으면 그 스킬을 우선 사용하고, 없으면 현재 런타임의 구조화 질문 도구를 우선 사용하며 그마저 없을 때만 명시 질문).
3. `${CLAUDE_PLUGIN_ROOT}/harness/roles/intake-helper.md`, `unit-planner.md`로 후보 3~5개를 만든다.
4. 1순위 추천과 이유를 제시하고 사용자가 하나를 선택하게 한다.

후보 필드·우선순위·`area`/`section` 판정 규칙은 프로토콜을 정본으로 따른다. 확정된 단위만
`docs/raw/.next-unit`에 `<type>/<slug> | <제목> | <영역> | <섹션>` 한 줄로 남겨 kickoff이
영역·섹션을 시드하게 한다(섹션은 선택 — 안 쓰면 4번째 필드를 비운다). 구현이나 PRD 작성은
하지 않고, 선택된 작업 단위는 `$kickoff`로 넘긴다.

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

이 스킬을 실행하면 **즉시** 현재 세션의 agents 화면(FleetView) 제목을 작업내역 요약
`next-feature`로 바꾼다(대화형·background 세션 모두 항상). 어떤 세션이 "다음 작업 단위 탐색"
중인지 목록에서 한눈에 보이게 하기 위함이다. 제목엔 프로젝트 약어 prefix를 붙이지 않는다
(agents 화면을 디렉터리별로 정렬하면 프로젝트가 드러나므로 작업 단계 요약만 남긴다).

제목 세팅은 공용 헬퍼가 담당한다. agents 세션이 아니면 조용히 no-op이고 절대 실패하지
않으므로 세션 종류를 신경 쓰지 말고 항상 호출한다.

```bash
# provider 레포/미부착 소비 프로젝트엔 .harness가 없을 수 있으므로 파일 존재를 먼저 본다.
[ -f "${CLAUDE_PLUGIN_ROOT}/scripts/harness/set-fleet-title.mjs" ] \
  && node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/set-fleet-title.mjs" --label "next-feature" 2>/dev/null || true
```

- 작업 단위를 확정해 `$kickoff`로 넘어가면 kickoff이 제목의 `next-feature`를 확정된
  작업명으로 교체한다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[next-feature]`를 붙인다.**

- 형식: `result: [next-feature] {한 줄 요약}`
- 예: `result: [next-feature] 후보 4개 추천 — feature/main-layout 1순위`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하기 위함이다.
