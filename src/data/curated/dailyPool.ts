import type { DailyAnswerOption } from "../../domain/dataTypes"

export const DAILY_ANSWER_POOL: readonly DailyAnswerOption[] = [
  { pokemonId: "blaziken", abilityId: "speed-boost", enabled: true },
  { pokemonId: "mudsdale", abilityId: "stamina", enabled: true },
  { pokemonId: "corviknight", abilityId: "mirror-armor", enabled: true },
  { pokemonId: "skarmory", abilityId: "weak-armor", enabled: true },
  { pokemonId: "azumarill", abilityId: "huge-power", enabled: true },
  { pokemonId: "azumarill", abilityId: "sap-sipper", enabled: true },
  { pokemonId: "gallade", abilityId: "sharpness", enabled: true },
  { pokemonId: "sylveon", abilityId: "pixilate", enabled: true },
  { pokemonId: "perrserker", abilityId: "tough-claws", enabled: true },
  { pokemonId: "farigiraf", abilityId: "sap-sipper", enabled: true, note: "테일아머/되새김질은 제외하고 초식 조합만 허용한다." },
]
