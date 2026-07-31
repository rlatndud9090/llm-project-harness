---
name: make-pr
description: "사전 승인·구현이 끝난 작업 단위를 최종 확정(approved/accepted)하고 커밋·PR을 생성할 때 사용한다."
---

# Make PR 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다. 절차의 정본은
`.harness/harness/protocols/make-pr.md`이며, 이 어댑터는 그 위의 표면 배선만 남긴다.

## 필수 로딩

1. `.harness/harness/protocols/make-pr.md` — 최종 확정·커밋·PR 절차의 정본.
2. `.harness/harness/protocols/commit-protocol.md` — 커밋 규약(이 스킬이 사용).
3. 현재 raw unit의 `state.md`(가장 먼저) → PRD/ADR status·approval 근거.

## 흐름 (상세는 프로토콜)

1. **상태 확인**: 브랜치·raw unit·`state.md`(stage/승인 이벤트)를 확인한다. feature 단위면 PRD가
   `pre-approved`, (ADR 있으면) `pre-accepted`여야 한다.
2. **최종 확정(approved/accepted)**: **`$make-pr` 호출 자체가 사용자의 명시적 최종 승인이다** —
   이미 make-pr를 부른 사용자에게 승인을 다시 묻지 않는다. 사전 승인 이후 개정이 있으면 최종
   PRD/ADR 요지와 바뀐 점을 **통보**하고(되묻는 게이트가 아니라 투명성 통보), make-pr를 호출한
   사용자 발화를 그대로 인용해 오직 아래 명령으로만 전환한다. 단, 개정이 사전 승인된 요구·결정을
   **뒤집는** 수준이면 확정 전 정지해 확인받는다.

   ```sh
   npm run harness:approve -- --unit docs/raw/feature/<slug> --quote "<사용자의 make-pr 호출 발화 verbatim>" --transport make-pr --final [--adr]
   ```

   에이전트가 직접 frontmatter status를 고치지 않는다(런타임 훅과 `harness:check`가 막는다).
   bugfix/chore는 PRD/ADR 승인 축이 없으므로 이 단계를 건너뛴다.
3. **게이트**: `npm run harness:ingest -- docs/raw/<type>/<slug>` 후 `npm run harness:gate`가
   통과해야 한다. 실패하면 커밋하지 않고 원인을 고쳐 처음부터 다시 실행한다.
4. **커밋**: `commit-protocol`로 확정 커밋을 만든다(`관련 문서:` 블록·명시적 stage·HEREDOC).
   이 커밋이 `approved`/`accepted`로 올라간 PRD/ADR과 구현을 함께 담는다.
5. **푸시·PR**: 작업 브랜치를 원격에 push하고 PR을 생성한다. PR 생성은 런타임의 GitHub 통합으로
   프로그래밍적으로 하며 `gh` CLI 가용성을 가정하지 않는다. PR 본문에 raw unit(PRD/ADR)을 링크하고,
   저장소에 PR 템플릿이 있으면 그 구조를 따른다. 원격이 없으면 PR 단계는 건너뛰고 그 사실을 보고한다.
6. **보고**: 생성된 PR URL을 보고한다.

전제가 아직 아니면(사전 승인 전, 구현 미완) `$prd-helper`/`$adr-helper`/`$feature-develop`로
되돌린다. 규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는 한국어로 작성한다.

## Claude Code — agents 화면 세션 제목 (필수)

이 스킬을 실행하면 **즉시** 현재 세션의 agents 화면(FleetView) 제목을 작업내역 요약
`make-pr`로 바꾼다(대화형·background 세션 모두 항상). 어느 세션이 PR 확정·생성 중인지 목록에서
한눈에 보이게 하기 위함이다. 제목엔 프로젝트 약어 prefix를 붙이지 않는다(작업 단계 요약만
남긴다). agents 세션이 아니면 조용히 no-op이고 절대 실패하지 않으므로 항상 호출한다.

```bash
# provider 레포/미부착 소비 프로젝트엔 .harness가 없을 수 있으므로 파일 존재를 먼저 본다.
[ -f .harness/scripts/harness/set-fleet-title.mjs ] \
  && node .harness/scripts/harness/set-fleet-title.mjs --label "make-pr" 2>/dev/null || true
```

## Claude Code — PR 생성과 링크 노출 (필수)

- **PR 생성은 GitHub MCP 도구를 우선 사용한다** — `mcp__github__create_pull_request`(및 필요 시
  `create_branch`/`update_pull_request`). `gh` CLI 가용성을 가정하지 않는다. base는 기본 브랜치,
  head는 현재 작업 브랜치이며, 본문에 raw unit(PRD/ADR) 경로를 링크한다. 저장소에 PR 템플릿이
  있으면 그 구조를 따른다.
- **PR 링크를 FleetView에 노출**하려면 생성된 **PR URL을 그대로 출력**한다. FleetView는 세션
  출력에서 링크를 스캔해 표면화하므로, 아래 result 라인에 PR URL을 포함시키면 agents 화면에서 PR로
  바로 갈 수 있다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[pr]`를 붙인다.**

- 형식: `result: [pr] {한 줄 요약} {PR URL}`
- 예: `result: [pr] data-contract 최종 확정·커밋·PR 생성 완료 — https://github.com/<org>/<repo>/pull/123`
- agents 화면(FleetView) result 열에서 어느 단계의 세션인지 한눈에 구분하고, PR URL이 링크로 노출된다.
