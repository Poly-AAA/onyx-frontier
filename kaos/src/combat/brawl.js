/**
 * Baston temps réel dans un cercle rouge dynamique centré sur le joueur (réf. delinquents.thegame).
 * Pas de ciblage libre : tout ennemi dans le cercle est engagé ; les sorts frappent le plus proche (ou tous si zone).
 * Stats, sorts, Vie et gains viennent du moteur Neo-Faille (roguelite.js). Pur, testable Node.
 */
import * as R from "../core/roguelite.js";
import { mulberry32 } from "../core/spell-lab.js";

export const RADIUS = 2.6;
export const FOE_DMG = 0.85; // réglé : 1v1 gagnable, 2v1 le plus souvent perdu
const STAT = { terre: "force", neutre: "force", feu: "intel", eau: "chance", air: "agi" };

export function makeFoe(state, catalog, name, levelBonus, seed) {
  const enc = R.buildEncounter(state, "solo", mulberry32(seed >>> 0), catalog);
  const f = enc.foes[0];
  f.name = name;
  const target = Math.max(1, state.hero.level + (levelBonus | 0));
  while (f.level < target) R.gainXp(f, R.xpNeed(f.level));
  R.recomputeVitals(f); f.pv = f.pvMax;
  return f;
}

function dmgOf(spell, eff, foeEff, rng) {
  const d = spell.dmg || [3, 5];
  const base = d[0] + Math.floor(rng() * (d[1] - d[0] + 1));
  const st = (eff && eff[STAT[spell.element] || "force"]) || 5;
  const res = (foeEff && foeEff.res && foeEff.res[spell.element]) || 0;
  return Math.max(1, Math.round(base * (1 + st / 60) * (1 - res)));
}

/** hero = state.hero ; foes = [{ id, npc, hero }] */
export function createBrawl(state, foes, seed = 1) {
  const hero = state.hero;
  R.recomputeVitals(hero);
  return {
    rng: mulberry32(seed >>> 0), t: 0, over: false, result: null,
    pa: hero.paMax, shield: 0, autoCd: 0.6, fleeT: 0, log: [],
    spells: R.unlockedSpells(hero),
    foes: foes.map((f) => ({ id: f.id, npc: f.npc, hero: f.hero, pv: f.hero.pv, pvMax: f.hero.pvMax, cd: 1 + Math.random(), spells: R.unlockedSpells(f.hero), engaged: false })),
    stats: { dealt: 0, kills: 0, healed: 0, shielded: 0, casts: 0 },
  };
}

export function join(b, f) {
  if (b.foes.some((x) => x.id === f.id)) return false;
  b.foes.push({ id: f.id, npc: f.npc, hero: f.hero, pv: f.hero.pv, pvMax: f.hero.pvMax, cd: 1.2, spells: R.unlockedSpells(f.hero), engaged: false });
  b.log.push(`${f.hero.name} se joint à la baston !`);
  return true;
}

function nearest(b, center) {
  let best = null, bd = 1e9;
  b.foes.forEach((f) => { if (!f.engaged || f.pv <= 0) return; const d = Math.hypot(f.npc.x - center.x, f.npc.y - center.y); if (d < bd) { bd = d; best = f; } });
  return best;
}

function hitFoe(b, state, f, spell) {
  const v = dmgOf(spell, state.hero.eff, f.hero.eff, b.rng);
  f.pv = Math.max(0, f.pv - v); b.stats.dealt += v;
  b.lastHits = (b.lastHits || []).concat([{ id: f.id, v, t: b.t }]);
  if (f.pv <= 0) { b.stats.kills += 1; b.log.push(`${f.hero.name} est K.O.`); }
}

/** Lance un sort du kit (bouton). Renvoie {ok, reason}. */
export function cast(b, state, i, center) {
  const s = b.spells[i];
  if (!s || b.over) return { ok: false, reason: "sort" };
  if (b.pa < (s.cost | 0)) return { ok: false, reason: "PA" };
  const hero = state.hero;
  if (s.type === "heal") { const v = Math.round(((s.dmg && s.dmg[1]) || 10) * (1 + (hero.eff.chance || 5) / 80)); hero.pv = Math.min(hero.pvMax, hero.pv + v); b.stats.healed += v; }
  else if (s.type === "shield") { const v = (s.dmg && s.dmg[1]) || 8; b.shield += v; b.stats.shielded += v; }
  else {
    const targets = (s.aoe | 0) > 0 ? b.foes.filter((f) => f.engaged && f.pv > 0) : [nearest(b, center)].filter(Boolean);
    if (!targets.length) return { ok: false, reason: "personne dans le cercle" };
    targets.forEach((f) => hitFoe(b, state, f, s));
  }
  b.pa -= s.cost | 0; b.stats.casts += 1;
  b.log.push(`${s.name} !`);
  return { ok: true, spell: s };
}

/** Avance la baston. center = position du joueur (le cercle suit le joueur). */
export function tick(b, state, center, dt) {
  if (b.over) return;
  const hero = state.hero;
  b.t += dt;
  b.pa = Math.min(hero.paMax, b.pa + dt * 0.9);
  let anyNear = false;
  b.foes.forEach((f) => {
    if (f.pv <= 0) { f.engaged = false; return; }
    const d = Math.hypot(f.npc.x - center.x, f.npc.y - center.y);
    f.engaged = d <= RADIUS;
    if (d <= RADIUS * 2.2) anyNear = true;
    if (!f.engaged) return;
    f.cd -= dt;
    if (f.cd <= 0) {
      const sp = f.spells.filter((s) => s.type === "damage");
      const s = sp[Math.floor(b.rng() * sp.length)] || { dmg: [3, 6], element: "neutre" };
      let v = Math.round(dmgOf(s, f.hero.eff, hero.eff, b.rng) * FOE_DMG);
      const absorbed = Math.min(b.shield, v); b.shield -= absorbed; v -= absorbed;
      hero.pv = Math.max(0, hero.pv - v);
      b.lastHits = (b.lastHits || []).concat([{ id: "player", v, t: b.t }]);
      f.cd = 1.5 - Math.min(0.6, (f.hero.eff.ini || 5) / 100) + b.rng() * 0.4;
    }
  });
  // coup de base automatique sur le plus proche engagé
  b.autoCd -= dt;
  const tgt = nearest(b, center);
  if (tgt && b.autoCd <= 0) { hitFoe(b, state, tgt, { dmg: [3, 5], element: "neutre" }); b.autoCd = 1.0; }
  if (b.lastHits) b.lastHits = b.lastHits.filter((h) => b.t - h.t < 0.8);
  b.fleeT = anyNear ? 0 : b.fleeT + dt;
  if (hero.pv <= 0) return end(b, state, "defaite");
  if (b.foes.every((f) => f.pv <= 0)) return end(b, state, "victoire");
  if (b.fleeT > 3) return end(b, state, "fuite");
}

function end(b, state, kind) {
  b.over = true;
  const hero = state.hero;
  if (kind === "victoire") {
    const report = {
      winner: "a", playerAlive: true, playerPv: hero.pv, kills: b.stats.kills, healed: b.stats.healed, shielded: b.stats.shielded,
      combos: 0, fastTurns: 0, style: b.stats.kills * 26 + (b.t < 20 ? 14 : 0), turns: Math.ceil(b.t / 3),
      foeLevels: b.foes.map((f) => f.hero.level), foeItems: b.foes.reduce((a, f) => a.concat(f.hero.items || Object.values(f.hero.equipped || {})), []),
    };
    b.result = Object.assign({ kind }, R.settleFight(state, report, b.rng));
  } else if (kind === "defaite") {
    hero.fights += 1;
    const lost = Math.round((hero.gold | 0) * 0.25);
    hero.gold -= lost; hero.pv = 1;
    b.result = { kind, lostGold: lost }; // pas de permadeath en open world : réveil à la clinique
  } else b.result = { kind };
}
