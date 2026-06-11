import type { AbilityDefinition } from "../../domain/dataTypes"

export const ABILITIES: readonly AbilityDefinition[] = [
  {
    id: "speed-boost",
    name: { ko: "가속", en: "Speed Boost" },
    quiz: { support: "supported", verificationActions: ["use-user-attack", "use-user-status-move", "ask-opponent-move"] },
    rules: [
      {
        trigger: "turn-end",
        effects: [{ kind: "raiseStat", target: "self", stat: "speed", stages: 1 }],
        hintTags: ["stat-stage"],
      },
    ],
  },
  {
    id: "stamina",
    name: { ko: "지구력", en: "Stamina" },
    quiz: { support: "supported", verificationActions: ["use-user-attack"] },
    rules: [
      {
        trigger: "after-receiving-hit",
        effects: [{ kind: "raiseStat", target: "self", stat: "defense", stages: 1 }],
        hintTags: ["stat-stage"],
      },
    ],
  },
  {
    id: "weak-armor",
    name: { ko: "깨어진갑옷", en: "Weak Armor" },
    quiz: { support: "supported", verificationActions: ["use-user-attack"] },
    rules: [
      {
        trigger: "after-receiving-physical-hit",
        conditions: [{ kind: "receivedMoveCategory", category: "physical" }],
        effects: [
          { kind: "lowerStat", target: "self", stat: "defense", stages: -1 },
          { kind: "raiseStat", target: "self", stat: "speed", stages: 2 },
        ],
        hintTags: ["stat-stage"],
      },
    ],
  },
  {
    id: "mirror-armor",
    name: { ko: "미러아머", en: "Mirror Armor" },
    quiz: { support: "supported", verificationActions: ["use-user-stat-move"] },
    rules: [
      {
        trigger: "before-receiving-stat-drop",
        conditions: [{ kind: "incomingStatChange", direction: "down" }],
        effects: [{ kind: "reflectStatDrop" }],
        hintTags: ["stat-stage"],
      },
    ],
  },
  {
    id: "tough-claws",
    name: { ko: "단단한발톱", en: "Tough Claws" },
    quiz: { support: "supported", verificationActions: ["ask-opponent-move"] },
    rules: [
      {
        trigger: "during-move-damage",
        conditions: [{ kind: "moveTag", tag: "contact" }],
        effects: [{ kind: "multiplyMovePower", multiplier: 1.3 }],
        hintTags: ["damage-multiplier"],
      },
    ],
  },
  {
    id: "sharpness",
    name: { ko: "예리함", en: "Sharpness" },
    quiz: { support: "supported", verificationActions: ["ask-opponent-move"] },
    rules: [
      {
        trigger: "during-move-damage",
        conditions: [{ kind: "moveTag", tag: "slicing" }],
        effects: [{ kind: "multiplyMovePower", multiplier: 1.5 }],
        hintTags: ["damage-multiplier"],
      },
    ],
  },
  {
    id: "huge-power",
    name: { ko: "천하장사", en: "Huge Power" },
    quiz: { support: "supported", verificationActions: ["ask-opponent-move"] },
    rules: [
      {
        trigger: "before-damage-calculation",
        conditions: [{ kind: "moveCategory", category: "physical" }],
        effects: [{ kind: "multiplyAttackStat", multiplier: 2 }],
        hintTags: ["damage-multiplier"],
      },
    ],
  },
  {
    id: "pixilate",
    name: { ko: "페어리스킨", en: "Pixilate" },
    quiz: { support: "supported", verificationActions: ["ask-opponent-move"] },
    rules: [
      {
        trigger: "during-move-type-resolution",
        conditions: [{ kind: "moveType", type: "normal" }],
        effects: [{ kind: "changeMoveType", type: "fairy" }, { kind: "multiplyMovePower", multiplier: 1.2 }],
        hintTags: ["move-type-change", "damage-multiplier"],
      },
    ],
  },
  {
    id: "aerilate",
    name: { ko: "스카이스킨", en: "Aerilate" },
    quiz: { support: "supported", verificationActions: ["ask-opponent-move"] },
    rules: [
      {
        trigger: "during-move-type-resolution",
        conditions: [{ kind: "moveType", type: "normal" }],
        effects: [{ kind: "changeMoveType", type: "flying" }, { kind: "multiplyMovePower", multiplier: 1.2 }],
        hintTags: ["move-type-change", "damage-multiplier"],
      },
    ],
  },
  {
    id: "rock-head",
    name: { ko: "돌머리", en: "Rock Head" },
    quiz: { support: "supported", verificationActions: ["ask-opponent-move"] },
    rules: [
      {
        trigger: "after-using-move",
        conditions: [{ kind: "moveHasRecoil", value: true }],
        effects: [{ kind: "preventRecoil" }],
        hintTags: ["recoil"],
      },
    ],
  },
  {
    id: "sap-sipper",
    name: { ko: "초식", en: "Sap Sipper" },
    quiz: { support: "supported", verificationActions: ["use-user-attack", "use-user-status-move"] },
    rules: [
      {
        trigger: "before-status-attempt",
        conditions: [{ kind: "moveType", type: "grass" }],
        effects: [{ kind: "raiseStat", target: "self", stat: "attack", stages: 1 }],
        hintTags: ["status-immunity", "stat-stage"],
      },
    ],
  },
  {
    id: "blaze",
    name: { ko: "맹화", en: "Blaze" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "HP threshold action/result model이 아직 없다." },
    rules: [],
  },
  {
    id: "own-tempo",
    name: { ko: "마이페이스", en: "Own Tempo" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "혼란/위협 검증 행동이 아직 없다." },
    rules: [],
  },
  {
    id: "inner-focus",
    name: { ko: "정신력", en: "Inner Focus" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "풀죽음/위협 검증 행동이 아직 없다." },
    rules: [],
  },
  {
    id: "pressure",
    name: { ko: "프레셔", en: "Pressure" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "PP 소모를 퀴즈 힌트로 사용하지 않는다." },
    rules: [],
  },
  {
    id: "unnerve",
    name: { ko: "긴장감", en: "Unnerve" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "열매 사용 행동이 아직 없다." },
    rules: [],
  },
  {
    id: "keen-eye",
    name: { ko: "날카로운눈", en: "Keen Eye" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "명중률/회피율 정책 결정이 아직 없다." },
    rules: [],
  },
  {
    id: "sturdy",
    name: { ko: "옹골참", en: "Sturdy" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "HP와 일격 판정을 MVP에서 계산하지 않는다." },
    rules: [],
  },
  {
    id: "thick-fat",
    name: { ko: "두꺼운지방", en: "Thick Fat" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "받는 데미지 배율 hint 정책이 아직 없다." },
    rules: [],
  },
  {
    id: "steadfast",
    name: { ko: "불굴의마음", en: "Steadfast" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "풀죽음 판정을 MVP에서 사용하지 않는다." },
    rules: [],
  },
  {
    id: "justified",
    name: { ko: "정의의마음", en: "Justified" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "악 타입 피격 후 랭크업 hint는 후속 ability trigger에서 다룬다." },
    rules: [],
  },
  {
    id: "cute-charm",
    name: { ko: "헤롱헤롱바디", en: "Cute Charm" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "성별과 헤롱헤롱 상태를 MVP에서 다루지 않는다." },
    rules: [],
  },
  {
    id: "battle-armor",
    name: { ko: "전투무장", en: "Battle Armor" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "급소를 MVP에서 계산하지 않는다." },
    rules: [],
  },
  {
    id: "steely-spirit",
    name: { ko: "강철정신", en: "Steely Spirit" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "아군/더블 배틀 맥락을 MVP에서 사용하지 않는다." },
    rules: [],
  },
  {
    id: "early-bird",
    name: { ko: "일찍기상", en: "Early Bird" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "수면 턴 수를 MVP에서 계산하지 않는다." },
    rules: [],
  },
  {
    id: "scrappy",
    name: { ko: "배짱", en: "Scrappy" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "노말/격투 기술로 고스트를 공격하는 검증 행동이 아직 없다." },
    rules: [
      {
        trigger: "during-move-damage",
        conditions: [{ kind: "moveType", type: "normal" }],
        effects: [{ kind: "allowNormalAndFightingToHitGhost" }],
        hintTags: ["type-matchup"],
      },
    ],
  },
  {
    id: "magic-guard",
    name: { ko: "매직가드", en: "Magic Guard" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "간접 데미지를 MVP에서 계산하지 않는다." },
    rules: [],
  },
  {
    id: "unaware",
    name: { ko: "천진", en: "Unaware" },
    quiz: { support: "planned", verificationActions: [], unsupportedReason: "유저 랭크업 후 공격하는 검증 행동이 아직 없다." },
    rules: [
      {
        trigger: "before-damage-calculation",
        effects: [{ kind: "ignoreOpponentStatStages" }],
        hintTags: ["stat-stage"],
      },
    ],
  },
  {
    id: "cud-chew",
    name: { ko: "되새김질", en: "Cud Chew" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "열매 소비/재사용 행동이 아직 없다." },
    rules: [
      {
        trigger: "after-using-move",
        conditions: [{ kind: "berryConsumed", value: true }],
        effects: [{ kind: "restoreBerry" }],
        hintTags: ["berry"],
      },
    ],
  },
  {
    id: "armor-tail",
    name: { ko: "테일아머", en: "Armor Tail" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "선공기 사용 검증 행동이 아직 없다." },
    rules: [
      {
        trigger: "before-using-move",
        conditions: [{ kind: "moveHasPriority", value: true }],
        effects: [{ kind: "blockMove", movePriority: "increased" }],
        hintTags: ["priority"],
      },
    ],
  },
  {
    id: "cheek-pouch",
    name: { ko: "볼주머니", en: "Cheek Pouch" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "열매 회복 행동이 아직 없다." },
    rules: [
      {
        trigger: "after-using-move",
        conditions: [{ kind: "berryConsumed", value: true }],
        effects: [{ kind: "recoverHp", source: "berry" }],
        hintTags: ["berry"],
      },
    ],
  },
  {
    id: "gluttony",
    name: { ko: "먹보", en: "Gluttony" },
    quiz: { support: "blocked", verificationActions: [], unsupportedReason: "HP threshold와 열매 소비를 MVP에서 계산하지 않는다." },
    rules: [],
  },
]
