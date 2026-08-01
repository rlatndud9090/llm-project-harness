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
5. **푸시·PR**: 작업 브랜치를 원격에 push하고 PR을 생성한다. PR 생성은 `gh` CLI를 우선 쓰고(미가용
   시 런타임의 GitHub 통합으로 폴백). PR 본문에 raw unit(PRD/ADR)을 링크하고,
   저장소에 PR 템플릿이 있으면 그 구조를 따른다. 원격이 없으면 PR 단계는 건너뛰고 그 사실을 보고한다.
6. **보고**: 생성된 PR URL을 보고한다.

전제가 아직 아니면(사전 승인 전, 구현 미완) `$prd-helper`/`$adr-helper`/`$feature-develop`로
되돌린다. 규칙 변경은 `.claude`가 아니라 `.harness/harness`를 먼저 수정한다. 프로젝트 문서는 한국어로 작성한다.
