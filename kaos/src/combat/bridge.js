/**
 * Pont vers le moteur de règles Neo-Faille (src/core/roguelite.js, copie de creator-pers0na/js/roguelite.js).
 * Réutilisés tels quels : héros (Vie/PV, stats ADN), sorts (catalogue généré + kit), équipement (12 slots, panoplies),
 * rencontre (buildEncounter), résolution de combat (simulateBattle), gains (settleFight), soins (applyHeal).
 * Différence open world : la défaite n'efface pas le personnage (pas de permadeath) -> réveil à la clinique.
 */
import * as R from "../core/roguelite.js";
import { mulberry32 } from "../core/spell-lab.js";
import SPELLS from "../../data/generated-spells.json" with { type: "json" };

export const CATALOG = R.prepareCatalog(SPELLS);

export function newGameState(seed) {
  const state = R.createState(seed >>> 0, CATALOG);
  R.attachCatalog(state, CATALOG);
  R.equipBest(state.hero);
  R.recomputeVitals(state.hero);
  state.hero.pv = state.hero.pvMax;
  state.hero.gold += 40;
  return state;
}

/**
 * Combat contre un PNJ. `foe` = { id, name, levelBonus }. Retourne le rapport + le résultat appliqué.
 */
export function fightNpc(state, foe, seed) {
  const rng = mulberry32(seed >>> 0);
  const hero = state.hero;
  const enc = R.buildEncounter(state, "solo", rng, CATALOG);
  const f = enc.foes[0];
  if (foe) {
    f.name = foe.name;
    const target = Math.max(1, hero.level + (foe.levelBonus | 0));
    while (f.level < target) R.gainXp(f, R.xpNeed(f.level));
    R.recomputeVitals(f); f.pv = f.pvMax;
  }
  const units = R.unitsFromEncounter(hero, enc);
  const report = R.simulateBattle(units.allies, units.foes, { seed: (seed ^ 0x77) >>> 0, trace: true });
  report.foeLevels = enc.foes.map((x) => x.level);
  report.foeName = f.name;
  report.foePvMax = f.pvMax;
  report.heroPvStart = hero.pv;
  let result;
  if (report.winner === "a" && report.playerAlive) {
    result = R.settleFight(state, report, rng);
  } else {
    // défaite open world : on garde le personnage, PV à 1, perte d'une part des kamas
    hero.fights += 1;
    const lost = Math.round((hero.gold | 0) * 0.25);
    hero.gold -= lost;
    hero.pv = 1;
    result = { ok: true, victory: false, lostGold: lost };
  }
  return { report, result };
}

export function heal(state, tier, seed) { return R.applyHeal(state.hero, tier, mulberry32(seed >>> 0)); }
export function healPrice(state, tier) { return R.healPrice(state.hero, tier); }
export function rewardMission(state, reward) {
  const levels = R.gainXp(state.hero, reward.xp | 0);
  state.hero.gold += reward.gold | 0;
  return levels;
}
export const equip = R.equip, unequip = R.unequip, unlockedSpells = R.unlockedSpells, xpNeed = R.xpNeed;
export const SLOTS = R.SLOTS, SLOT_LABEL = R.SLOT_LABEL, STAT_LABEL = R.STAT_LABEL, itemScore = R.itemScore, recomputeVitals = R.recomputeVitals;
