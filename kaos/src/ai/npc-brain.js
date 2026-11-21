/**
 * Cerveau des PNJ (pur, testable sous Node).
 * Boucle : percevoir -> mettre à jour besoins/mémoire/humeur -> choisir un but (utilité + routine) -> agir.
 * Les besoins vont de 0 (manque critique) à 100 (satisfait).
 */
import { findPath } from "../world/path.js";

export const NEEDS = ["faim", "energie", "social", "argent"];
const DECAY = { faim: 0.09, energie: 0.06, social: 0.05, argent: 0.03 }; // par minute de jeu
const MEMORY_MAX = 10;
const PERCEPTION = 6; // tuiles

export function createNpc(def, city, rng) {
  const home = city.poi(def.home);
  const start = home ? home.door : { x: 5, y: 5 };
  return {
    id: def.id, name: def.name, look: def.look, role: def.role, persona: def.persona,
    def, traits: def.traits,
    x: start.x + (rng() - 0.5), y: start.y + (rng() - 0.5), dir: 4, moving: false,
    path: [], goal: null, goalPoi: null, activity: null,
    needs: { faim: 50 + rng() * 40, energie: 50 + rng() * 40, social: 40 + rng() * 40, argent: 30 + rng() * 50 },
    mood: "calme", fear: 0, anger: 0,
    opinion: 0, // -100..100 envers le joueur
    memory: [], // {t, kind, text, weight}
    seenPlayerAt: -999, lastBarkAt: -999, bark: null, barkUntil: 0,
    talking: false, hostile: false, missionId: null, alive: true, ko: false, koUntil: 0,
    thinkAcc: 0, lastDecision: "",
  };
}

export function remember(npc, t, kind, text, weight = 1) {
  npc.memory.push({ t, kind, text, weight });
  if (npc.memory.length > MEMORY_MAX) {
    // oublie le souvenir le moins important (poids * fraîcheur)
    let wi = 0, ws = Infinity;
    npc.memory.forEach((m, i) => { const s = m.weight / (1 + (t - m.t) / 120); if (s < ws) { ws = s; wi = i; } });
    npc.memory.splice(wi, 1);
  }
}

export function memorySummary(npc, now) {
  return npc.memory.slice(-6).map((m) => `- il y a ${Math.max(0, Math.round(now - m.t))} min : ${m.text}`).join("\n");
}

/** Résolution des ancres de routine ("home", "work", "haunt", "food") en POI. */
export function anchorPoi(npc, anchor, city) {
  if (anchor === "food") {
    const opts = ["bar", "marche"];
    return city.poi(opts[(npc.id.charCodeAt(0) + npc.id.length) % 2]);
  }
  return city.poi(npc.def[anchor]);
}

export function scheduleAnchor(def, hour) {
  const s = def.schedule.slice().sort((a, b) => a[0] - b[0]);
  let cur = s[s.length - 1][1];
  for (const [h, a] of s) if (hour >= h) cur = a;
  return cur;
}

/** Scores d'utilité de chaque but candidat. Exporté pour les tests. */
export function scoreGoals(npc, ctx) {
  const n = npc.needs;
  const night = ctx.hour >= 23 || ctx.hour < 6;
  const sched = scheduleAnchor(npc.def, ctx.hour);
  const s = {
    routine: 40,
    eat: (100 - n.faim) * 1.1,
    sleep: (100 - n.energie) * 0.9 + (night ? 35 : 0),
    socialize: (100 - n.social) * 0.8 * (0.5 + npc.traits.sociable),
    earn: (100 - n.argent) * 0.7 * (0.5 + npc.traits.greed),
    approach: 0,
    flee: npc.fear > 40 ? npc.fear * 1.5 : 0,
    confront: npc.hostile ? 120 : 0,
    spectate: 0,
  };
  // baston en cours à proximité : les curieux s'attroupent (les peureux fuient via fear)
  const b = ctx.brawl;
  if (b && !b.fighters.has(npc.id)) {
    const d = Math.hypot(b.x - npc.x, b.y - npc.y);
    if (d < 14) s.spectate = 95 * (0.4 + npc.traits.brave) * (1 - npc.fear / 100);
  }
  // la routine renforce le but prévu à cette heure
  if (sched === "work") s.earn += 25;
  if (sched === "home") s.sleep += 20;
  if (sched === "haunt") s.socialize += 25;
  if (sched === "food") s.eat += 30;
  // veut parler au joueur s'il a une mission à proposer et ne le déteste pas
  const p = ctx.player;
  if (p && npc.wantsToOffer && npc.opinion > -30) {
    const d = Math.hypot(p.x - npc.x, p.y - npc.y);
    if (d < PERCEPTION) s.approach = 70 + (npc.traits.sociable * 30);
  }
  return s;
}

export function chooseGoal(npc, ctx) {
  const s = scoreGoals(npc, ctx);
  let best = "routine", bv = -1;
  Object.keys(s).forEach((k) => { if (s[k] > bv) { bv = s[k]; best = k; } });
  return { goal: best, score: bv, scores: s };
}

function goalTarget(npc, goal, ctx) {
  const city = ctx.city;
  switch (goal) {
    case "eat": return anchorPoi(npc, "food", city);
    case "sleep": return anchorPoi(npc, "home", city);
    case "socialize": return anchorPoi(npc, "haunt", city);
    case "earn": return anchorPoi(npc, "work", city);
    case "routine": return anchorPoi(npc, scheduleAnchor(npc.def, ctx.hour), city);
    case "flee": return anchorPoi(npc, "home", city);
    default: return null;
  }
}

/** Perception : joueur proche, violence vue, autres PNJ. Écrit en mémoire les événements marquants. */
export function perceive(npc, ctx) {
  const p = ctx.player;
  const now = ctx.time;
  if (p) {
    const d = Math.hypot(p.x - npc.x, p.y - npc.y);
    if (d < PERCEPTION && now - npc.seenPlayerAt > 30) {
      npc.seenPlayerAt = now;
      remember(npc, now, "vu", `j'ai croisé le nouveau près de ${ctx.placeName || "la rue"}`, 0.5);
    }
  }
  (ctx.events || []).forEach((ev) => {
    const d = Math.hypot(ev.x - npc.x, ev.y - npc.y);
    if (d > PERCEPTION * 1.5) return;
    if (ev.kind === "violence") {
      const victimIsFriend = ev.victim && ev.victim !== npc.id && npc.def.id !== "brute";
      npc.fear = Math.min(100, npc.fear + 40 * (1 - npc.traits.brave));
      if (victimIsFriend) npc.opinion = clamp(npc.opinion - 8, -100, 100);
      if (ev.victim === "brute" && npc.id !== "brute") npc.opinion = clamp(npc.opinion + 6, -100, 100); // on n'aime pas Kross
      remember(npc, now, "violence", `j'ai vu le nouveau se battre${ev.victimName ? " avec " + ev.victimName : ""}`, 2);
    }
    if (ev.kind === "help" && ev.target === npc.id) {
      npc.opinion = clamp(npc.opinion + 15, -100, 100);
      remember(npc, now, "aide", ev.text || "le nouveau m'a aidé", 3);
    }
  });
  // voisins : la compagnie remplit le besoin social
  (ctx.npcs || []).forEach((o) => {
    if (o === npc || !o.alive) return;
    if (Math.hypot(o.x - npc.x, o.y - npc.y) < 2) npc.needs.social = Math.min(100, npc.needs.social + 0.4);
  });
}

export function updateMood(npc) {
  const worst = Math.min(...NEEDS.map((k) => npc.needs[k]));
  if (npc.fear > 50) npc.mood = "effrayé";
  else if (npc.hostile || npc.anger > 50 || npc.opinion < -40) npc.mood = "énervé";
  else if (npc.opinion < -10 || worst < 15) npc.mood = "méfiant";
  else if (npc.opinion > 30 && worst > 40) npc.mood = "joyeux";
  else npc.mood = "calme";
}

/** Une décision (appelée ~2 fois par seconde réelle). */
export function think(npc, ctx) {
  if (!npc.alive) return;
  if (npc.ko) { if (ctx.time >= npc.koUntil) { npc.ko = false; npc.needs.energie = 40; } else return; }
  perceive(npc, ctx);
  npc.fear = Math.max(0, npc.fear - 0.8);
  npc.anger = Math.max(0, npc.anger - 0.3);
  updateMood(npc);
  if (npc.talking) return;
  const { goal } = chooseGoal(npc, ctx);
  if (goal === "spectate") {
    const b = ctx.brawl;
    if (npc.spectateAngle == null) npc.spectateAngle = ctx.rng() * Math.PI * 2;
    const r = b.R + 1.6;
    const tx = b.x + Math.cos(npc.spectateAngle) * r, ty = b.y + Math.sin(npc.spectateAngle) * r;
    if (npc.goal !== "spectate" || Math.hypot(tx - npc.x, ty - npc.y) > 1.5 && (!npc.path.length || ctx.time - (npc.repathAt || 0) > 2)) {
      npc.path = findPath(ctx.city, npc.x, npc.y, tx, ty) || []; npc.repathAt = ctx.time;
    }
    npc.goal = "spectate"; npc.goalPoi = null; npc.lastDecision = "spectate";
    return;
  }
  npc.spectateAngle = null;
  if (goal === "approach" || goal === "confront") {
    const p = ctx.player;
    const d = Math.hypot(p.x - npc.x, p.y - npc.y);
    npc.goal = goal; npc.goalPoi = null;
    if (d > 1.4 && (!npc.path.length || ctx.time - (npc.repathAt || 0) > 3)) {
      npc.path = findPath(ctx.city, npc.x, npc.y, p.x, p.y) || [];
      npc.repathAt = ctx.time;
    }
    if (d <= 1.6) { npc.path = []; npc.arrivedNearPlayer = true; }
    npc.lastDecision = goal;
    return;
  }
  const poi = goalTarget(npc, goal, ctx);
  if (!poi) return;
  if (npc.goal !== goal || npc.goalPoi !== poi.id) {
    npc.goal = goal; npc.goalPoi = poi.id; npc.activity = null;
    const area = poi.area;
    const tx = area.x0 + Math.floor(ctx.rng() * (area.x1 - area.x0 + 1));
    const ty = area.y0 + Math.floor(ctx.rng() * (area.y1 - area.y0 + 1));
    npc.path = findPath(ctx.city, npc.x, npc.y, tx, ty) || [];
    npc.lastDecision = `${goal} → ${poi.name}`;
  }
}

/** Avance le PNJ et applique les besoins (dtMin = minutes de jeu écoulées, dtSec = secondes réelles). */
export function step(npc, ctx, dtSec, dtMin) {
  if (!npc.alive) return;
  NEEDS.forEach((k) => { npc.needs[k] = Math.max(0, npc.needs[k] - DECAY[k] * dtMin); });
  if (npc.ko || npc.talking) { npc.moving = false; return; }
  const speed = (npc.goal === "flee" ? 3.2 : npc.goal === "confront" ? 2.6 : 1.7) * dtSec;
  if (npc.path.length) {
    const n = npc.path[0];
    const dx = n.x - npc.x, dy = n.y - npc.y;
    const d = Math.hypot(dx, dy);
    npc.dir = dirOf(dx, dy, npc.dir);
    if (d <= speed) { npc.x = n.x; npc.y = n.y; npc.path.shift(); } else { npc.x += dx / d * speed; npc.y += dy / d * speed; }
    npc.moving = true;
    return;
  }
  npc.moving = false;
  // arrivé : l'activité remplit le besoin associé
  const fill = 1.2 * dtMin;
  if (npc.goal === "eat") npc.needs.faim = Math.min(100, npc.needs.faim + fill * 2), npc.needs.argent = Math.max(0, npc.needs.argent - 0.05 * dtMin);
  else if (npc.goal === "sleep") npc.needs.energie = Math.min(100, npc.needs.energie + fill);
  else if (npc.goal === "socialize") npc.needs.social = Math.min(100, npc.needs.social + fill * 0.8);
  else if (npc.goal === "earn") npc.needs.argent = Math.min(100, npc.needs.argent + fill * 0.6);
  else if (npc.goal === "routine") npc.needs.social = Math.min(100, npc.needs.social + fill * 0.2);
  npc.activity = npc.goal;
}

/** Directions écran : 0=N 1=NE 2=E 3=SE 4=S 5=SW 6=W 7=NW (déplacement en tuiles projeté en iso). */
export function dirOf(dx, dy, fallback = 4) {
  const sx = dx - dy, sy = (dx + dy) / 2;
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) return fallback;
  const a = Math.atan2(sx, -sy); // 0 = haut écran
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

/** Petites phrases spontanées (sans LLM) selon besoin/humeur, affichées en bulle. */
export function pickBark(npc, rng, lines) {
  const worst = Object.entries(npc.needs).sort((a, b) => a[1] - b[1])[0];
  if (npc.goal === "spectate") return pickR(rng, ["Baston !", "Vas-y, frappe !", "Ouh, ça va saigner !", "Filmez, filmez !"]);
  if (npc.mood === "effrayé") return pickR(rng, lines.greet["effrayé"]);
  if (worst[1] < 25) return pickR(rng, lines.need[worst[0]]);
  if (npc.wantsToOffer && npc.opinion > -30) return "Hé, toi ! Viens par là.";
  if (rng() < 0.3) return pickR(rng, lines.rumor);
  return null;
}

function pickR(rng, a) { return a[Math.floor(rng() * a.length)]; }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
