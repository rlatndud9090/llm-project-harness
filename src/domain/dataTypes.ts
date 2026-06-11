export const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const

export type PokemonType = (typeof POKEMON_TYPES)[number]

export const DAMAGE_CATEGORIES = ["physical", "special"] as const
export type DamageCategory = (typeof DAMAGE_CATEGORIES)[number]

export const MOVE_CATEGORIES = [...DAMAGE_CATEGORIES, "status"] as const
export type MoveCategory = (typeof MOVE_CATEGORIES)[number]

export const BASE_STAT_IDS = [
  "hp",
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
] as const

export type BaseStatId = (typeof BASE_STAT_IDS)[number]
export type BaseStats = Readonly<Record<BaseStatId, number>>

export const RANK_STAT_IDS = [
  "attack",
  "defense",
  "specialAttack",
  "specialDefense",
  "speed",
  "accuracy",
  "evasion",
] as const

export type RankStatId = (typeof RANK_STAT_IDS)[number]

export const STATUS_CONDITION_IDS = ["burn", "poison", "paralysis", "sleep"] as const
export type StatusConditionId = (typeof STATUS_CONDITION_IDS)[number]

export const MOVE_TAGS = [
  "contact",
  "slicing",
  "sound",
  "punch",
  "recoil",
  "priority",
  "bite",
  "powder",
] as const

export type MoveTag = (typeof MOVE_TAGS)[number]

export const MOVE_PROBE_ROLES = [
  "user-attack",
  "user-status",
  "user-stat-change",
  "opponent-learnset",
] as const

export type MoveProbeRole = (typeof MOVE_PROBE_ROLES)[number]

export const USER_ACTION_KINDS = [
  "guess",
  "use-user-attack",
  "use-user-status-move",
  "use-user-stat-move",
  "ask-opponent-move",
] as const

export type UserActionKind = (typeof USER_ACTION_KINDS)[number]

export const ABILITY_TRIGGERS = [
  "turn-end",
  "after-receiving-hit",
  "after-receiving-physical-hit",
  "before-receiving-stat-drop",
  "before-status-attempt",
  "before-accuracy-check",
  "before-using-move",
  "during-move-damage",
  "during-move-type-resolution",
  "after-using-move",
  "before-damage-calculation",
] as const

export type AbilityTrigger = (typeof ABILITY_TRIGGERS)[number]

export const ABILITY_SUPPORT_STATUSES = ["supported", "planned", "blocked"] as const
export type AbilitySupportStatus = (typeof ABILITY_SUPPORT_STATUSES)[number]

export const HINT_TAGS = [
  "stat-stage",
  "type-matchup",
  "move-learnset",
  "damage-multiplier",
  "move-type-change",
  "status-immunity",
  "recoil",
  "priority",
  "berry",
] as const

export type HintTag = (typeof HINT_TAGS)[number]

export const POKEMON_TAGS = [
  "starter",
  "fully-evolved",
  "single-stage",
  "legendary",
  "mythical",
  "regional-form",
] as const

export type PokemonTag = (typeof POKEMON_TAGS)[number]

export type PokemonId = string
export type MoveId = string
export type AbilityId = string

export type LocalizedName = Readonly<{
  ko: string
  en: string
}>

export type PokemonTypes = readonly [PokemonType] | readonly [PokemonType, PokemonType]

export type StatStageChange = Readonly<{
  target: "self" | "opponent"
  stat: RankStatId
  stages: -2 | -1 | 1 | 2
}>

export type MoveDefinition = Readonly<{
  id: MoveId
  name: LocalizedName
  type: PokemonType
  category: MoveCategory
  accuracy: 100
  probeRoles: readonly MoveProbeRole[]
  tags?: readonly MoveTag[]
  statusEffect?: StatusConditionId
  statChanges?: readonly StatStageChange[]
}>

export type AbilityCondition =
  | Readonly<{ kind: "receivedMoveCategory"; category: DamageCategory }>
  | Readonly<{ kind: "incomingStatChange"; direction: "down" | "up" }>
  | Readonly<{ kind: "moveCategory"; category: DamageCategory }>
  | Readonly<{ kind: "moveTag"; tag: MoveTag }>
  | Readonly<{ kind: "moveType"; type: PokemonType }>
  | Readonly<{ kind: "moveHasRecoil"; value: true }>
  | Readonly<{ kind: "moveHasPriority"; value: true }>
  | Readonly<{ kind: "berryConsumed"; value: true }>

export type AbilityEffect =
  | Readonly<{ kind: "raiseStat"; target: "self" | "opponent"; stat: RankStatId; stages: 1 | 2 }>
  | Readonly<{ kind: "lowerStat"; target: "self" | "opponent"; stat: RankStatId; stages: -1 | -2 }>
  | Readonly<{ kind: "reflectStatDrop" }>
  | Readonly<{ kind: "multiplyAttackStat"; multiplier: 2 }>
  | Readonly<{ kind: "multiplyMovePower"; multiplier: number }>
  | Readonly<{ kind: "changeMoveType"; type: PokemonType }>
  | Readonly<{ kind: "preventRecoil" }>
  | Readonly<{ kind: "blockMove"; movePriority: "increased" }>
  | Readonly<{ kind: "ignoreOpponentStatStages" }>
  | Readonly<{ kind: "allowNormalAndFightingToHitGhost" }>
  | Readonly<{ kind: "recoverHp"; source: "berry" }>
  | Readonly<{ kind: "restoreBerry" }>
  | Readonly<{ kind: "emitHint"; hintCode: string }>

export type AbilityRule = Readonly<{
  trigger: AbilityTrigger
  conditions?: readonly AbilityCondition[]
  effects: readonly AbilityEffect[]
  hintTags: readonly HintTag[]
}>

export type AbilityDefinition = Readonly<{
  id: AbilityId
  name: LocalizedName
  quiz: Readonly<{
    support: AbilitySupportStatus
    verificationActions: readonly UserActionKind[]
    unsupportedReason?: string
  }>
  rules: readonly AbilityRule[]
}>

export type PokemonAbilitySlots = Readonly<{
  primary: AbilityId
  secondary?: AbilityId
  hidden?: AbilityId
}>

export type LearnsetCoverage = "curated-subset" | "gen9-full" | "generated"

export type PokemonLearnset = Readonly<{
  coverage: LearnsetCoverage
  moveIds: readonly MoveId[]
}>

export type QuizPokemon = Readonly<{
  id: PokemonId
  nationalDex: number
  name: LocalizedName
  types: PokemonTypes
  abilities: PokemonAbilitySlots
  baseStats: BaseStats
  learnset: PokemonLearnset
  tags?: readonly PokemonTag[]
}>

export type DailyAnswerOption = Readonly<{
  pokemonId: PokemonId
  abilityId: AbilityId
  enabled: boolean
  note?: string
}>

export type TypeMatchup = Readonly<{
  attackType: PokemonType
  superEffective: readonly PokemonType[]
  notVeryEffective: readonly PokemonType[]
  noEffect: readonly PokemonType[]
}>
