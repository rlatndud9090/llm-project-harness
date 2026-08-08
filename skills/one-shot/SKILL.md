---
name: one-shot
description: "확정된 작은 작업 단위를 kickoff부터 PR 리뷰 수렴까지 사용자 개입 없이 무인으로 한 번에 진행할 때 사용한다(호출 자체가 포괄 사전위임이 되어 승인 게이트를 transport=one-shot으로 자동 부여·기록). '알아서 PR까지 해줘', '무지성으로 진행', 'one-shot' 같은 전 과정 위임에 쓴다. 열린 아이디어면 먼저 next-feature."
---

# One-Shot 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다. 절차의 정본은
`${CLAUDE_PLUGIN_ROOT}/harness/protocols/one-shot.md`이며, 이 어댑터는 그 위의 표면 배선만 남긴다.

## 필수 로딩

1. `${CLAUDE_PLUGIN_ROOT}/harness/protocols/one-shot.md` — 무인 오케스트레이션 규율의 정본.
2. 각 단계 절차는 해당 스킬이 로드한다: `$kickoff`, `$prd-helper`, `$adr-helper`,
   `$feature-develop`, `$make-pr`. one-shot은 이들을 순차 호출하는 오케스트레이터다.
3. 현재 raw unit의 `state.md`(가장 먼저) → 단계·승인 상태.

## 흐름 (상세는 프로토콜)

1. **진입·분류**: 입력이 확정된 작업 단위인지 확인한다(열린 아이디어면 `$next-feature`로
   돌린다). 사용자의 **포괄 위임 발화**를 캡처하고, 유형(feature/bugfix/chore)을 판정한다.
   "이 작업을 PR 리뷰 수렴까지 무인 진행합니다"를 한 줄로 통보하고 시작한다.
2. **kickoff**: `$kickoff`로 브랜치·raw 골격을 만든다. 브랜치를 자동 전환할 수 없는 상황
   (워크트리 vs checkout)이면 정지해 사용자에게 묻는다.
3. **PRD/ADR (feature)**: `$prd-helper`로 PRD를 `review`까지, 필요하면 `$adr-helper`로 ADR을
   작성하고 **사전 승인을 자동 부여**한다. 사용자에게 묻는 대신 포괄 위임 quote로 전환한다:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/approve.mjs" --unit docs/raw/feature/<slug> --quote "<사용자의 포괄 위임 발화 verbatim>" --transport one-shot [--adr]
   ```

4. **구현**: `$feature-develop`로 진행한다(자율 fan-out 구간 그대로). 요구·결정을 뒤집는
   개정이 필요하면 정지해 확인받는다.
5. **make-pr**: `$make-pr`로 **최종 확정을 자동 부여**하고 커밋·PR을 만든다:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/approve.mjs" --unit docs/raw/feature/<slug> --quote "<사용자의 포괄 위임 발화 verbatim>" --transport one-shot --final [--adr]
   ```

6. **PR 리뷰 수렴 (스킬 있으면)**: PR 리뷰를 검증·반영·수렴하는 스킬이 설치돼 있으면 그걸로
   clean까지 밀어붙인다(이름을 하드코딩하지 않고 역할로 가리킨다 — 선택적 외부 가속기).
   없으면 이 단계를 건너뛰고 PR만 생성한 채 보고한다.
7. **종착**: 리뷰 clean·게이트 green이면 **정지·보고**한다. 머지·정리는 되돌리기 어려운
   외부 작업이라 무인 범위 밖이다 — 담당 스킬이 있으면 "다음 단계로 쓰라"고 **안내만** 하고
   사용자 확인을 받는다.

에이전트가 직접 frontmatter status를 고치지 않는다(런타임 훅과 `harness:check`가 막는다).
어느 단계든 게이트 red·구현 막힘·제품 판단이 필요하면 무인 진행을 멈추고 보고한다(정본
"정지 조건"). 규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트
문서는 한국어로 작성한다.

## Claude Code — 질문 도구 (정지 시)

무인 진행이 정지 조건에 걸려 사용자 판단이 필요할 때만 `AskUserQuestion`으로 묻는다(무인
구간에서는 묻지 않는다 — 승인은 포괄 위임으로 자동 부여된다).

## Claude Code — agents 화면 세션 제목 (필수)

이 스킬을 실행하면 **즉시** 현재 세션의 agents 화면(FleetView) 제목을 작업내역 요약
`one-shot`으로 바꾼다(대화형·background 세션 모두 항상). 어느 세션이 무인 파이프라인을
돌리는지 목록에서 한눈에 보이게 하기 위함이다. 제목엔 프로젝트 약어 prefix를 붙이지 않는다
(작업 단계 요약만 남긴다). agents 세션이 아니면 조용히 no-op이고 절대 실패하지 않으므로 항상
호출한다. 이후 각 하위 단계 스킬이 자기 라벨로 제목을 갱신하면 그대로 둔다(진행 단계가 제목에
드러난다).

```bash
# provider 레포/미부착 소비 프로젝트엔 .harness가 없을 수 있으므로 파일 존재를 먼저 본다.
[ -f "${CLAUDE_PLUGIN_ROOT}/scripts/harness/set-fleet-title.mjs" ] \
  && node "${CLAUDE_PLUGIN_ROOT}/scripts/harness/set-fleet-title.mjs" --label "one-shot" 2>/dev/null || true
```

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[one-shot]`를 붙인다.**

- 형식: `result: [one-shot] {현재 단계·한 줄 요약} {PR URL이 있으면 함께}`
- 예: `result: [one-shot] feature/foo 구현·PR 생성·리뷰 clean까지 완료 — https://github.com/<org>/<repo>/pull/123`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하고, PR URL이 링크로 노출된다.
