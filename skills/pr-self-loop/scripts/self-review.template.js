// pr-self-loop 자체 리뷰 워크플로 템플릿 (Workflow/ultracode).
//
// 사용법: 이 파일을 세션 tmp로 복사 → 아래 CUSTOMIZE 3곳(BASE·REPO·LENSES)을 이번 diff에 맞게 바꾼 뒤
//   Workflow({scriptPath}) 로 라운드마다 재실행한다. HEAD 동적 참조라 SHA 갱신·재작성이 필요 없다.
// 산출: { round_clean, blockers, cosmetics }.
//   - round_clean = (이번 라운드 신규 BLOCKER 0). COSMETIC만 있으면 clean으로 친다(사용자 지시: 사소한 건 루프 안 늘림).
//   - 메인은 blockers를 그 라운드에 수정(버그는 test-first)하고, cosmetics는 누적만 하다가 수렴(연속 클린 2회) 후 배치 1회 정리.

export const meta = {
  name: 'pr-self-review',
  description: '자체 리뷰 1라운드 — 다중 렌즈 find + 적대 검증 + 심각도(BLOCKER/COSMETIC) 분류',
  phases: [
    { title: 'Find', detail: 'diff 표면별 렌즈로 결함 발굴' },
    { title: 'Verify', detail: '각 지적 독립 적대 검증(refute-first)' },
  ],
}

// ── CUSTOMIZE 1: 리뷰 대상 base·저장소 경로 ────────────────────────────────
const BASE = 'main' // PR base 또는 main. 리뷰 대상 = `git diff <BASE>...HEAD`.
const REPO = '.' // 저장소(또는 워크트리) 절대경로. 워크트리 격리 시 그 경로를 넣는다.
// ──────────────────────────────────────────────────────────────────────────

const SCOPE = `리뷰 대상은 이 브랜치의 ${BASE} 대비 diff 뿐이다(저장소: ${REPO}).
먼저 \`git -C ${REPO} diff ${BASE}...HEAD -- <담당 파일들>\`로 정확한 변경을 읽고, 필요하면 변경 파일 전문을 Read로 확인해라.
이 PR이 도입한 diff의 결함·누락·불일치만 보고한다(diff 밖 기존 코드 트집 금지). 스타일 nitpick 금지.

탐지 렌즈의 단일 출처는 \`\${CLAUDE_PLUGIN_ROOT}/harness/guides/code-review-guideline.md\`다
(두 소비 프로젝트의 자동 리뷰 391건에서 도출한 안티패턴 탐지기; 부록 A가 렌즈↔섹션을 잇는다).
아래 lens.focus에 담당 표면에 해당하는 §섹션 탐지 불릿이 발췌 주입돼 있으니, 그 "이런 diff를
보면 → 이 결함을 의심·확인하라" 신호로 diff를 훑어라. Codex 리뷰 수준의 recall/깊이가 목표다.

각 지적에 반드시 severity를 매긴다:
- **BLOCKER** = 라이브 운영·사용자·데이터에 실제 영향: correctness/logic 버그, 엣지 NaN/Infinity/크래시, 부동소수
  누출·0 뭉갬, contract/스키마 파손, regression, security, data integrity, user-visible 오작동(잘못된 수치·깨진
  레이아웃·빈 렌더·i18n 키 패리티 파손), 진짜 회귀를 가릴 위험 경로 테스트 공백.
- **COSMETIC** = 라이브 무해하나 나중에 챙길 것: stale/틀린 주석·JSDoc, 문서 정합, 내부 네이밍, 표현, 죽은-코드
  주석, 비기능 스타일. 사용자 눈·런타임에 안 드러나는 것 전부.
애매하면 BLOCKER로 올린다(recall 우선). 결함 없으면 findings=[].`

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['BLOCKER', 'COSMETIC'] },
          category: { type: 'string' },
          claim: { type: 'string', description: '한 문장 결함 주장' },
          evidence: { type: 'string', description: '구체적 입력/상태→잘못된 출력, 또는 미충족/불일치 근거' },
          suggested_fix: { type: 'string' },
        },
        required: ['file', 'line', 'severity', 'claim', 'evidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'] },
    // 배포 시 실제로 무엇이 잘못되나 — 심각도 교차 확인용. "없음/문서만"이면 COSMETIC 근거.
    live_impact: { type: 'string' },
    severity: { type: 'string', enum: ['BLOCKER', 'COSMETIC'] },
    reason: { type: 'string' },
  },
  required: ['verdict', 'severity', 'reason'],
}

// ── CUSTOMIZE 2: diff 표면에 맞춘 렌즈(3~5개). 안 건드린 영역엔 렌즈 금지 ────
// 렌즈 key는 code-review-guideline.md 부록 A와 정렬한다. 각 focus 끝에 담당 표면에 해당하는
// §섹션 탐지 불릿을 발췌 주입한다(전체 로드 금지 — 로딩 규칙은 가이드 상단). 매핑(부록 A):
//   correctness-core → §4,§5,§6 · contract-data → §3,§9,§2 · regression-consistency → §1,§2,§10
//   · ui-i18n → §7,§8 · tests → §10(게이트가 무엇을 검증 안 하는지)
const LENSES = [
  {
    key: 'correctness-core',
    files: 'FILL/core/logic/files.ts',
    focus: `정확성·엣지·fail-soft 렌즈(가이드 §4 상태기계·오류분류, §5 영속·동시성, §6 비동기·타이머).
산식·경계값·NaN/Infinity/0 나눗셈·부동소수 표기 누출·스펙 일치·예외 흡수·종결 상태 freeze·복원 왕복·경합(read-check-write).
[여기에 §4/§5/§6에서 이 diff 표면에 맞는 탐지 불릿을 발췌 주입]`,
  },
  {
    key: 'contract-data',
    files: 'FILL/contract/schema/api/*.ts',
    focus: `계약·경계·생성물 렌즈(가이드 §3 경계 입력·서버, §9 데이터 파이프라인, §2 단일출처).
공개 입력 bounded 검증·서버 재검증·소유자/CSRF·커서/이스케이프, 캐시 키 버전·파생 속성 순회 범위·단일출처 드리프트.
[여기에 §3/§9/§2에서 이 diff 표면에 맞는 탐지 불릿을 발췌 주입]`,
  },
  {
    key: 'regression-consistency',
    files: 'FILL/adjacent/docs/*.ts',
    focus: `드리프트·회귀·전환 렌즈(가이드 §1 스펙·문서·라이선스 동기화, §2 파생, §10 게이트·릴리스).
동작 변경↔문서/문구/라이선스 동기화·심볼 삭제 잔존 참조·게이트가 실불변식 검증·다른 모듈 무영향·잔재 없음.
[여기에 §1/§2/§10에서 이 diff 표면에 맞는 탐지 불릿을 발췌 주입]`,
  },
  {
    key: 'ui-i18n',
    files: 'FILL/ui/i18n/*.tsx',
    focus: `표시·접근·로케일 렌즈(가이드 §7 레이아웃·뷰포트, §8 접근성·포커스·로케일).
극단 뷰포트/기하 측정·visualViewport·포커스 이동·IME·전 로케일 전수 적용·CLS.
[여기에 §7/§8에서 이 diff 표면에 맞는 탐지 불릿을 발췌 주입]`,
  },
  {
    key: 'tests',
    files: 'src/**/*.test.*',
    focus: `테스트·게이트 렌즈(가이드 §10 "게이트가 무엇을 검증 안 하는지").
수용기준 커버·동어반복/skip/only 없음·위험경로 가드·대리지표만 보는 게이트·brittle invariant.`,
  },
]
// 순수 표시 PR이면 correctness-core+ui-i18n+tests만, 순수 백엔드면 contract-data+correctness-core+tests만 등,
// diff 표면에 맞게 3~5개만 남긴다(안 건드린 영역 렌즈 금지 — 토큰 효율).
// ──────────────────────────────────────────────────────────────────────────

phase('Find')
const perLens = await pipeline(
  LENSES,
  (lens) =>
    agent(`${SCOPE}\n\n담당 파일: ${lens.files}\n\n${lens.focus}`, {
      label: `find:${lens.key}`,
      phase: 'Find',
      schema: FINDINGS_SCHEMA,
      effort: 'high',
    }),
  (res, lens) => {
    const fs = (res && res.findings) || []
    if (!fs.length) return []
    return parallel(
      fs.map((f) => () =>
        agent(
          `아래 리뷰 지적을 적대적으로 반증(refute)하려 시도해라. 기본값 REFUTED — 실제 코드로 결함이 재현/성립함을
확인해야만 CONFIRMED, 여지 있으나 확신 못하면 PLAUSIBLE. 반드시 실제 파일(\`git -C ${REPO} show HEAD:<file>\` 또는 Read)로
대조해라. ${BASE}...HEAD diff 밖 기존 코드 트집이면 REFUTED. 사용자 확정 스펙에 대한 "스펙 반대"도 REFUTED(준수 여부만 본다).
또한 severity를 교차 확인해라: 이 결함이 배포되면 사용자/데이터/동작에 무엇이 잘못되는지 live_impact에 한 줄로 적고,
실제 영향이 있으면 BLOCKER, 라이브 무해(주석·문서·내부 네이밍뿐)면 COSMETIC.

지적:
- file: ${f.file}:${f.line}
- severity(제안): ${f.severity}
- category: ${f.category || lens.key}
- claim: ${f.claim}
- evidence: ${f.evidence}`,
          {
            label: `verify:${f.file.split('/').pop()}:${f.line}`,
            phase: 'Verify',
            schema: VERDICT_SCHEMA,
            effort: 'medium',
          }
        ).then((v) => ({
          ...f,
          lens: lens.key,
          verdict: (v && v.verdict) || 'PLAUSIBLE',
          severity: (v && v.severity) || f.severity, // verify가 교차 확인한 심각도 우선
          live_impact: (v && v.live_impact) || '',
          verdict_reason: (v && v.reason) || '',
        }))
      )
    )
  }
)

// flatten → 반증 탈락 제거 → file:line dedup
const flat = perLens.flat().filter(Boolean)
const survived = flat.filter((f) => f.verdict !== 'REFUTED')
const byKey = new Map()
for (const f of survived) {
  const k = `${f.file}:${f.line}:${(f.claim || '').slice(0, 40)}`
  // 같은 위치 중복이면 BLOCKER 우선 보존
  const prev = byKey.get(k)
  if (!prev || (f.severity === 'BLOCKER' && prev.severity !== 'BLOCKER')) byKey.set(k, f)
}
const confirmed = [...byKey.values()]
const blockers = confirmed.filter((f) => f.severity === 'BLOCKER')
const cosmetics = confirmed.filter((f) => f.severity !== 'BLOCKER')

// round_clean = 신규 BLOCKER 0 (COSMETIC만 있으면 clean — 사소한 걸로 루프를 늘리지 않는다).
log(
  `Find: raw ${flat.length} · 반증탈락 ${flat.length - survived.length} · BLOCKER ${blockers.length} · COSMETIC ${cosmetics.length}`
)
return { round_clean: blockers.length === 0, blockers, cosmetics }
