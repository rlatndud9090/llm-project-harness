---
title: "퀴즈 데이터 계약"
date: "2026-06-11"
status: accepted # proposed | accepted | deprecated | superseded
related_prd: "./prd.md"
unit_type: feature
branch: "feature/quiz-data-contract"
raw_path: "docs/raw/feature/quiz-data-contract"
supersedes:
---

# ADR: 퀴즈 데이터 계약

## 컨텍스트

PRD는 1일 1회 배틀형 퀴즈를 위해 포켓몬, 기술, 특성, 상태이상, 랭크 변화,
daily answer pool을 표현해야 한다고 요구한다. 동시에 MVP는 전체 배틀 시뮬레이터나
전체 9세대 데이터 import를 목표로 하지 않는다.

초기 구현은 데이터 모양을 고정하고, 참조 무결성을 테스트로 검증하며, 나중에
generated data를 붙일 수 있는 경계를 남기는 것이 중요하다.

## 결정

초기 데이터 계약은 `src/domain/dataTypes.ts`에 TypeScript 타입으로 둔다. 초기
seed data는 `src/data/curated/` 아래 TypeScript module로 관리한다.

특성은 설명문 string이 아니라 `rules` 배열로 표현한다. 각 rule은 `trigger`,
`conditions`, `effects`, `hintTags`를 가진다. 이것은 실제 배틀 계산이 아니라
퀴즈 힌트 엔진이 읽을 수 있는 최소 구조다.

daily answer pool은 포켓몬 종 단위만으로 관리하지 않고 `pokemonId + abilityId`
조합으로 관리한다. 유저가 맞히는 정답은 포켓몬 종이지만, 내부 퀴즈 힌트는
선택된 active ability를 기준으로 결정된다. 검증 불가능한 특성은 `blocked` 또는
`planned` 상태로 두고 daily answer pool에 넣지 않는다.

learnset은 초기에는 `curated-subset` coverage를 명시한다. 9세대 전체 learnset이
필요해지는 시점에 `generated` 또는 `gen9-full` coverage로 확장한다.

## 선택지

### 선택지 A: JSON seed data

- 장점: 데이터와 코드가 분리되어 나중에 import 결과물로 대체하기 쉽다.
- 단점: 초기에는 타입 추론과 참조 검증이 약하고, schema validator를 별도로
  만들어야 한다.

### 선택지 B: TypeScript curated module

- 장점: 타입 검증과 테스트 작성이 쉽고, 초기 domain contract를 빠르게 고정할 수
  있다.
- 단점: 대량 generated data로 확장할 때 별도 변환 경계가 필요하다.

### 선택지 C: 외부 데이터 import pipeline 먼저 구현

- 장점: 전체 도감과 learnset 정확도를 빠르게 확보할 수 있다.
- 단점: 첫 작업의 범위가 과도하게 커지고, source provenance와 공개 저장소 관리
  문제가 먼저 발생한다.

## 선택 근거

B를 선택한다. 지금 필요한 것은 전체 데이터 양이 아니라 퀴즈 엔진이 의존할 데이터
계약과 검증 가능한 seed data다. TypeScript module은 현재 Vite/Vitest 구조에서
가장 작은 추가 비용으로 타입과 테스트를 함께 제공한다.

C는 후속 작업으로 미룬다. generated data가 필요해지면 `src/data/generated/`와
import script를 별도 ADR로 도입한다.

## 결과

### 긍정적 영향

- 초기 구현자가 domain contract를 명확히 읽고 사용할 수 있다.
- curated data의 참조 깨짐을 Vitest로 즉시 잡을 수 있다.
- 검증 불가능한 특성을 daily answer pool에서 명시적으로 제외할 수 있다.
- 이후 ability trigger system이 `rules` 구조를 읽도록 확장할 수 있다.

### 부정적 영향 / 트레이드오프

- 초기 seed data는 전체 9세대 데이터가 아니므로 실제 서비스 daily pool으로 바로
  쓰기에는 범위가 제한된다.
- real learnset 정확도는 generated data 작업 전까지 curated subset에 의존한다.
- 특성 rule schema는 MVP 힌트용이므로 실제 배틀 판정과 다를 수 있다.

## 후속 작업

- [ ] `feature/ability-trigger-system`에서 ability rule을 실제 event/effect 처리로 연결한다.
- [ ] `feature/daily-battle-loop`에서 action 1회 = turn 1 진행 모델을 구현한다.
- [ ] generated data가 필요해지면 별도 ADR로 import 경계를 결정한다.
- [ ] 회피/우선도/열매 계열 특성의 검증 행동을 추가할지 별도 PRD에서 결정한다.

## 검증

- [ ] curated data 참조 무결성 테스트.
- [ ] 타입별 물리/특수 대표 공격기 coverage 테스트.
- [ ] daily answer pool이 supported ability만 사용하는지 테스트.
- [ ] `npm run harness:gate`.
