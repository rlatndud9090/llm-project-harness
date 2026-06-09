# Session Handoff

Last updated: 2026-06-09 Asia/Seoul

이 문서는 다른 Codex 세션이 이 프로젝트를 바로 이어받기 위한 압축
컨텍스트입니다.

## User Intent

형님은 포켓몬 기반 1일 1문제 퀴즈 사이트를 만들려고 합니다.

기본 감성:

- Wordle, Semantle, Pokemantle처럼 하루에 하나의 공통 정답
- 정답은 특정 포켓몬
- 사용자는 포켓몬 이름을 바로 찍기보다 배틀식 커맨드로 힌트를 얻음
- 진행 기록과 지난 챌린지는 MVP에서는 localStorage 기반이어도 충분

핵심 차별점:

- 스무고개식 질문을 포켓몬 배틀 커맨드로 바꾼다.
- 실제 배틀과 유사하게 특성, 타입 상성, 상태이상, 랭크 변화가 힌트로 드러난다.
- 예: Speed Boost는 행동 후 Speed +1, Stamina는 공격받으면 Defense +1,
  Defiant는 능력치가 하락하면 Attack +2, Guts는 화상 공격 감소를 무시한다.

## Project Location

```txt
/Users/nhn/prvprjt/poke-battle-quiz
```

상위 작업공간 지침:

- `/Users/nhn/prvprjt` 아래 개인 프로젝트만 다룬다.
- 한국어 존댓말로 답변하고 사용자를 형님으로 호칭한다.
- 탐색은 `rg` 우선.
- 변경은 최소 범위로 한다.

## LLM Wiki Harness

2026-06-09에 Karpathy-style LLM Wiki 패턴을 프로젝트에 도입했습니다.

새 세션은 먼저 다음 파일을 읽어야 합니다.

- `AGENTS.md`
- `docs/wiki/index.md`
- `docs/wiki/log.md`

운영 원칙:

- raw source는 `docs/raw/`에 append-only로 쌓습니다.
- LLM이 유지하는 컴파일된 지식은 `docs/wiki/` 아래에 둡니다.
- 루트 `AGENTS.md`는 wiki schema이자 색인 역할을 합니다.
- 제품/아키텍처/데이터/디버깅 결정이 생기면 raw note, 관련 wiki page,
  `docs/wiki/index.md`, `docs/wiki/log.md`를 필요 최소 범위로 갱신합니다.
- `.gitignore`는 `.omx` 런타임 파일을 계속 제외합니다. 위키와 raw
  레이어는 `docs/` 아래에 있으므로 OMX 런타임 상태와 분리되어
  추적 가능합니다.

## Current Technical State

Created with:

```sh
npm create vite@latest poke-battle-quiz -- --template react-ts
npm install
npm install -D vitest
```

Current stack:

- Vite 8
- React 19
- TypeScript 6
- ESLint 10
- Vitest 4

Useful scripts:

```sh
npm run dev
npm run lint
npm run build
npm run test:run
```

Verification already performed:

- `npm run lint` passed
- `npm run build` passed
- `npm run test:run` passed with no tests yet
- `curl -I http://127.0.0.1:5173/` returned `200 OK`

GitHub repository:

```txt
https://github.com/rlatndud9090/poke-battle-quiz
```

Current git state:

- Local repo initialized on `main`.
- `origin` points to `git@github.com:rlatndud9090/poke-battle-quiz.git`.
- GitHub visibility is `PUBLIC`.
- Local git author is configured as `rlatndud9090` with GitHub noreply email.

## Files Changed From Vite Template

- `.gitignore`
  - Added `.omx/`
  - Added `.reference-repos/`
- `eslint.config.js`
  - Added global ignores for `.omx` and `.reference-repos`
  - This prevents ESLint from reading external reference repos
- `package.json`
  - Added `test`
  - Added `test:run`
  - Added `vitest`
- `README.md`
  - Replaced Vite template text with project overview
- `AGENTS.md`
  - Added project-local agent contract and LLM Wiki entrypoint
- `.omx-config.json`
  - Points wiki configuration at `docs/wiki` and `docs/raw`
- `docs/wiki/`
  - Added raw source, index, log, architecture, decision, reference, session-log,
    and template pages
- `docs/data-sources.md`
  - Data source and import strategy
- `docs/session-handoff.md`
  - This handoff document

## Reference Repos

Reference repos were sparse-cloned under `.reference-repos/`.

They are intentionally ignored by Git.

Current local refs:

```txt
pokemantle        d417e5c
pokerogue         90df650
pokemon-showdown  ecf39ee
```

Approximate local size:

```txt
.reference-repos              48M
.reference-repos/pokemantle  1.3M
.reference-repos/pokerogue    10M
.reference-repos/pokemon-showdown 37M
```

Clone commands used:

```sh
mkdir -p .reference-repos

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/yf-dev/pokemantle.git \
  .reference-repos/pokemantle
git -C .reference-repos/pokemantle sparse-checkout set \
  frontend/composables frontend/components frontend/pages backend/app

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/pagefaultgames/pokerogue.git \
  .reference-repos/pokerogue
git -C .reference-repos/pokerogue sparse-checkout set \
  src/data src/enums src/system src/field src/phases

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/smogon/pokemon-showdown.git \
  .reference-repos/pokemon-showdown
git -C .reference-repos/pokemon-showdown sparse-checkout set \
  data sim
```

## Research Summary

### Daily Puzzle And localStorage

Conclusion:

- MVP can use localStorage for current puzzle progress and personal stats.
- This matches common Wordle-like game behavior.
- Serious cross-device sync, anti-cheat, global ranking, or hidden-answer validation
  needs a backend later.

Pokemantle evidence:

- `frontend/composables/states.ts` saves `guess_data_list`, `puzzle_number`,
  `statistics`, and `api_data` into localStorage.
- `frontend/app.vue` loads current-day puzzle state only when saved puzzle number
  matches today's puzzle number.
- Pokemantle also has a backend for guess/rank APIs, so it is a hybrid model.

Useful local files:

- `.reference-repos/pokemantle/frontend/composables/states.ts`
- `.reference-repos/pokemantle/frontend/composables/utils.ts`
- `.reference-repos/pokemantle/frontend/components/Share.vue`
- `.reference-repos/pokemantle/backend/app/main.py`

### Data Source Choice

Primary source for battle data:

- Pokemon Showdown
- Best for type chart, learnsets, moves, abilities, conditions, and mechanics.

Secondary source:

- PokeAPI
- Best for API-shaped canonical data, localized names, and sprite URLs.

Sprite source:

- PokeAPI Sprites
- Prefer URL templates or generated manifest instead of cloning the full sprite repo.

Behavior/UI reference:

- Pokemantle for daily puzzle, persistence, sharing
- PokeRogue for browser-game battle state and ability architecture

Important licensing note:

- Pokemon Showdown is MIT licensed, but Pokemon IP/trademarks still require care.
- PokeRogue is AGPL. Use it as a reference, but do not copy implementation code
  into this project unless intentionally accepting AGPL consequences.
- PokeAPI and sprites are useful references, but always cache API data locally.

## High-Value Source Links

- PokeAPI docs: https://pokeapi.co/docs/v2
- PokeAPI source: https://github.com/PokeAPI/pokeapi
- PokeAPI sprites: https://github.com/PokeAPI/sprites
- Pokemon Showdown data: https://github.com/smogon/pokemon-showdown/tree/master/data
- Pokemon Showdown repo: https://github.com/smogon/pokemon-showdown
- PokeRogue repo: https://github.com/pagefaultgames/pokerogue
- Pokemantle repo: https://github.com/yf-dev/pokemantle

## Useful Local Source Files

Pokemon Showdown:

- `.reference-repos/pokemon-showdown/data/pokedex.ts`
- `.reference-repos/pokemon-showdown/data/learnsets.ts`
- `.reference-repos/pokemon-showdown/data/moves.ts`
- `.reference-repos/pokemon-showdown/data/abilities.ts`
- `.reference-repos/pokemon-showdown/data/typechart.ts`
- `.reference-repos/pokemon-showdown/data/conditions.ts`
- `.reference-repos/pokemon-showdown/data/text/pokedex.ts`
- `.reference-repos/pokemon-showdown/data/text/moves.ts`
- `.reference-repos/pokemon-showdown/data/text/abilities.ts`
- `.reference-repos/pokemon-showdown/sim/battle-actions.ts`

PokeRogue:

- `.reference-repos/pokerogue/src/data/abilities/init-abilities.ts`
- `.reference-repos/pokerogue/src/data/abilities/ab-attrs.ts`
- `.reference-repos/pokerogue/src/data/type.ts`
- `.reference-repos/pokerogue/src/data/status-effect.ts`
- `.reference-repos/pokerogue/src/data/moves/*`
- `.reference-repos/pokerogue/src/enums/*.ts`
- `.reference-repos/pokerogue/src/data/daily-seed/*`

Pokemantle:

- `.reference-repos/pokemantle/frontend/composables/states.ts`
- `.reference-repos/pokemantle/frontend/composables/utils.ts`
- `.reference-repos/pokemantle/frontend/components/Share.vue`
- `.reference-repos/pokemantle/backend/app/main.py`

## Mechanics Evidence Already Checked

Pokemon Showdown:

- `data/abilities.ts`
  - Defiant: after opposing stat drop, boosts Attack by 2
  - Guts: modifies Attack when statused
  - Speed Boost: residual trigger boosts Speed after active turn
  - Stamina: exists as battle ability behavior
- `data/typechart.ts`
  - Type effectiveness is represented as `damageTaken`
- `sim/battle-actions.ts`
  - Burn halves physical damage unless the attacker has Guts

PokeRogue:

- `src/data/abilities/init-abilities.ts`
  - Speed Boost uses `SpeedBoostAbAttr`
  - Guts uses `BypassBurnDamageReductionAbAttr` and Attack multiplier
  - Defiant uses a post-stat-stage-change ability attribute
  - Stamina uses a post-defend stat-stage-change ability attribute

## Product Architecture Direction

Do not build around a full battle simulator at first.

Use this shape:

```txt
src/domain/
  types.ts
  typeChart.ts
  commands.ts
  abilities.ts
  battleReducer.ts
  daily.ts

src/data/
  curated/
  generated/

src/ui/
  CommandPanel.tsx
  BattleLog.tsx
  GuessBox.tsx
  DailyGame.tsx
```

Core rule:

- Simulation state belongs in `src/domain`.
- React components render state and dispatch commands.
- Data import/generation belongs outside runtime UI.

## Initial Rule Engine Model

Suggested state:

```ts
type BattleQuizState = {
  puzzleId: string;
  targetId: string;
  turn: number;
  targetStatus?: StatusId;
  targetBoosts: Partial<Record<StatId, number>>;
  revealedHints: Hint[];
  commandHistory: BattleCommand[];
  log: BattleLogEntry[];
  solved: boolean;
};
```

Suggested local record:

```ts
type LocalGameRecord = {
  puzzleId: string;
  guesses: string[];
  commands: BattleCommand[];
  battleLog: BattleLogEntry[];
  solved: boolean;
  solvedAt?: string;
};

type LocalStats = {
  played: number;
  solved: number;
  currentStreak: number;
  bestStreak: number;
  history: Record<string, LocalGameRecord>;
};
```

Suggested generated data:

```ts
type QuizPokemon = {
  id: number;
  slug: string;
  names: { en: string; ko?: string; ja?: string };
  types: PokemonType[];
  abilities: AbilityId[];
  baseStats: Record<StatId, number>;
  learnset: MoveId[];
  sprite: {
    icon?: string;
    front?: string;
    officialArtwork?: string;
  };
};

type QuizMove = {
  id: MoveId;
  name: string;
  type: PokemonType;
  category: "physical" | "special" | "status";
  ailment?: StatusId;
  statChanges?: Partial<Record<StatId, number>>;
  teachableProbe?: boolean;
};

type QuizAbility = {
  id: AbilityId;
  name: string;
  triggers: AbilityTrigger[];
};
```

## MVP Scope Recommendation

Start curated, not complete.

Initial data:

- 30-50 Pokemon
- 18 representative attacking moves, one per type
- 5-7 status probes
- 10-20 teachable move probes
- 10-15 visible abilities

Initial abilities:

- Speed Boost: after action, Speed +1
- Stamina: after damaging attack, Defense +1
- Defiant: after stat drop, Attack +2
- Guts: status boosts Attack and ignores burn attack reduction
- Contrary: stat changes invert
- Clear Body / White Smoke: prevents stat drops
- Water Absorb / Volt Absorb / Flash Fire: type immunity style hint
- Levitate: Ground immunity

Initial commands:

- Type attack command
- Status command
- Teach move command
- Stat raise/drop command
- Guess command

Initial UX:

- Battle panel with hidden target silhouette or sprite placeholder
- Command panel
- Battle log
- Candidate/guess input
- Daily result/share summary
- Personal stats from localStorage

## Open Decisions

These are not decided yet:

- Korean name source and normalization rules
- Whether MVP uses only national dex base forms or includes regional/forms
- Which generation/ruleset is canonical for learnsets
- Whether type probes should use real move names or generic representative moves
- Whether a backend is needed before public sharing
- Whether sprites should be hotlinked from GitHub raw/CDN or copied at build time

Recommended default choices:

- Use Gen 9-ish current data from Pokemon Showdown for mechanics.
- Restrict MVP to base forms unless a form is mechanically interesting.
- Use localStorage only for the first prototype.
- Use build-time generated JSON/TS data snapshots.
- Avoid backend until answer hiding or public ranking matters.

## Next Implementation Steps

1. Add `src/domain` types and pure reducer shell.
2. Add a tiny curated dataset with 6-10 Pokemon and 8-12 commands.
3. Add Vitest coverage for:
   - type effectiveness hint
   - Speed Boost
   - Stamina
   - Defiant
   - Guts burn interaction
4. Replace Vite starter UI with a minimal playable daily battle quiz surface.
5. Add localStorage persistence for current puzzle and stats.
6. Only after the loop is fun, write import scripts for Showdown/PokeAPI data.

## Verification Commands For Future Sessions

Run after edits:

```sh
npm run lint
npm run build
npm run test:run
```

For local manual check:

```sh
npm run dev -- --host 127.0.0.1
```

Open:

```txt
http://127.0.0.1:5173/
```

## Notes For Codex

Relevant available skills/plugins from this setup:

- `game-studio`: early browser-game stack and workflow routing
- `web-game-foundations`: simulation/UI/data boundary decisions
- `frontend-skill`: when replacing the starter UI with a polished app surface
- `playwright` or Browser plugin: local UI verification
- `game-playtest`: later game-flow QA
- `spreadsheets`: if curating Pokemon/move/ability data in CSV/XLSX first

Keep the implementation direct and small. The first milestone is not data
completeness; it is proving that battle-style hints are fun and readable.
