# 소비자 정합 원장 (reconcile ledger) — lph-doctor 소스

이 파일은 **각 버전 범프가 소비 프로젝트에 요구하는 정합 조치**를 버전순(newest-first)으로
적는 기계-판독 원장이다. `$lph-doctor`(엔진 `scripts/harness/doctor.mjs`)가 소비 프로젝트의
마지막 정합 버전(`.harness.json`의 `version`)과 설치된 플러그인 버전을 비교해, **그 사이에 낀
버전의 조치만** 골라 제시한다. CHANGELOG가 전체 서사라면, 이 원장은 그중 **소비자가 실제로
행동해야 하는 부분집합**만 버전 키로 추린 것이다.

## 형식 계약 (도구가 파싱한다 — 어기지 말 것)

- 버전마다 `## <major>.<minor>.<patch>` 헤딩 하나. 순수 dotted-numeric만(프리릴리스 태그 금지).
- 헤딩 아래에 조치 불릿. 각 불릿은 아래 태그 중 하나로 시작한다:
  - `- (배선)` — 소비 레포에 커밋된 배선(git훅 baked 경로·CI 워크플로·`.harness.json`·
    `.claude/settings.json`) 형태 변화. 조치 = **`/lph-init` 재실행**(먼저 `--dry-run`). 멱등이며
    `.harness.json` version이 올라가 drift가 해소된다.
  - `- (산출물)` — 각 프로젝트가 자기 산출물(위키·PRD/ADR frontmatter·docs)에 손으로 반영할 것.
    `/lph-init`이 대신 해 줄 수 없다(프로젝트 판단 필요). doctor가 그 요지를 제시하면 사람이 반영한다.
  - `- (없음)` — 이 버전은 소비자 조치가 없다(마켓플레이스 갱신으로 자동 반영). 원장의 완결성을
    위해 남긴다.

## 작성 규칙 (provider — 매 버전 범프마다)

- **버전을 올리는 커밋은 이 파일 맨 위에 현재 플러그인 버전(`.claude-plugin/plugin.json`)과
  같은 `## <version>` 항목을 추가한다.** 조치가 없어도 `- (없음)`으로 명시한다. provider 모드
  `harness:check`(`assertReconcileLedgerCurrent`)가 현재 버전 항목의 존재를 기계강제한다.
- CHANGELOG의 "소비자 조치"와 정합을 유지한다(같은 사실을 두 곳에서 다르게 적지 않는다):
  CHANGELOG는 서사, 이 원장은 버전-키 액션 목록이다.

---

## 2.4.0

- (배선) **CI 워크플로를 PR-only로 개편(서버 push 게이트 제거·concurrency 취소·setup-node
  cache·docs-only 분기).** GitHub Actions 분(minute) 절감이 목적이다. 신규 `/lph-init`은 최신
  워크플로를 심지만, 이미 플러그인 CI를 가진 소비 레포의 `.github/workflows/harness.yml`은
  자동으로 안 바뀐다(손수 넣은 job/matrix 보존). `/lph-init --refresh-workflow`로 최신 PR-only
  워크플로로 교체한다(먼저 `--dry-run`; 기존은 `.bak` 백업). 교체하면 (1) main 직접 push마다 돌던
  서버 게이트가 사라져 squash-merge 재실행 낭비가 없어지고, (2) 연속 커밋의 무효화된 중간 게이트가
  취소되며, (3) 문서 전용 PR은 `harness:check`만 돌아 lint/build/test를 건너뛴다. 교체 안 해도
  게이트는 통과하나 init이 구버전 CI를 감지해 refresh를 넛지한다. main 직접 push의 승인·정합
  검사는 로컬 pre-commit(`harness:check`)이 계속 막는다(서버 push 게이트를 대신).
- (없음) 엔진 `action.yml`의 docs-only 분기는 마켓플레이스 갱신만으로 자동 반영된다 —
  refresh 전이라도 소비 레포의 PR 게이트는 문서 전용 PR을 `harness:check`만으로 처리한다(코드 PR·
  main push는 종전대로 full). 즉 refresh는 서버 push 게이트 제거·concurrency 취소를 위한 것이다.

## 2.3.2

- (없음) adr-helper 디자인 결정 레인이 비교 HTML을 만들 때 템플릿을 `cp` 복사 후 목업 구역만
  `Edit`하도록 바꿔(스캐폴딩 재출력 제거) 출력 토큰을 줄였다. 프로토콜/역할/템플릿 주석 문구 변경과
  `agents/designer.md` 어댑터 drift 정리뿐 — 마켓플레이스 갱신으로 자동 반영, 배선/산출물 조치 없음.

## 2.3.1

- (없음) 사용자에게 로컬 파일 경로·화면 스크린샷을 제시할 때 raw 경로 대신 마크다운 링크
  (`[한국어 설명](절대경로)`)+절대경로로 주도록 하는 규약(session-start 단일 출처 + adr-helper·
  designer·ui-verification 발동 지점). 마켓플레이스 갱신으로 자동 반영 — 배선/산출물 조치 없음.

## 2.3.0

- (배선) 스킬 `harness-init` → `lph-init` 리네이밍. 슬래시 진입점이 `/lph-init`으로 바뀌었다
  (엔진은 그대로 `scripts/harness/init.mjs`). git훅 baked 경로·CI·`.harness.json` 형태는 안
  바뀌지만, `/lph-init`을 한 번 재실행해 `.harness.json` version을 2.3.0으로 올리고 새 진입점을
  반영한다(먼저 `--dry-run`). 재실행 안 해도 게이트는 통과하나 doctor drift 넛지가 계속 뜬다.
- (없음) 새 스킬 `/lph-doctor` 추가·kickoff 워크트리 리네이밍 생략·adr-helper 디자인 비교
  HTML·prd/adr deep-interview 진입 판단 강화·wiki 큰 방향성 갱신·code-review-guideline은 전부 마켓플레이스
  갱신으로 자동 반영(소비 산출물 조치 없음).

## 2.2.0

- (배선) init 이관 견고화. 이미 이관한 소비 레포는 `/lph-init`(당시 `/harness-init`)을 다시
  실행해 CI node 하드코딩 제거(`.nvmrc`/`lts/*`)·lockfile 정합·훅 경로 재-bake를 반영한다.

## 2.1.1

- (배선) 이관 완결성 픽스. 2.1.1 이전에 이관한 소비 레포는 `/lph-init`을 다시 실행해 옛 CI
  워크플로 교체·죽은 `harness:*` npm 스크립트 정리 잔재를 정돈한다.

## 2.0.0

- (배선) **Claude Code 플러그인 전환.** devDependency/submodule 설치를 플러그인으로 이관한다:
  마켓플레이스 등록(`/plugin marketplace add rlatndud9090/llm-project-harness`) 후 소비 레포에서
  `/lph-init` 실행. init이 옛 `.harness` 심볼릭 링크·devDependency·`.harness-sync`·옛 어댑터
  심링크·옛 CI 워크플로를 자동 감지·정리하고 `.harness.json`·settings·CI·docs 배선을 심는다.
- (산출물) 위키에 '작성 규칙' 본문이 복사돼 있던 옛 프로젝트는 위키에서 그 규칙 문구를
  삭제한다(방향성·계보 링크는 유지). `harness:check`의 authoring-guidance leak 게이트가 강제한다.
