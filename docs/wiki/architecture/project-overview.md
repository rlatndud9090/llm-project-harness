# Project Overview

Status: active
Category: architecture
Last updated: 2026-06-09
Sources: `docs/raw/2026-06-09-session-bootstrap.md`, `docs/session-handoff.md`, `README.md`

## Summary

Poke Battle Quiz is a daily Pokemon deduction game. Every day has one shared
Pokemon answer. Players reveal information by issuing battle-like commands rather
than by asking arbitrary text questions.

## MVP Boundary

The MVP should prove that battle-style hints are fun and readable. It should not
try to reproduce the full Pokemon battle simulator.

In scope:

- Daily answer selection.
- Local current-puzzle progress.
- Local personal stats.
- Type attack probes.
- Status probes.
- Move learnset probes.
- Stat-stage probes.
- Ability-trigger hints for a curated ability subset.
- Battle log and result/share text.

Out of scope for the first prototype:

- Full damage calculation.
- Full turn order, PP, items, weather, terrain, switching, double battles, or AI.
- Backend answer validation.
- Public leaderboards.
- Complete national dex data.

## Current Technical State

The app is a Vite React TypeScript project with Vitest and ESLint configured.
The project is published as a public GitHub repository:
`https://github.com/rlatndud9090/poke-battle-quiz`.

Useful commands:

```sh
npm run dev
npm run lint
npm run build
npm run test:run
```

## Data Direction

Use curated data first, then generated data snapshots later.

Primary data reference: Pokemon Showdown.

Secondary data reference: PokeAPI.

Behavioral reference: PokeRogue, without copying implementation code because of
its AGPL license.

## Durable Architecture Boundary

React should render state and dispatch commands. The quiz rules should live in
pure TypeScript domain modules. Data generation/import scripts should stay out of
runtime UI.

Related page: [[architecture/quiz-hint-engine]]
