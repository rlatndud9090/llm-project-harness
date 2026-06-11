# Notes: 퀴즈 데이터 계약

Date: 2026-06-11 Asia/Seoul
Unit type: feature
Status: done

## 맥락

- 첫 구현 단위는 전체 데이터 확보가 아니라 퀴즈 데이터 계약과 검증 가능한 seed data다.
- 유저 행동은 정답 입력, 내가 기술 사용하기, 상대가 기술 사용하기로 시작한다.
- 하나의 행동은 하나의 턴으로 계산되어야 한다.
- 검증 불가능한 특성은 정답 후보에서 제외하고, 검증 가능한 행동이 추가되면 다시 편입한다.

## 결정

- PRD는 데이터가 만족해야 할 요구사항을 정의한다.
- ADR은 TypeScript curated module, ability rule schema, daily answer pool eligibility를 결정한다.
- `src/domain/dataTypes.ts`에 데이터 계약 타입을 둔다.
- `src/data/curated/`에 type chart, move catalog, ability catalog, Pokemon seed, daily pool을 둔다.
- daily answer pool은 `pokemonId + abilityId` 조합으로 supported ability만 허용한다.

## 검증

- 통과: `npm run test:run` — 1 file, 7 tests.
- 통과: `npm run build`.
- 통과: `npm run lint`.
- 통과: `npm run harness:gate` — harness:check, lint, build, test:run 통과.

## 후속 작업

- ability trigger system에서 `AbilityDefinition.rules`를 실제 이벤트 처리로 연결한다.
- daily battle loop에서 행동/턴/공유 결과를 구현한다.
- 전체 9세대 learnset이 필요해지는 시점에 generated data pipeline을 별도 ADR로 결정한다.
