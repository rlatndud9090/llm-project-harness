---
name: artifact-validation
description: "PRD/ADR/notes, raw/wiki 링크, branch/raw 매핑, 도구별 어댑터 정합성을 검증할 때 사용한다."
---

# Artifact Validation 어댑터

공용 기준은 `.harness/harness/protocols/artifact-validation.md`다.

## 실행 순서

1. 검증 대상 raw unit을 확인한다.
2. `.harness/harness/protocols/artifact-validation.md`를 읽는다.
3. `npm run harness:check`를 실행한다.
4. 실패하면 출력의 파일/규칙을 기준으로 수정한다.
5. PRD/ADR/notes가 한국어로 작성되었는지 수동 확인한다.

자동 검증만으로 충분하다고 주장하지 않는다. placeholder ADR, 승인 근거 없는
approved PRD/accepted ADR, 검증 불가능한 수용 기준, 영어로 작성된 프로젝트 문서, 제품/도메인 PRD/ADR이 필요한
notes-only 작업, 제품 기능 변경과 섞인 하네스 submodule 업데이트나 adapter 정리이 있으면
보정한다.

`harness:check`는 feature 단위 `state.md` 원장의 정합성도 강제한다: approved/accepted에는
대응하는 승인 이벤트(사용자 발화 verbatim)가 있어야 하고, 원장의 승인 축이 PRD/ADR status와
일치해야 하며, `stage`는 승인 이후 이전 단계로 후퇴할 수 없다. 승인 전환은 오직
`npm run harness:approve`로만 한다.
