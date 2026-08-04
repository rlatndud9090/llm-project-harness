---
name: make-pr
description: "사전 승인·구현이 끝난 작업 단위를 최종 확정(approved/accepted)하고 커밋·PR을 생성할 때 사용한다."
---

# Make PR 어댑터

각 도구는 독자 규칙을 만들지 않고 공용 하네스를 따른다. 절차의 정본은
`.harness/harness/protocols/make-pr.md`이며, 이 어댑터는 그 위의 표면 배선만 남긴다.

## 필수 로딩

1. `.harness/harness/protocols/make-pr.md` — 최종 확정·커밋·PR 절차의 정본.
2. `.harness/harness/protocols/commit-protocol.md` — 이 컨텍스트에 아직 로드돼 있지 않을 때만
   (이미 읽었으면 재판독하지 않는다).
3. 현재 raw unit의 `state.md`(가장 먼저) — 승인 상태의 원장. PRD/ADR **전문**은 이 컨텍스트에서
   이미 읽었고 이후 개정이 없으면 재판독하지 않는다.

## 흐름 (상세는 프로토콜)

1. **상태 확인**: 브랜치·raw unit·`state.md`. feature 단위면 PRD `pre-approved`,
   (ADR 있으면) `pre-accepted`여야 한다.
2. **최종 확정**: **`$make-pr` 호출 자체가 사용자의 명시적 최종 승인이다** — 승인을 다시 묻지
   않는다. 사전 승인 이후 개정이 있으면 바뀐 점을 통보하고(사전 승인을 뒤집는 수준의 개정만
   확정 전 정지·확인), 호출 발화를 verbatim 인용해 오직 아래 명령으로만 전환한다(직접 status
   편집 금지 — 런타임 훅과 `harness:check`가 막는다. bugfix/chore는 승인 축이 없어 스킵).

   ```sh
   npm run harness:approve -- --unit docs/raw/feature/<slug> --quote "<사용자의 make-pr 호출 발화 verbatim>" --transport make-pr --final [--adr]
   ```

3. **게이트**: `npm run harness:ingest -- docs/raw/<type>/<slug>` → `npm run harness:gate`.
   실패하면 커밋하지 않고 원인을 고쳐 처음부터 다시 실행한다.
4. **커밋**: `commit-protocol`로 확정 커밋을 만든다(`관련 문서:` 블록·명시적 stage·HEREDOC) —
   `approved`/`accepted`로 올라간 PRD/ADR과 구현을 함께 담는다.
5. **푸시·PR·보고**: 작업 브랜치를 push하고 PR을 생성한다 — `gh` CLI 우선, 미가용 시 런타임의
   GitHub 통합으로 폴백. 본문에 raw unit(PRD/ADR)을 링크하고 PR 템플릿이 있으면 그 구조를
   따른다. 원격이 없으면 PR 단계는 건너뛰고 그 사실을 보고한다. 생성된 PR URL을 보고한다.

전제가 아직 아니면(사전 승인 전, 구현 미완) `$prd-helper`/`$adr-helper`/`$feature-develop`로
되돌린다. 규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는 한국어로 작성한다.

## Claude Code — agents 화면 세션 제목: 덮어쓰지 않는다 (필수)

make-pr는 단계(phase) 스킬이다 — `kickoff`으로 착수한 작업 단위의 마지막 PR 단계일 뿐이므로
FleetView(agents 화면) 세션 제목을 **절대 덮어쓰지 않는다**: `set-fleet-title.mjs`를 호출하지
않는다(재도입 금지). 제목은 세션-시작 스킬(`next-feature`·`kickoff`·`one-shot`)이 심은 작업명을
그대로 유지해야 목록에서 어느 작업의 PR인지 식별되고, 지금 어느 단계인지는 아래 result 라인의
`[pr]` prefix로만 드러낸다(`feature-develop`·`prd-helper`·`adr-helper`·`commit-protocol`과
동일한 단계-스킬 규약).

## Claude Code — PR 생성과 링크 노출 (필수)

- PR 생성은 `gh pr create --base <기본 브랜치> --head <작업 브랜치> --title "<제목>" --body "<본문>"`
  우선(토큰 효율), `gh` 미설치·미인증이면 GitHub MCP(`mcp__github__create_pull_request`, 필요 시
  `create_branch`/`update_pull_request`)로 폴백한다.
- 생성된 **PR URL을 그대로 출력한다** — FleetView는 세션 출력에서 링크를 스캔해 표면화하므로,
  아래 result 라인에 PR URL을 포함시키면 agents 화면에서 PR로 바로 갈 수 있다.

## Claude Code — Background 세션 result 형식 (필수)

background 세션에서 `result:` 라인을 출력할 때 — 중간 보고든 완료든 — **맨 앞에 반드시 `[pr]`를 붙인다.**

- 형식: `result: [pr] {한 줄 요약} {PR URL}`
- 예: `result: [pr] data-contract 최종 확정·커밋·PR 생성 완료 — https://github.com/<org>/<repo>/pull/123`
