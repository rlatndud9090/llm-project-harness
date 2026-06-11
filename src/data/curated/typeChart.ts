import type { TypeMatchup } from "../../domain/dataTypes"

export const TYPE_MATCHUPS: readonly TypeMatchup[] = [
  {
    attackType: "normal",
    superEffective: [],
    notVeryEffective: ["rock", "steel"],
    noEffect: ["ghost"],
  },
  {
    attackType: "fire",
    superEffective: ["grass", "ice", "bug", "steel"],
    notVeryEffective: ["fire", "water", "rock", "dragon"],
    noEffect: [],
  },
  {
    attackType: "water",
    superEffective: ["fire", "ground", "rock"],
    notVeryEffective: ["water", "grass", "dragon"],
    noEffect: [],
  },
  {
    attackType: "electric",
    superEffective: ["water", "flying"],
    notVeryEffective: ["electric", "grass", "dragon"],
    noEffect: ["ground"],
  },
  {
    attackType: "grass",
    superEffective: ["water", "ground", "rock"],
    notVeryEffective: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
    noEffect: [],
  },
  {
    attackType: "ice",
    superEffective: ["grass", "ground", "flying", "dragon"],
    notVeryEffective: ["fire", "water", "ice", "steel"],
    noEffect: [],
  },
  {
    attackType: "fighting",
    superEffective: ["normal", "ice", "rock", "dark", "steel"],
    notVeryEffective: ["poison", "flying", "psychic", "bug", "fairy"],
    noEffect: ["ghost"],
  },
  {
    attackType: "poison",
    superEffective: ["grass", "fairy"],
    notVeryEffective: ["poison", "ground", "rock", "ghost"],
    noEffect: ["steel"],
  },
  {
    attackType: "ground",
    superEffective: ["fire", "electric", "poison", "rock", "steel"],
    notVeryEffective: ["grass", "bug"],
    noEffect: ["flying"],
  },
  {
    attackType: "flying",
    superEffective: ["grass", "fighting", "bug"],
    notVeryEffective: ["electric", "rock", "steel"],
    noEffect: [],
  },
  {
    attackType: "psychic",
    superEffective: ["fighting", "poison"],
    notVeryEffective: ["psychic", "steel"],
    noEffect: ["dark"],
  },
  {
    attackType: "bug",
    superEffective: ["grass", "psychic", "dark"],
    notVeryEffective: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
    noEffect: [],
  },
  {
    attackType: "rock",
    superEffective: ["fire", "ice", "flying", "bug"],
    notVeryEffective: ["fighting", "ground", "steel"],
    noEffect: [],
  },
  {
    attackType: "ghost",
    superEffective: ["psychic", "ghost"],
    notVeryEffective: ["dark"],
    noEffect: ["normal"],
  },
  {
    attackType: "dragon",
    superEffective: ["dragon"],
    notVeryEffective: ["steel"],
    noEffect: ["fairy"],
  },
  {
    attackType: "dark",
    superEffective: ["psychic", "ghost"],
    notVeryEffective: ["fighting", "dark", "fairy"],
    noEffect: [],
  },
  {
    attackType: "steel",
    superEffective: ["ice", "rock", "fairy"],
    notVeryEffective: ["fire", "water", "electric", "steel"],
    noEffect: [],
  },
  {
    attackType: "fairy",
    superEffective: ["fighting", "dragon", "dark"],
    notVeryEffective: ["fire", "poison", "steel"],
    noEffect: [],
  },
]
