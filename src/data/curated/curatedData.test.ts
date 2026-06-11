import { describe, expect, it } from "vitest"

import {
  ABILITY_SUPPORT_STATUSES,
  BASE_STAT_IDS,
  DAMAGE_CATEGORIES,
  HINT_TAGS,
  MOVE_CATEGORIES,
  MOVE_PROBE_ROLES,
  MOVE_TAGS,
  POKEMON_TAGS,
  POKEMON_TYPES,
  RANK_STAT_IDS,
  STATUS_CONDITION_IDS,
  USER_ACTION_KINDS,
} from "../../domain/dataTypes"
import { ABILITIES, DAILY_ANSWER_POOL, MOVES, POKEMON, TYPE_MATCHUPS } from "./index"

const pokemonTypes = new Set(POKEMON_TYPES)
const moveCategories = new Set(MOVE_CATEGORIES)
const damageCategories = new Set(DAMAGE_CATEGORIES)
const statusConditionIds = new Set(STATUS_CONDITION_IDS)
const rankStatIds = new Set(RANK_STAT_IDS)
const baseStatIds = new Set(BASE_STAT_IDS)
const moveTags = new Set(MOVE_TAGS)
const moveProbeRoles = new Set(MOVE_PROBE_ROLES)
const hintTags = new Set(HINT_TAGS)
const userActionKinds = new Set(USER_ACTION_KINDS)
const abilitySupportStatuses = new Set(ABILITY_SUPPORT_STATUSES)
const pokemonTags = new Set(POKEMON_TAGS)

const moveIds = new Set(MOVES.map((move) => move.id))
const abilityIds = new Set(ABILITIES.map((ability) => ability.id))
const pokemonIds = new Set(POKEMON.map((pokemon) => pokemon.id))
const supportedAbilityIds = new Set(
  ABILITIES.filter((ability) => ability.quiz.support === "supported").map((ability) => ability.id),
)

function expectUnique(ids: readonly string[]) {
  expect(new Set(ids).size).toBe(ids.length)
}

function abilitySlots(pokemon: (typeof POKEMON)[number]) {
  return [pokemon.abilities.primary, pokemon.abilities.secondary, pokemon.abilities.hidden].filter(
    (abilityId): abilityId is string => typeof abilityId === "string",
  )
}

describe("curated data contract", () => {
  it("keeps catalog ids unique", () => {
    expectUnique(MOVES.map((move) => move.id))
    expectUnique(ABILITIES.map((ability) => ability.id))
    expectUnique(POKEMON.map((pokemon) => pokemon.id))
  })

  it("defines one physical and one special attack probe for every type", () => {
    for (const type of POKEMON_TYPES) {
      const physical = MOVES.filter(
        (move) => move.probeRoles.includes("user-attack") && move.type === type && move.category === "physical",
      )
      const special = MOVES.filter(
        (move) => move.probeRoles.includes("user-attack") && move.type === type && move.category === "special",
      )

      expect(physical, `${type} physical attack probe`).toHaveLength(1)
      expect(special, `${type} special attack probe`).toHaveLength(1)
    }
  })

  it("keeps move references inside known domains", () => {
    for (const move of MOVES) {
      expect(pokemonTypes.has(move.type), `${move.id} type`).toBe(true)
      expect(moveCategories.has(move.category), `${move.id} category`).toBe(true)

      for (const role of move.probeRoles) {
        expect(moveProbeRoles.has(role), `${move.id} probe role ${role}`).toBe(true)
      }

      for (const tag of move.tags ?? []) {
        expect(moveTags.has(tag), `${move.id} tag ${tag}`).toBe(true)
      }

      if (move.statusEffect) {
        expect(statusConditionIds.has(move.statusEffect), `${move.id} status ${move.statusEffect}`).toBe(true)
      }

      for (const change of move.statChanges ?? []) {
        expect(rankStatIds.has(change.stat), `${move.id} stat ${change.stat}`).toBe(true)
      }
    }
  })

  it("keeps ability rules inside known domains", () => {
    for (const ability of ABILITIES) {
      expect(abilitySupportStatuses.has(ability.quiz.support), `${ability.id} support`).toBe(true)

      for (const action of ability.quiz.verificationActions) {
        expect(userActionKinds.has(action), `${ability.id} verification action ${action}`).toBe(true)
      }

      if (ability.quiz.support === "supported") {
        expect(ability.rules.length, `${ability.id} supported ability rules`).toBeGreaterThan(0)
      }

      for (const rule of ability.rules) {
        for (const hintTag of rule.hintTags) {
          expect(hintTags.has(hintTag), `${ability.id} hint tag ${hintTag}`).toBe(true)
        }

        for (const condition of rule.conditions ?? []) {
          if ("category" in condition) {
            expect(damageCategories.has(condition.category), `${ability.id} condition category`).toBe(true)
          }
          if ("type" in condition) {
            expect(pokemonTypes.has(condition.type), `${ability.id} condition type`).toBe(true)
          }
          if ("tag" in condition) {
            expect(moveTags.has(condition.tag), `${ability.id} condition tag`).toBe(true)
          }
        }

        for (const effect of rule.effects) {
          if ("stat" in effect) {
            expect(rankStatIds.has(effect.stat), `${ability.id} effect stat`).toBe(true)
          }
          if ("type" in effect) {
            expect(pokemonTypes.has(effect.type), `${ability.id} effect type`).toBe(true)
          }
        }
      }
    }
  })

  it("keeps pokemon references valid", () => {
    for (const pokemon of POKEMON) {
      expect(pokemon.nationalDex, `${pokemon.id} national dex`).toBeGreaterThan(0)

      for (const type of pokemon.types) {
        expect(pokemonTypes.has(type), `${pokemon.id} type ${type}`).toBe(true)
      }

      for (const abilityId of abilitySlots(pokemon)) {
        expect(abilityIds.has(abilityId), `${pokemon.id} ability ${abilityId}`).toBe(true)
      }

      for (const moveId of pokemon.learnset.moveIds) {
        expect(moveIds.has(moveId), `${pokemon.id} move ${moveId}`).toBe(true)
      }

      for (const statId of BASE_STAT_IDS) {
        expect(baseStatIds.has(statId), `${pokemon.id} stat ${statId}`).toBe(true)
        expect(pokemon.baseStats[statId], `${pokemon.id} base stat ${statId}`).toBeGreaterThan(0)
      }

      for (const tag of pokemon.tags ?? []) {
        expect(pokemonTags.has(tag), `${pokemon.id} tag ${tag}`).toBe(true)
      }
    }
  })

  it("keeps type matchup chart complete and valid", () => {
    expectUnique(TYPE_MATCHUPS.map((matchup) => matchup.attackType))

    for (const type of POKEMON_TYPES) {
      expect(TYPE_MATCHUPS.some((matchup) => matchup.attackType === type), `${type} matchup`).toBe(true)
    }

    for (const matchup of TYPE_MATCHUPS) {
      expect(pokemonTypes.has(matchup.attackType), `${matchup.attackType} attack type`).toBe(true)

      for (const targetType of [
        ...matchup.superEffective,
        ...matchup.notVeryEffective,
        ...matchup.noEffect,
      ]) {
        expect(pokemonTypes.has(targetType), `${matchup.attackType} target ${targetType}`).toBe(true)
      }
    }
  })

  it("keeps daily answer pool limited to supported pokemon ability options", () => {
    for (const option of DAILY_ANSWER_POOL) {
      const pokemon = POKEMON.find((candidate) => candidate.id === option.pokemonId)
      expect(pokemon, `${option.pokemonId} pokemon`).toBeDefined()
      expect(pokemonIds.has(option.pokemonId), `${option.pokemonId} pokemon id`).toBe(true)
      expect(abilityIds.has(option.abilityId), `${option.abilityId} ability id`).toBe(true)
      expect(supportedAbilityIds.has(option.abilityId), `${option.abilityId} support`).toBe(true)
      expect(abilitySlots(pokemon!).includes(option.abilityId), `${option.pokemonId}/${option.abilityId} slot`).toBe(true)
    }
  })
})
