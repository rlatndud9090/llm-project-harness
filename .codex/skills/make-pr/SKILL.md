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
