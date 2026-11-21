(function(root){
/**
 * DOFUS TOUCH / ARAKNEMU — MOTEUR D'IA TACTIQUE UNIVERSEL & GÉNÉRATEUR DE RENCONTRES ROGUELITE
 * Fichier : /workspace/dofus-touch-extract/npc-ai-engine.js
 *
 * Contient :
 * 1. Le Simulateur d'Utilité de Sorts et Caractéristiques (CastSimulation, SpellScore, Simulator)
 *    et les 26 EffectSimulators officiels d'Araknemu (dégâts élémentaires, vol de vie, soins,
 *    poussée MoveBack + chaîne de collision contre obstacles, retrait PA/PM, armures, états, invocations...).
 * 2. Les 6 Cerveaux d'IA officiels (Tactical, Aggressive, Support, Blocking, Runaway, Lunatic)
 *    + Fixed + Profils Boss Chasseur de Primes.
 * 3. Le Combinateur Multi-Cerveaux `combineBrains([...])` (Pipeline Séquentiel, Machine à États
 *    Conditionnelle selon % PV / PA / PM / Alliés, et Fusion Pondérée par Score d'Utilité).
 * 4. Le Générateur de Rencontres Roguelite (formats aléatoires 1v1, 2v2, 3v3, 5v5, 8v8 ou forcé)
 *    et l'Équilibrage de Difficulté sur 3 Axes (Intelligence progressive, Budget de puissance
 *    symétrique avec Alliés IA à ~90 % du joueur, Paliers de Rangs de Sorts 1..6 & Équipements
 *    visibles droppables).
 *
 * RÈGLE D'OR RESPECTÉE : Module autonome pur ES6, n'exécute aucune boucle ni entraînement au chargement.
 */

const POISON_RATE = 0.75;
const AI_STEP_DELAY_MS = 800;

const ELEMENT = {
  NEUTRAL: "NEUTRAL",
  EARTH: "EARTH",
  FIRE: "FIRE",
  WATER: "WATER",
  AIR: "AIR",
};

const ELEMENT_STAT_KEYS = {
  NEUTRAL: { boost: "strength", percentRes: "resPercentNeutral", fixedRes: "resFixedNeutral", flatDmg: "dmgNeutral" },
  EARTH:   { boost: "strength", percentRes: "resPercentEarth",   fixedRes: "resFixedEarth",   flatDmg: "dmgEarth" },
  FIRE:    { boost: "intelligence", percentRes: "resPercentFire", fixedRes: "resFixedFire",   flatDmg: "dmgFire" },
  WATER:   { boost: "chance",   percentRes: "resPercentWater",   fixedRes: "resFixedWater",   flatDmg: "dmgWater" },
  AIR:     { boost: "agility",  percentRes: "resPercentAir",     fixedRes: "resFixedAir",     flatDmg: "dmgAir" },
};

const SUICIDE_STRATEGY = {
  ALLOW: "ALLOW",
  DENY: "DENY",
  IF_KILL_ENEMY: "IF_KILL_ENEMY",
};

/**
 * Formules mathématiques utilitaires d'Araknemu
 */
const AiFormula = {
  sigmoid(value) {
    if (value === -Infinity) return 0.0;
    if (value === Infinity) return 1.0;
    return 0.5 + value / (2 * (1 + Math.abs(value)));
  },
  capedDuration(duration, maxDuration = 10) {
    if (duration === -1 || duration > maxDuration) return maxDuration;
    return Math.max(duration || 1, 1);
  },
};

/**
 * Résultat d'une simulation de lancer de sort sur une cellule cible (CastSimulation.java)
 */
class CastSimulation {
  constructor(spell, caster, targetCellId) {
    this.spell = spell;
    this.caster = caster;
    this.targetCellId = targetCellId;
    this.mainEnemy = null;
    this.mainAlly = null;

    this.enemiesLife = 0;
    this.alliesLife = 0;
    this.selfLife = 0;
    this.mainEnemyLife = 0;
    this.mainAllyLife = 0;

    this.enemiesBoost = 0;
    this.alliesBoost = 0;
    this.selfBoost = 0;
    this.mainEnemyBoost = 0;
    this.mainAllyBoost = 0;
    this.invocation = 0;

    this.killedAllies = 0;
    this.killedEnemies = 0;
    this.mainEnemyKill = 0;
    this.mainAllyKill = 0;
    this.suicide = 0;

    this.actionPointsModifier = 0;
  }

  suicideProbability() {
    return Math.min(this.suicide, 1.0);
  }

  actionPointsCost() {
    const baseAp = this.spell?.apCost ?? 3;
    return Math.max(baseAp - this.actionPointsModifier, 0.1);
  }

  alterActionPoints(value) {
    this.actionPointsModifier += value;
  }

  addInvocation(score) {
    this.invocation += score;
  }

  cappedProbability(min, max, maxValue) {
    const hi = Math.max(min, max);
    if (min >= maxValue) return 1.0;
    if (hi < maxValue) return 0.0;
    const amplitude = hi - min + 1;
    return amplitude > 0 ? (hi - maxValue) / amplitude : 0.0;
  }

  computeCappedEffect(min, max, maxValue, prob = this.cappedProbability(min, max, maxValue)) {
    const hi = Math.max(min, max);
    if (prob >= 1.0) return maxValue;
    if (prob <= 0.0) return (min + hi) / 2.0;
    const cappedAvg = (min + maxValue) / 2.0;
    return cappedAvg * (1.0 - prob) + maxValue * prob;
  }

  apply({ lifeChange = 0, killProbability = 0, boost = 0 }, target) {
    if (!target) return;
    if (target.id === this.caster.id) {
      this.selfLife += lifeChange;
      this.suicide += killProbability;
      this.selfBoost += boost;
    } else if (target.teamId === this.caster.teamId) {
      this.alliesLife += lifeChange;
      this.killedAllies += killProbability;
      this.alliesBoost += boost;
    } else {
      this.enemiesLife += lifeChange;
      this.killedEnemies += killProbability;
      this.enemiesBoost += boost;
    }

    if (this.mainEnemy && target.id === this.mainEnemy.id) {
      this.mainEnemyLife += lifeChange;
      this.mainEnemyKill += killProbability;
      this.mainEnemyBoost += boost;
    }
    if (this.mainAlly && target.id === this.mainAlly.id) {
      this.mainAllyLife += lifeChange;
      this.mainAllyKill += killProbability;
      this.mainAllyBoost += boost;
    }
  }

  addDamage(min, max, target) {
    const targetLife = Math.max(0, (target.hp ?? 0) + (target.shield ?? 0));
    const killProb = this.cappedProbability(min, max, targetLife);
    const dmg = this.computeCappedEffect(min, max, targetLife, killProb);
    this.apply({ lifeChange: -dmg, killProbability: killProb }, target);
  }

  addPoison(min, max, duration, target) {
    const d = AiFormula.capedDuration(duration);
    const targetLife = Math.max(0, target.hp ?? 0);
    const dmg = this.computeCappedEffect(min * d, Math.max(min, max) * d, targetLife) * POISON_RATE;
    this.apply({ lifeChange: -dmg }, target);
  }

  addHeal(min, max, target) {
    const lostLife = Math.max(0, (target.maxHp ?? target.hp ?? 0) - (target.hp ?? 0));
    const heal = this.computeCappedEffect(min, max, lostLife);
    this.apply({ lifeChange: heal }, target);
  }

  addHealBuff(min, max, duration, target) {
    const d = AiFormula.capedDuration(duration);
    this.addHeal(min, max, target);
    if (d > 1) {
      const avg = (min + Math.max(min, max)) / 2.0;
      this.addBoost(avg * POISON_RATE * (d - 1), target);
    }
  }

  addBoost(value, target) {
    this.apply({ boost: value }, target);
  }

  merge(other, percent) {
    const r = percent / 100.0;
    this.enemiesLife += other.enemiesLife * r;
    this.alliesLife += other.alliesLife * r;
    this.selfLife += other.selfLife * r;
    this.enemiesBoost += other.enemiesBoost * r;
    this.alliesBoost += other.alliesBoost * r;
    this.selfBoost += other.selfBoost * r;
    this.killedAllies += other.killedAllies * r;
    this.killedEnemies += other.killedEnemies * r;
    this.suicide += other.suicide * r;
    this.actionPointsModifier += other.actionPointsModifier * r;
    this.invocation += other.invocation * r;
    this.mainEnemyLife += other.mainEnemyLife * r;
    this.mainEnemyBoost += other.mainEnemyBoost * r;
    this.mainEnemyKill += other.mainEnemyKill * r;
    this.mainAllyLife += other.mainAllyLife * r;
    this.mainAllyBoost += other.mainAllyBoost * r;
    this.mainAllyKill += other.mainAllyKill * r;
  }
}

/**
 * Score théorique d'un sort ou d'une invocation (SpellScore.java)
 */
class SpellScore {
  constructor(attackRange = 0) {
    this.attackRange = attackRange;
    this.damage = 0;
    this.heal = 0;
    this.boost = 0;
    this.debuff = 0;
    this.suicide = false;
  }
  addDamage(v) { this.damage += Math.max(0, v); }
  addHeal(v)   { this.heal += Math.max(0, v); }
  addBoost(v)  { this.boost += Math.max(0, v); }
  addDebuff(v) { this.debuff += Math.max(0, v); }
  setSuicide(s) { this.suicide = Boolean(this.suicide || s); }
  multiply(m) {
    this.damage *= m;
    this.heal *= m;
    this.boost *= m;
    this.debuff *= m;
    return this;
  }
  merge(other) {
    if (other.damage > this.damage) this.damage = other.damage;
    if (other.heal > this.heal) this.heal = other.heal;
    if (other.boost > this.boost) this.boost = other.boost;
    if (other.debuff > this.debuff) this.debuff = other.debuff;
    if (other.attackRange > this.attackRange && other.isAttack()) this.attackRange = other.attackRange;
    this.suicide = Boolean(this.suicide || other.suicide);
  }
  score() { return this.damage + this.heal + this.boost + this.debuff; }
  isAttack() { return this.damage > this.heal; }
  isHeal() { return this.heal > this.damage; }
}

/**
 * Simulateur central d'Araknemu avec les 26 familles d'EffectSimulators pré-enregistrées
 */
class Simulator {
  constructor() {
    this.simulators = new Map();
    this.registerDefaultSimulators();
  }

  register(effectId, sim) {
    this.simulators.set(Number(effectId), sim);
  }

  computeElementalDamageRange(caster, target, minBase, maxBase, elementKey, distanceFromCenter = 0) {
    const cfg = ELEMENT_STAT_KEYS[elementKey] || ELEMENT_STAT_KEYS.NEUTRAL;
    const stats = caster.stats || {};
    const tStats = target.stats || {};

    const elemStat = Math.max(0, stats[cfg.boost] ?? 0);
    const power = Math.max(0, stats.power ?? stats.percentDamage ?? 0);
    const flatDmg = (stats.fixedDamage ?? 0) + (stats[cfg.flatDmg] ?? 0);

    const flatRes = (tStats[cfg.fixedRes] ?? 0) + (target.armorReduction ?? 0);
    const pctRes = Math.min(50, tStats[cfg.percentRes] ?? 0);
    const distMult = Math.pow(0.9, distanceFromCenter);

    const calc = (val) => {
      const boosted = Math.floor(val * (1 + (elemStat + power) / 100)) + flatDmg;
      const reduced = Math.floor((boosted - flatRes) * (1 - pctRes / 100) * distMult);
      return Math.max(0, reduced);
    };

    const reflected = Math.max(0, tStats.counterDamage ?? 0);
    return {
      min: calc(minBase),
      max: calc(Math.max(minBase, maxBase)),
      reflected,
    };
  }

  registerDefaultSimulators() {
    // 1. DamageSimulator (96..100)
    const elemMap = { 96: "WATER", 97: "EARTH", 98: "AIR", 99: "FIRE", 100: "NEUTRAL" };
    for (const [eid, elem] of Object.entries(elemMap)) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          for (const t of targets) {
            const { min, max, reflected } = this.computeElementalDamageRange(sim.caster, t, eff.min, eff.max, elem, t._aoeDist || 0);
            if ((eff.duration || 0) === 0) {
              sim.addDamage(min, max, t);
              if (reflected > 0) sim.addDamage(reflected, reflected, sim.caster);
            } else {
              sim.addPoison(min, max, eff.duration, t);
            }
          }
        },
        score: (s, eff, stats) => {
          const avg = (eff.min + Math.max(eff.min, eff.max)) / 2;
          const boost = Math.max(100 + (stats[ELEMENT_STAT_KEYS[elem].boost] || 0), 100);
          s.addDamage(Math.floor((avg * boost) / 100));
        },
      });
    }

    // 2. StealLifeSimulator (91..95)
    const stealElemMap = { 91: "WATER", 92: "EARTH", 93: "AIR", 94: "FIRE", 95: "NEUTRAL" };
    for (const [eid, elem] of Object.entries(stealElemMap)) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const beforeDmg = -sim.alliesLife - sim.enemiesLife;
          for (const t of targets) {
            const { min, max, reflected } = this.computeElementalDamageRange(sim.caster, t, eff.min, eff.max, elem, t._aoeDist || 0);
            if ((eff.duration || 0) === 0) {
              sim.addDamage(min, max, t);
              if (reflected > 0) sim.addDamage(reflected, reflected, sim.caster);
            } else {
              sim.addPoison(min, max, eff.duration, t);
            }
          }
          const totalDealt = Math.floor(-sim.alliesLife - sim.enemiesLife - beforeDmg);
          if (totalDealt > 0) sim.addHeal(Math.floor(totalDealt / 2), Math.floor(totalDealt / 2), sim.caster);
        },
        score: (s, eff, stats) => {
          const avg = (eff.min + Math.max(eff.min, eff.max)) / 2;
          const boost = Math.max(100 + (stats[ELEMENT_STAT_KEYS[elem].boost] || 0), 100);
          s.addDamage(Math.floor((avg * boost) / 100));
        },
      });
    }

    // 3. PercentLifeDamageSimulator (85..89, 671)
    const pctElemMap = { 85: "WATER", 86: "EARTH", 87: "AIR", 88: "FIRE", 89: "NEUTRAL", 671: "NEUTRAL" };
    for (const [eid, elem] of Object.entries(pctElemMap)) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const curHp = sim.caster.hp ?? 100;
          const bMin = Math.floor((curHp * eff.min) / 100);
          const bMax = Math.floor((curHp * Math.max(eff.min, eff.max)) / 100);
          for (const t of targets) {
            const { min, max } = this.computeElementalDamageRange({ stats: {} }, t, bMin, bMax, elem);
            sim.addDamage(min, max, t);
          }
        },
      });
    }

    // 4. PercentLifeLostDamageSimulator (276, 279 - Punition)
    for (const [eid, elem] of [[276, "EARTH"], [279, "NEUTRAL"]]) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const lost = Math.max(0, (sim.caster.maxHp ?? 100) - (sim.caster.hp ?? 100));
          const bMin = Math.floor((lost * eff.min) / 100);
          const bMax = Math.floor((lost * Math.max(eff.min, eff.max)) / 100);
          for (const t of targets) {
            const { min, max } = this.computeElementalDamageRange({ stats: {} }, t, bMin, bMax, elem);
            sim.addDamage(min, max, t);
          }
        },
      });
    }

    // 5. FixedDamageSimulator (144), FixedStealLifeSimulator (82), FixedCasterDamage (109), KillSimulator (141)
    this.register(144, {
      simulate: (sim, ai, eff, targets) => {
        for (const t of targets) {
          if (!eff.duration) sim.addDamage(eff.min, Math.max(eff.min, eff.max), t);
          else sim.addPoison(eff.min, Math.max(eff.min, eff.max), eff.duration, t);
        }
      },
      score: (s, eff) => s.addDamage(Math.floor((eff.min + Math.max(eff.min, eff.max)) / 2)),
    });

    this.register(82, {
      simulate: (sim, ai, eff, targets) => {
        for (const t of targets) {
          const hi = Math.max(eff.min, eff.max);
          sim.addDamage(eff.min, hi, t);
          sim.addHeal(eff.min, hi, sim.caster);
        }
      },
      score: (s, eff) => s.addDamage(Math.floor((eff.min + Math.max(eff.min, eff.max)) / 2)),
    });

    this.register(109, {
      simulate: (sim, ai, eff) => sim.addDamage(eff.min, Math.max(eff.min, eff.max), sim.caster),
      score: (s, eff) => s.setSuicide(eff.min >= 1000),
    });

    this.register(141, {
      simulate: (sim, ai, eff, targets) => {
        for (const t of targets) sim.addDamage(t.hp, t.hp, t);
      },
    });

    // 6. MoveBackSimulator (5 - Poussée + Dégâts de poussée contre obstacles & chaîne)
    this.register(5, {
      simulate: (sim, ai, eff, targets) => {
        const pushCells = eff.min || 1;
        for (const t of targets) {
          const trace = ai.tracePushback ? ai.tracePushback(sim.caster.cellId, t.cellId, pushCells) : { blockedRemaining: 0, collateralTargets: [] };
          if (trace.blockedRemaining > 0) {
            const lvl = sim.caster.level || 50;
            const doPou = sim.caster.stats?.pushDamage || 0;
            const rePou = t.stats?.pushResistance || 0;
            const pushDmg = Math.max(0, Math.floor((Math.floor(lvl / 2) + doPou - rePou + 32) * (trace.blockedRemaining / 4)));
            sim.addDamage(pushDmg, pushDmg, t);
            trace.collateralTargets.forEach((colTarget, idx) => {
              const chainDmg = Math.floor(pushDmg / Math.pow(2, idx + 1));
              if (chainDmg > 0) sim.addDamage(chainDmg, chainDmg, colTarget);
            });
          }
        }
      },
    });

    // 7. HealSimulator (108), FixedHealSimulator (143), GivePercentLifeSimulator (90)
    this.register(108, {
      simulate: (sim, ai, eff, targets) => {
        const intel = Math.max(0, sim.caster.stats?.intelligence || 0);
        const hBoost = Math.max(0, sim.caster.stats?.healBoost || 0);
        const minH = Math.floor((eff.min * (100 + intel)) / 100) + hBoost;
        const maxH = Math.floor((Math.max(eff.min, eff.max) * (100 + intel)) / 100) + hBoost;
        for (const t of targets) {
          if (!eff.duration) sim.addHeal(minH, maxH, t);
          else sim.addHealBuff(minH, maxH, eff.duration, t);
        }
      },
      score: (s, eff, stats) => {
        const avg = (eff.min + Math.max(eff.min, eff.max)) / 2;
        s.addHeal(Math.floor((avg * Math.max(100 + (stats.intelligence || 0), 100)) / 100));
      },
    });

    this.register(143, {
      simulate: (sim, ai, eff, targets) => {
        for (const t of targets) sim.addHeal(eff.min, Math.max(eff.min, eff.max), t);
      },
      score: (s, eff) => s.addHeal(Math.floor((eff.min + Math.max(eff.min, eff.max)) / 2)),
    });

    this.register(90, {
      simulate: (sim, ai, eff, targets) => {
        const amount = Math.floor(((sim.caster.hp || 100) * eff.min) / 100);
        sim.addDamage(amount, amount, sim.caster);
        for (const t of targets) {
          if (t.id !== sim.caster.id) sim.addHeal(amount, amount, t);
        }
      },
    });

    // 8. AlterActionPointsSimulator (111, 120, 168) & RemovePointsSimulator (101, 127)
    for (const [eid, mult] of [[111, 200], [120, 200], [168, -200]]) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const avg = (eff.min + Math.max(eff.min, eff.max)) / 2;
          const dur = AiFormula.capedDuration(eff.duration);
          for (const t of targets) {
            if (t.id === sim.caster.id) {
              sim.alterActionPoints(mult < 0 ? -avg : avg);
            }
            if ((eff.duration || 0) > 0) sim.addBoost(avg * mult * dur, t);
          }
        },
        score: (s, eff) => {
          const v = Math.floor(((eff.min + Math.max(eff.min, eff.max)) * Math.abs(mult)) / 2);
          if (mult < 0) s.addDebuff(v); else s.addBoost(v);
        },
      });
    }

    for (const [eid, ptKey, resKey] of [[101, "ap", "dodgeAp"], [127, "mp", "dodgeMp"]]) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const casterChance = Math.max(1, Math.floor((sim.caster.stats?.wisdom || 10) / 10));
          const dur = AiFormula.capedDuration(eff.duration);
          const avg = (eff.min + Math.max(eff.min, eff.max)) / 2;
          for (const t of targets) {
            const curPts = t[ptKey] ?? 6;
            if (curPts <= 0) continue;
            const res = Math.max(1, t.stats?.[resKey] || 10);
            const pct = Math.min(1.0, (0.5 * casterChance) / res);
            const val = Math.min(curPts * 200, pct * avg * 200);
            sim.addBoost(-val * dur, t);
          }
        },
        score: (s, eff) => s.addDebuff(Math.floor(((eff.min + Math.max(eff.min, eff.max)) * 200) / 2)),
      });
    }

    // 9. AlterCharacteristicSimulator & StealCharacteristicSimulator
    const charWeights = {
      78: 200, 128: 200, 169: -200, 110: 1, 112: 10, 115: 5, 117: 5, 118: 1, 119: 1,
      122: -5, 123: 1, 124: 1, 125: 1, 126: 1, 138: 2, 176: 20, 178: 8, 210: 5, 211: 5,
      212: 5, 213: 5, 214: 5, 116: -5, 145: -10, 152: -1, 153: -1, 154: -1, 155: -1,
      156: -1, 157: -1, 171: -5, 179: -8, 186: -2, 215: -5, 216: -5, 217: -5, 218: -5, 219: -5,
    };
    for (const [eid, w] of Object.entries(charWeights)) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const avg = (eff.min + Math.max(eff.min, eff.max)) / 2;
          const dur = AiFormula.capedDuration(eff.duration);
          for (const t of targets) sim.addBoost(avg * w * dur, t);
        },
      });
    }

    // 10. Armor (105, 265), Invocations (180, 181, 405), SkipTurn (140), Invisibility (150)
    for (const eid of [105, 265]) {
      this.register(eid, {
        simulate: (sim, ai, eff, targets) => {
          const dur = AiFormula.capedDuration(eff.duration);
          const intel = sim.caster.stats?.intelligence || 0;
          const armor = Math.floor((eff.min * (200 + intel)) / 200);
          for (const t of targets) sim.addBoost(armor * dur * 4, t);
        },
      });
    }

    for (const eid of [180, 181, 405]) {
      this.register(eid, {
        simulate: (sim, ai) => {
          const enemy = ai.getMainEnemy();
          const dist = enemy ? ai.getDistance(sim.targetCellId, enemy.cellId) : 4;
          sim.addInvocation(Math.max(20, (sim.caster.hp || 150) * 0.6 - dist * 5));
        },
      });
    }

    this.register(140, {
      simulate: (sim, ai, eff, targets) => {
        const dur = AiFormula.capedDuration(eff.duration);
        for (const t of targets) sim.addBoost(-1000 * dur, t);
      },
    });

    this.register(150, {
      simulate: (sim, ai, eff, targets) => {
        const dur = AiFormula.capedDuration(eff.duration);
        for (const t of targets) if (!t.hidden) sim.addBoost(100 * dur, t);
      },
    });
  }

  simulateCast(spell, ai, caster, targetCellId) {
    const sim = new CastSimulation(spell, caster, targetCellId);
    sim.mainEnemy = ai.getMainEnemy();
    sim.mainAlly = ai.getMainAlly();

    const effects = spell.effects || [];
    for (const eff of effects) {
      const handler = this.simulators.get(Number(eff.effectId || eff.effect));
      if (!handler) continue;
      const targets = ai.resolveTargetsInZone(caster.cellId, targetCellId, eff.zoneShape || "P", eff.zoneSize || 0)
        .filter((f) => !f.hidden && f.hp > 0);
      handler.simulate(sim, ai, eff, targets);
    }
    return sim;
  }
}

/**
 * Sélecteurs d'actions officiels d'Araknemu (Attack, Boost, Heal, Debuff, Invoke)
 */
const ActionSelectors = {
  attack(suicideStrategy = SUICIDE_STRATEGY.IF_KILL_ENEMY, averageEnemyMaxLife = 300, enemiesCount = 1) {
    return {
      name: "Attack",
      valid(sim) {
        if (sim.enemiesLife >= 0) return false;
        if (sim.killedEnemies >= enemiesCount) return true;
        if (suicideStrategy === SUICIDE_STRATEGY.DENY && sim.suicideProbability() > 0) return false;
        if (suicideStrategy === SUICIDE_STRATEGY.IF_KILL_ENEMY && sim.suicideProbability() > sim.killedEnemies) return false;
        if (sim.mainAllyKill > 0.1) return false;
        if (sim.killedAllies > sim.killedEnemies) return false;
        if (sim.killedEnemies >= 0.99) return true;
        return sim.enemiesLife < sim.alliesLife + sim.selfLife;
      },
      score(sim) {
        const damageScore = -sim.enemiesLife - sim.mainEnemyLife + sim.alliesLife + sim.selfLife * 2;
        const boostScore = Math.min(Math.max(damageScore, 0), (sim.alliesBoost + sim.selfBoost - sim.enemiesBoost) / 10);
        const killRatio = sim.killedEnemies + sim.mainEnemyKill - 1.5 * sim.killedAllies - 2 * sim.suicideProbability();
        const killScore = averageEnemyMaxLife * killRatio;
        return (damageScore + boostScore + killScore) / sim.actionPointsCost();
      },
    };
  },

  boostSelf() {
    return this.boost(2.0, 1.0, 2);
  },

  boostAllies() {
    return this.boost(0.5, 2.0, 1);
  },

  boost(selfBoostRate, alliesBoostRate, minDuration) {
    return {
      name: "Boost",
      valid(sim) {
        if (sim.suicideProbability() > 0 || sim.killedAllies > 0) return false;
        const hasValidDuration = (sim.spell.effects || []).some((e) => e.duration === -1 || (e.duration || 0) >= minDuration);
        if (!hasValidDuration) return false;
        const totalBoost = sim.alliesBoost + sim.selfBoost;
        return totalBoost > 0 && totalBoost + sim.alliesLife + sim.selfLife > 0;
      },
      score(sim) {
        let score = sim.alliesBoost * alliesBoostRate + sim.mainAllyBoost * alliesBoostRate + sim.selfBoost * selfBoostRate - sim.enemiesBoost;
        if (sim.alliesLife < 0) score += sim.alliesLife;
        if (sim.selfLife < 0) score += sim.selfLife;
        return score / sim.actionPointsCost();
      },
    };
  },

  heal() {
    return {
      name: "Heal",
      valid(sim) {
        const healDone = sim.alliesLife + sim.selfLife;
        if (healDone <= 0 || sim.killedAllies > 0.1 || sim.suicideProbability() > 0.1) return false;
        return healDone > sim.enemiesLife;
      },
      score(sim) {
        const healScore = sim.alliesLife + sim.mainAllyLife + sim.selfLife - sim.enemiesLife;
        const boostScore = (sim.alliesBoost + sim.selfBoost - sim.enemiesBoost) / 10;
        return (healScore + boostScore) / sim.actionPointsCost();
      },
    };
  },

  debuff() {
    return {
      name: "Debuff",
      valid(sim) {
        if (sim.suicideProbability() > 0 || sim.killedAllies > 0 || sim.enemiesBoost >= 0) return false;
        return sim.enemiesBoost < sim.alliesBoost + sim.selfBoost;
      },
      score(sim) {
        return (-sim.enemiesBoost - sim.mainEnemyBoost + sim.alliesBoost + sim.selfBoost) / sim.actionPointsCost();
      },
    };
  },

  invoke(teamLifeRatio = 1.0, mainEnemyMaxLife = 300) {
    return {
      name: "Invoke",
      valid(sim) {
        return sim.invocation > 0 && sim.killedAllies === 0 && sim.suicideProbability() === 0;
      },
      score(sim) {
        let score = sim.invocation;
        if (sim.killedEnemies >= 0.99) score += mainEnemyMaxLife;
        score += (2 - teamLifeRatio) * (sim.alliesLife + sim.selfLife);
        score -= sim.enemiesLife;
        return score / sim.actionPointsCost();
      },
    };
  },

  lunatic(targetAllies = false) {
    return {
      name: "Lunatic",
      valid(sim) {
        return this.score(sim) > 0;
      },
      score(sim) {
        const alliesScore = sim.alliesBoost + sim.alliesLife - 100 * sim.killedAllies;
        const enemiesScore = sim.enemiesBoost + sim.enemiesLife - 100 * sim.killedEnemies;
        const selfScore = sim.selfBoost + sim.selfLife - 100 * sim.suicideProbability() + sim.invocation;
        const baseScore = targetAllies
          ? -alliesScore + enemiesScore + selfScore
          : alliesScore - enemiesScore + selfScore;
        return baseScore / sim.actionPointsCost();
      },
    };
  },
};

/**
 * Définition des 6 Cerveaux d'IA d'Araknemu + Cerveaux composites
 */
const BRAIN_PIPELINES = {
  TACTICAL: [
    { type: "cast", selector: "boostSelf" },
    { type: "moveToCast", selector: "attack", strategy: "bestTarget" },
    { type: "cast", selector: "attack" },
    { type: "when", condition: (ai) => ai.getLifePercent() <= 50, success: [{ type: "cast", selector: "heal" }], otherwise: [] },
    { type: "cast", selector: "invoke" },
    { type: "cast", selector: "debuff" },
    { type: "cast", selector: "boostAllies" },
    { type: "cast", selector: "heal" },
    {
      type: "when",
      condition: (ai) => ai.hasEnemyInRange(),
      success: [{ type: "moveFarEnemies" }],
      otherwise: [{ type: "moveNearEnemy" }, { type: "teleportNearEnemy" }],
    },
  ],

  AGGRESSIVE: [
    { type: "cast", selector: "boostSelf" },
    { type: "moveToCast", selector: "attack", strategy: "bestTarget" },
    { type: "cast", selector: "attack" },
    { type: "attractEnemy" },
    { type: "moveNearEnemy" },
    { type: "teleportNearEnemy" },
    { type: "cast", selector: "invoke" },
    { type: "cast", selector: "boostAllies" },
    { type: "cast", selector: "heal" },
  ],

  SUPPORT: [
    {
      type: "when",
      condition: (ai) => ai.hasAllies(),
      success: [
        { type: "moveToCast", selector: "boostAllies", strategy: "bestTarget" },
        { type: "cast", selector: "boostAllies" },
        { type: "cast", selector: "heal" },
        { type: "cast", selector: "invoke" },
        { type: "cast", selector: "debuff" },
        { type: "cast", selector: "attack" },
        { type: "moveNearAllies" },
      ],
      otherwise: "TACTICAL",
    },
  ],

  BLOCKING: [
    { type: "blockNearestEnemy" },
  ],

  RUNAWAY: [
    { type: "cast", selector: "boostSelf" },
    { type: "cast", selector: "attack" },
    { type: "cast", selector: "invoke" },
    { type: "moveToCast", selector: "attack", strategy: "nearest" },
    { type: "cast", selector: "attack" },
    { type: "cast", selector: "boostAllies" },
    {
      type: "when",
      condition: (ai) => Boolean(ai.memory.lastCast),
      success: [{ type: "moveFarEnemies" }],
      otherwise: [{ type: "moveNearEnemy" }],
    },
  ],

  LUNATIC: [
    {
      type: "when",
      condition: (ai) => Boolean(ai.memory.targetAllies),
      success: [
        { type: "moveToCast", selector: "lunaticAllies", strategy: "bestTarget" },
        { type: "cast", selector: "lunaticAllies" },
        { type: "moveNearAllies" },
      ],
      otherwise: [
        { type: "moveToCast", selector: "lunaticEnemies", strategy: "bestTarget" },
        { type: "cast", selector: "lunaticEnemies" },
        { type: "moveNearEnemy" },
      ],
    },
  ],

  FIXED: [
    { type: "cast", selector: "attack" },
  ],
};

/**
 * Combinateur Multi-Cerveaux `combineBrains([...])`
 * Permet de combiner 2, 3 ou N cerveaux en :
 * - mode "pipeline" (GeneratorAggregate / ChainAiFactory)
 * - mode "conditional" (ConditionalGenerator selon % PV / PA / PM / alliés)
 * - mode "utility_fusion" (pondération des scores d'utilité de plusieurs cerveaux)
 */
function combineBrains(config) {
  const { mode = "pipeline", brains = ["TACTICAL", "SUPPORT"], rules = [], weights = {} } = config;

  if (mode === "conditional") {
    return {
      name: config.name || "COMPOSITE_CONDITIONAL",
      mode: "conditional",
      evaluatePipeline(ai) {
        for (const rule of rules) {
          if (rule.when(ai)) {
            return Array.isArray(rule.useBrain)
              ? rule.useBrain.flatMap((b) => BRAIN_PIPELINES[b] || [])
              : BRAIN_PIPELINES[rule.useBrain] || BRAIN_PIPELINES.TACTICAL;
          }
        }
        return BRAIN_PIPELINES[brains[0]] || BRAIN_PIPELINES.TACTICAL;
      },
    };
  }

  if (mode === "utility_fusion") {
    return {
      name: config.name || "COMPOSITE_UTILITY_FUSION",
      mode: "utility_fusion",
      weights,
      scoreSimulation(sim, context) {
        const atk = ActionSelectors.attack(SUICIDE_STRATEGY.IF_KILL_ENEMY, context.avgEnemyHp, context.enemiesCount).score(sim);
        const sup = ActionSelectors.heal().score(sim) + ActionSelectors.boostAllies().score(sim);
        const deb = ActionSelectors.debuff().score(sim);
        return (
          (weights.AGGRESSIVE || 0.5) * Math.max(0, atk) +
          (weights.SUPPORT || 0.3) * Math.max(0, sup) +
          (weights.TACTICAL || 0.2) * Math.max(0, deb)
        );
      },
    };
  }

  // Default: mode === "pipeline" (GeneratorAggregate)
  return {
    name: config.name || `PIPELINE_${brains.join("_")}`,
    mode: "pipeline",
    evaluatePipeline() {
      return brains.flatMap((b) => BRAIN_PIPELINES[b] || []);
    },
  };
}

/**
 * Préréglages de Cerveaux Combinés prêts à l'emploi (Boss / Élite / Alliés)
 */
const COMPOSITE_BRAINS = {
  BOSS_BOUNTY_HUNTER: combineBrains({
    name: "BOSS_BOUNTY_HUNTER",
    mode: "conditional",
    rules: [
      { when: (ai) => ai.getLifePercent() > 65, useBrain: "AGGRESSIVE" },
      { when: (ai) => ai.getLifePercent() >= 30, useBrain: ["TACTICAL", "SUPPORT"] },
      { when: () => true, useBrain: ["SUPPORT", "RUNAWAY"] },
    ],
  }),
  BATTLE_CLERIC: combineBrains({
    name: "BATTLE_CLERIC",
    mode: "pipeline",
    brains: ["SUPPORT", "TACTICAL"],
  }),
  TACTICAL_SUPPORT_FOCUS_KILL: combineBrains({
    name: "TACTICAL_SUPPORT_FOCUS_KILL",
    mode: "utility_fusion",
    weights: { AGGRESSIVE: 0.5, SUPPORT: 0.3, TACTICAL: 0.2 },
  }),
};

/**
 * Générateur de Rencontres Roguelite (1v1 à 8v8 aléatoire ou forcé) & Scaling sur 3 Axes
 */
function generateRogueliteEncounter({
  waveNumber = 1,
  playerPower = 100,
  playerLevel = 50,
  forcedFormat = null,
  isBossWave = false,
  rng = Math.random,
} = {}) {
  // 1. Tirage aléatoire du format entre 1v1 et Multi (ou format forcé pour test)
  const formatTable = [
    { id: "1v1", teamSize: 1, weight: waveNumber <= 3 ? 40 : 20 },
    { id: "2v2", teamSize: 2, weight: waveNumber <= 3 ? 30 : 25 },
    { id: "3v3", teamSize: 3, weight: waveNumber <= 3 ? 20 : 30 },
    { id: "5v5", teamSize: 5, weight: waveNumber <= 3 ? 8  : 15 },
    { id: "8v8", teamSize: 8, weight: waveNumber <= 3 ? 2  : 10 },
  ];

  let selectedFormat = formatTable.find((f) => f.id === forcedFormat);
  if (!selectedFormat) {
    const totalWeight = formatTable.reduce((acc, f) => acc + f.weight, 0);
    let roll = rng() * totalWeight;
    for (const f of formatTable) {
      roll -= f.weight;
      if (roll <= 0) {
        selectedFormat = f;
        break;
      }
    }
    selectedFormat = selectedFormat || formatTable[0];
  }

  const teamSize = selectedFormat.teamSize;
  const alliesCount = teamSize - 1;
  const enemiesCount = teamSize;

  // 2. Axe 1 — Intelligence progressive des cerveaux d'IA
  let enemyBrainPool;
  if (waveNumber <= 3 && !isBossWave) {
    enemyBrainPool = ["AGGRESSIVE", "RUNAWAY", "LUNATIC"];
  } else if (waveNumber <= 7 && !isBossWave) {
    enemyBrainPool = ["TACTICAL", "SUPPORT", "BLOCKING", "AGGRESSIVE"];
  } else {
    enemyBrainPool = ["BOSS_BOUNTY_HUNTER", "BATTLE_CLERIC", "TACTICAL_SUPPORT_FOCUS_KILL", "TACTICAL"];
  }

  // 3. Axe 2 — Budget de puissance symétrique en Multi (Alliés à ~90 % du joueur)
  const allyBudgetEach = Math.round(playerPower * 0.9);
  const totalPlayerTeamPower = playerPower + alliesCount * allyBudgetEach;
  const waveMultiplier = 0.85 + 0.08 * (waveNumber - 1) + (isBossWave ? 0.2 : 0.0);
  const totalEnemyTeamBudget = Math.round(totalPlayerTeamPower * waveMultiplier);
  const enemyBudgetEach = Math.round(totalEnemyTeamBudget / enemiesCount);

  // 4. Axe 3 — Paliers de Rangs de Sorts Dofus (1 à 6) & Équipements visibles droppables
  const spellRank = Math.min(6, 1 + Math.floor((waveNumber - 1) / 2));

  const allies = Array.from({ length: alliesCount }, (_, idx) => ({
    id: `ally_${idx + 1}`,
    role: idx === 0 && alliesCount >= 1 ? "SUPPORT_TACTICAL" : "TACTICAL",
    brain: idx === 0 ? "BATTLE_CLERIC" : "TACTICAL",
    powerBudget: allyBudgetEach,
    spellRank,
    followsMainAllyPlayer: true,
  }));

  const enemies = Array.from({ length: enemiesCount }, (_, idx) => {
    const isLeader = idx === 0 && (isBossWave || enemiesCount >= 3);
    const brain = isLeader && isBossWave
      ? "BOSS_BOUNTY_HUNTER"
      : enemyBrainPool[idx % enemyBrainPool.length];
    return {
      id: `enemy_${idx + 1}`,
      isLeader,
      brain,
      powerBudget: Math.round(enemyBudgetEach * (isLeader ? 1.15 : 0.95)),
      spellRank,
      dropsVisibleEquippedItems: true,
    };
  });

  return {
    waveNumber,
    format: selectedFormat.id,
    teamSize,
    spellRank,
    powerBudgets: {
      playerPower,
      allyBudgetEach,
      totalPlayerTeamPower,
      waveMultiplier: Number(waveMultiplier.toFixed(2)),
      totalEnemyTeamBudget,
      enemyBudgetEach,
    },
    allies,
    enemies,
  };
}

  const origCombineBrains = combineBrains;
  function combineBrainsFlexible(a, b) {
    if (Array.isArray(a)) {
      return origCombineBrains(Object.assign({ brains: a, mode: "pipeline" }, b || {}));
    }
    return origCombineBrains(a || {});
  }
  root.DofusTouchAI = {
    AI_BRAINS: BRAIN_PIPELINES,
    BRAIN_PIPELINES: BRAIN_PIPELINES,
    COMPOSITE_BRAINS: COMPOSITE_BRAINS,
    ActionSelectors: ActionSelectors,
    AiFormula: AiFormula,
    CastSimulation: CastSimulation,
    SpellScore: SpellScore,
    Simulator: Simulator,
    combineBrains: combineBrainsFlexible,
    generateRogueliteEncounter: generateRogueliteEncounter
  };
})(typeof window !== "undefined" ? window : globalThis);
