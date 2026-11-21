/** État de jeu + boucle de simulation (sans DOM). */
import { createCity } from "./world/city.js";
import { findPath } from "./world/path.js";
import { NPC_DEFS, OFFLINE_LINES } from "./ai/npcs-data.js";
import * as Brain from "./ai/npc-brain.js";
import { generateMission, advance, currentStep } from "./ai/missions.js";
import { newGameState, CATALOG, rewardMission } from "./combat/bridge.js";
import * as Brawl from "./combat/brawl.js";
import { createCareer, comment, offerContract } from "./life/jobs.js";
import { mulberry32 } from "./core/spell-lab.js";

export const SAVE_KEY = "kaos.save.v1";

export function createGame(seed = 435235616) {
  const rng = mulberry32(seed);
  const city = createCity(seed);
  const plaza = city.poi("place");
  const g = {
    seed, rng, city, time: 0, real: 0, day: 1, hour: 20, minute: 0, dpr: 1,
    cam: { x: plaza.door.x, y: plaza.door.y, zoom: 1 },
    player: { x: plaza.door.x - 1, y: plaza.door.y, dir: 4, moving: false, path: [], look: "player" },
    state: newGameState(seed ^ 0xa11ce),
    npcs: NPC_DEFS.map((d) => Brain.createNpc(d, city, rng)),
    missions: [], events: [], toasts: [], petals: [], log: [],
    brawl: null, brawlR: Brawl.RADIUS, phase: "ligue", lastPoi: null, onUi: () => {},
  };
  g.career = createCareer(rng);
  g.npcs.forEach((n, i) => { n.phase = i * 3; });
  ["rico", "doc", "vendor"].forEach((id) => offerFor(g, g.npcs.find((n) => n.id === id)));
  return g;
}

export function toast(g, text, ms = 3000) { g.toasts.push({ text, until: g.real + ms / 1000 }); g.log.push(text); g.onUi("toast"); }
export function npc(g, id) { return g.npcs.find((n) => n.id === id); }
export function clock(g) { return `jour ${g.day}, ${String(g.hour).padStart(2, "0")}h${String(g.minute).padStart(2, "0")}`; }

export function offerFor(g, n) {
  if (!n || n.missionOffer || n.def.gang) return null;
  n.missionOffer = generateMission(n, g, g.rng, g.state.hero.level);
  n.wantsToOffer = true;
  return n.missionOffer;
}

/** Combat de ligue d'ouverture : un adversaire d'une équipe de la Ligue Amateur (career-data v3.7.9), sur la Place. */
export function startLeagueFight(g) {
  const lg = g.career;
  const p = g.player;
  const foeNpc = Brain.createNpc({ id: "rival", name: "Rival des " + (lg.team || "Chardons"), look: "thug", role: "lutteur de ligue", home: "place", work: "place", haunt: "place", traits: { sociable: 0.3, greed: 0.5, aggr: 0.9, brave: 1 }, schedule: [[0, "home"]], persona: "Un lutteur de la Ligue Amateur." }, g.city, g.rng);
  foeNpc.x = p.x + 1.6; foeNpc.y = p.y + 0.4;
  g.npcs.push(foeNpc);
  // le public est déjà autour de la place
  g.npcs.forEach((n, i) => { if (n !== foeNpc) { const a = i / g.npcs.length * Math.PI * 2; n.x = p.x + Math.cos(a) * 4.2; n.y = p.y + Math.sin(a) * 4.2; n.path = []; } });
  toast(g, `${lg.leagueName} — ${lg.arena}. ${lg.presenter} : « Premier combat pour le rookie ! »`, 5000);
  startBrawl(g, [foeNpc], { league: true });
}

export function startBrawl(g, npcs, opts = {}) {
  if (g.brawl && !g.brawl.over) return g.brawl;
  const foes = npcs.map((n, i) => ({ id: n.id, npc: n, hero: Brawl.makeFoe(g.state, CATALOG, n.name, opts.league ? 0 : (n.def.gang ? 1 : 0), (g.seed + g.time * 7 + i) >>> 0) }));
  g.brawl = Brawl.createBrawl(g.state, foes, (g.seed ^ Math.floor(g.time)) >>> 0);
  g.brawl.opts = opts;
  g.brawl.foes.forEach((f) => { f.npc.fighting = true; f.npc.brawlRef = f; f.npc.talking = false; });
  g.events.push({ kind: "violence", x: g.player.x, y: g.player.y, victim: npcs[0].id, victimName: npcs[0].name, t: g.time });
  g.onUi("brawl");
  return g.brawl;
}

function gangJoin(g) {
  // les PNJ du même gang proches se liguent (2v1)
  const b = g.brawl;
  if (!b.foes.some((f) => f.npc.def.gang)) return;
  g.npcs.forEach((n) => {
    if (!n.def.gang || n.fighting || n.ko || !n.alive) return;
    if (Math.hypot(n.x - g.player.x, n.y - g.player.y) < 12) {
      Brawl.join(b, { id: n.id, npc: n, hero: Brawl.makeFoe(g.state, CATALOG, n.name, 1, (g.seed + n.id.length * 99 + g.time) >>> 0) });
      const f = b.foes[b.foes.length - 1]; n.fighting = true; n.brawlRef = f;
      n.bark = "J'arrive, Kross !"; n.barkUntil = g.time + 6;
      toast(g, `${n.name} se ligue contre toi : 2 contre 1 !`);
    }
  });
}

function endBrawl(g) {
  const b = g.brawl, r = b.result, p = g.player;
  b.foes.forEach((f) => {
    const n = f.npc; n.fighting = false; n.brawlRef = null; n.hostile = false;
    if (f.pv <= 0) { n.ko = true; n.koUntil = g.time + 90; }
    Brain.remember(n, g.time, "combat", r.kind === "victoire" ? "le nouveau m'a mis K.O." : "j'ai battu le nouveau", 3);
    n.opinion = Brain.clamp(n.opinion + (r.kind === "victoire" ? -20 : 5), -100, 100);
  });
  if (b.opts.league) {
    if (r.kind === "victoire") g.career.wins++; else g.career.losses++;
    const foe = b.foes[0].hero.name;
    toast(g, comment(r.kind === "victoire" ? "win" : "loss", { who: g.career.presenter, name: g.state.hero.name, foe, result: r.kind === "victoire" ? "Victoire" : "Défaite" }, g.rng), 6000);
    g.npcs = g.npcs.filter((n) => n.id !== "rival");
    const c = offerContract(g.career, g.rng);
    if (c) { g.career.contract = c; toast(g, `Contrat proposé et signé : ${c.name} (${c.perDay} ¥/jour, ${c.days} jours).`, 6000); }
    g.phase = "libre";
    toast(g, "Quartier libre : explore Néo-Faille, trouve un métier, parle aux habitants.", 6000);
  }
  if (r.kind === "victoire") {
    toast(g, `Victoire ! +${r.xp || 0} XP, +${r.gold || 0} ¥${r.levels && r.levels.length ? " — niveau " + g.state.hero.level : ""}`);
    b.foes.forEach((f) => missionEvent(g, { kind: "fightWon", foe: f.id }));
    g.npcs.forEach((n) => { if (b.foes.some((f) => f.id === "brute") && !n.def.gang && Math.hypot(n.x - p.x, n.y - p.y) < 14) n.opinion = Brain.clamp(n.opinion + 8, -100, 100); });
  } else if (r.kind === "defaite") {
    const cl = g.city.poi("clinique");
    p.x = cl.door.x; p.y = cl.door.y; p.path = [];
    toast(g, `K.O. ! Réveil à la Clinique Néon (−${r.lostGold} ¥). La Vie remonte doucement.`, 5000);
  } else toast(g, "Tu as quitté le cercle : baston terminée.");
  g.brawl = null; g.onUi("brawlEnd"); save(g);
}

export function missionEvent(g, ev) {
  g.missions.forEach((m) => {
    if (advance(m, ev)) {
      const s = currentStep(m);
      toast(g, m.status === "terminee" ? `Mission « ${m.title} » : terminée !` : `Mission : ${s.label}`);
      if (m.status === "terminee") {
        const giver = npc(g, m.giver);
        const lv = rewardMission(g.state, m.reward);
        giver.opinion = Brain.clamp(giver.opinion + m.reward.opinion, -100, 100);
        Brain.remember(giver, g.time, "aide", `le nouveau a réglé « ${m.title} »`, 3);
        if (m.target) { const t = npc(g, m.target); t.opinion += m.reward.opinionTarget | 0; }
        toast(g, `+${m.reward.gold} ¥, +${m.reward.xp} XP${lv.length ? " — niveau " + g.state.hero.level + " !" : ""}`);
        m.status = "payee"; giver.activeMissionForYou = null;
      }
    }
  });
}

export function acceptMission(g, n) {
  const m = n.missionOffer; if (!m) return null;
  m.status = "acceptee"; g.missions.push(m);
  n.missionOffer = null; n.wantsToOffer = false; n.activeMissionForYou = m.title;
  // une mission de règlement rend Kross hostile ; la caisse de la Doc est gardée par le gang
  if (m.steps.some((s) => s.kind === "fight")) { const k = npc(g, "brute"); if (k) k.hostile = false; }
  toast(g, `Mission acceptée : ${m.title}`);
  return m;
}

export function movePlayerTo(g, tx, ty) {
  const path = findPath(g.city, g.player.x, g.player.y, tx, ty);
  if (path) g.player.path = path;
  return !!path;
}

export function update(g, dt) {
  dt = Math.min(dt, 0.1);
  g.real += dt;
  const dMin = dt; // 1 s réelle = 1 min de jeu
  g.time += dMin;
  g.minute += dMin;
  while (g.minute >= 60) { g.minute -= 60; g.hour += 1; hourTick(g); }
  if (g.hour >= 24) { g.hour = 0; g.day += 1; dayTick(g); }
  g.minute = Math.floor(g.minute * 100) / 100;
  // joueur
  const p = g.player;
  if (p.path.length) {
    const n = p.path[0], dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy), sp = 3.2 * dt;
    p.dir = Brain.dirOf(dx, dy, p.dir);
    if (d <= sp) { p.x = n.x; p.y = n.y; p.path.shift(); } else { p.x += dx / d * sp; p.y += dy / d * sp; }
    p.moving = true;
  } else p.moving = false;
  g.cam.x += (p.x - g.cam.x) * Math.min(1, dt * 6); g.cam.y += (p.y - g.cam.y) * Math.min(1, dt * 6);
  // POI atteint
  const poi = g.city.poiAt(Math.round(p.x), Math.round(p.y));
  if (poi && poi.id !== g.lastPoi) { g.lastPoi = poi.id; missionEvent(g, { kind: "reach", poi: poi.id }); g.onUi("poi"); }
  if (!poi && g.lastPoi) { g.lastPoi = null; g.onUi("poi"); }
  // baston
  const hero = g.state.hero;
  if (g.brawl) {
    g.brawl.foes.forEach((f) => { // les engagés collent au joueur
      if (f.pv <= 0) { f.npc.ko = true; f.npc.moving = false; return; }
      const n = f.npc, d = Math.hypot(p.x - n.x, p.y - n.y);
      if (d > 1.1) { const sp = 2.4 * dt; n.x += (p.x - n.x) / d * sp; n.y += (p.y - n.y) / d * sp; n.moving = true; n.dir = Brain.dirOf(p.x - n.x, p.y - n.y, n.dir); } else { n.moving = false; n.dir = Brain.dirOf(p.x - n.x, p.y - n.y, n.dir); }
    });
    if (g.real - (g.brawl.joinCheck || 0) > 1) { g.brawl.joinCheck = g.real; gangJoin(g); }
    Brawl.tick(g.brawl, g.state, p, dt);
    if (g.brawl.over) endBrawl(g);
  } else if (hero.pv < hero.pvMax && g.real % 2 < dt) hero.pv = Math.min(hero.pvMax, hero.pv + 1); // régénération lente hors combat
  // PNJ
  const ctx = { city: g.city, hour: g.hour, time: g.time, rng: g.rng, npcs: g.npcs, events: [], player: p, placeName: (poi && poi.name) || "la rue",
    brawl: g.brawl ? { x: p.x, y: p.y, R: g.brawlR, fighters: new Set(g.brawl.foes.map((f) => f.id)) } : null };
  g.thinkAcc = (g.thinkAcc || 0) + dt;
  const doThink = g.thinkAcc > 0.5;
  if (doThink) { ctx.events = g.events.splice(0); g.thinkAcc = 0; }
  g.npcs.forEach((n) => {
    if (n.fighting) return;
    if (doThink) {
      Brain.think(n, ctx);
      if (n.hostile && !g.brawl && Math.hypot(n.x - p.x, n.y - p.y) < 1.8) startBrawl(g, [n]);
      if (g.time - n.lastBarkAt > 25 && g.rng() < 0.08) { const b = Brain.pickBark(n, g.rng, OFFLINE_LINES); if (b) { n.bark = b; n.barkUntil = g.time + 5; n.lastBarkAt = g.time; } }
    }
    Brain.step(n, ctx, dt, dMin);
  });
  // pétales des cerisiers
  if (g.petals.length < 60 && g.rng() < 0.5) {
    const trees = g.city.decor.filter((o) => o.kind.startsWith("sakura") && Math.abs(o.x - p.x) + Math.abs(o.y - p.y) < 14);
    const t = trees[Math.floor(g.rng() * trees.length)];
    if (t) g.petals.push({ x: t.x + g.rng() - 0.5, y: t.y + g.rng() - 0.5, h: 40 + g.rng() * 10, holo: t.kind === "sakura_holo" });
  }
  g.petals.forEach((pt) => { pt.h -= dt * 12; pt.x += dt * 0.3; });
  g.petals = g.petals.filter((pt) => pt.h > 0);
  g.toasts = g.toasts.filter((t) => t.until > g.real);
}

function hourTick(g) {
  // de temps en temps, un PNJ dans le besoin crée une nouvelle demande ; Kross devient hostile si on l'a provoqué
  const cand = g.npcs.filter((n) => !n.missionOffer && !n.def.gang && n.opinion > -30 && !g.missions.some((m) => m.giver === n.id && m.status === "acceptee"));
  if (cand.length && g.rng() < 0.5) offerFor(g, cand[Math.floor(g.rng() * cand.length)]);
  if (g.career.fatigue > 0) g.career.fatigue = Math.max(0, g.career.fatigue - 4);
  if (g.hour % 6 === 0) save(g);
}
function dayTick(g) {
  const c = g.career.contract;
  if (c && c.days > 0) { g.state.hero.gold += c.perDay; c.days -= 1; toast(g, `Sponsor ${c.name} : +${c.perDay} ¥`); }
  g.career.day = g.day;
}

/** Sauvegarde versionnée : écrit d'abord une copie temporaire, puis l'ancienne devient la sauvegarde de secours. */
export function save(g) {
  try {
    if (typeof localStorage === "undefined") return false;
    const data = JSON.stringify({ v: 1, seed: g.seed, time: g.time, day: g.day, hour: g.hour, minute: g.minute, phase: g.phase,
      player: { x: g.player.x, y: g.player.y }, state: { hero: g.state.hero, meta: g.state.meta }, career: g.career, missions: g.missions,
      npcs: g.npcs.map((n) => ({ id: n.id, x: n.x, y: n.y, needs: n.needs, opinion: n.opinion, memory: n.memory, missionOffer: n.missionOffer, activeMissionForYou: n.activeMissionForYou, chat: n.chat })) });
    localStorage.setItem(SAVE_KEY + ".tmp", data);
    const old = localStorage.getItem(SAVE_KEY);
    if (old) localStorage.setItem(SAVE_KEY + ".bak", old);
    localStorage.setItem(SAVE_KEY, data);
    localStorage.removeItem(SAVE_KEY + ".tmp");
    return true;
  } catch (e) { return false; } // quota : on n'écrase rien
}
export function load(g) {
  for (const k of [SAVE_KEY, SAVE_KEY + ".bak"]) {
    try {
      const d = JSON.parse(localStorage.getItem(k) || "null");
      if (!d || d.v !== 1 || !d.state || !d.state.hero) continue;
      Object.assign(g, { time: d.time, day: d.day, hour: d.hour, minute: d.minute, phase: d.phase, career: d.career, missions: d.missions || [] });
      g.player.x = d.player.x; g.player.y = d.player.y; g.cam.x = d.player.x; g.cam.y = d.player.y;
      g.state.hero = d.state.hero; g.state.meta = d.state.meta;
      d.npcs.forEach((s) => { const n = npc(g, s.id); if (n) Object.assign(n, s, { path: [] }); });
      return true;
    } catch (e) { /* essaie la sauvegarde de secours */ }
  }
  return false;
}
