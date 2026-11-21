import test from "node:test";
import assert from "node:assert/strict";
import { createCity } from "../src/world/city.js";
import { findPath } from "../src/world/path.js";
import * as Brain from "../src/ai/npc-brain.js";
import { NPC_DEFS } from "../src/ai/npcs-data.js";
import { generateMission, advance } from "../src/ai/missions.js";
import { sanitizeReply, offlineReply } from "../src/ai/dialogue.js";
import { newGameState, CATALOG } from "../src/combat/bridge.js";
import * as B from "../src/combat/brawl.js";
import { work, train, createCareer } from "../src/life/jobs.js";
import { mulberry32 } from "../src/core/spell-lab.js";
import { createGame, update } from "../src/game.js";

const city = createCity();
test("ville : POI joignables à pied", () => {
  const a = city.poi("place").door;
  for (const p of city.pois) assert.ok(findPath(city, a.x, a.y, p.door.x, p.door.y), p.id);
});
test("PNJ : routine/besoins pilotent le but", () => {
  const n = Brain.createNpc(NPC_DEFS[0], city, mulberry32(1));
  n.needs.faim = 2;
  assert.equal(Brain.chooseGoal(n, { hour: 15, city }).goal, "eat");
  n.needs.faim = 100; n.needs.energie = 100;
  assert.equal(Brain.chooseGoal(n, { hour: 10, city }).goal, "earn");
});
test("PNJ : spectateur d'une baston proche, mémoire bornée", () => {
  const n = Brain.createNpc(NPC_DEFS[0], city, mulberry32(2));
  const s = Brain.scoreGoals(n, { hour: 10, city, brawl: { x: n.x + 3, y: n.y, R: 2.6, fighters: new Set() } });
  assert.ok(s.spectate > s.earn);
  for (let i = 0; i < 30; i++) Brain.remember(n, i, "x", "e" + i);
  assert.ok(n.memory.length <= 10);
});
test("mission : étapes validées dans l'ordre", () => {
  const g = createGame(7);
  const m = generateMission(g.npcs.find((n) => n.id === "rico"), g, mulberry32(3), 1);
  m.status = "acceptee";
  for (const s of m.steps) assert.ok(advance(m, s.kind === "reach" ? { kind: "reach", poi: s.poi } : s.kind === "talk" ? { kind: "talk", npc: s.npc } : { kind: "fightWon", foe: s.foe }));
  assert.equal(m.status, "terminee");
});
test("LLM : réponse validée et bornée, secours offline", () => {
  const r = sanitizeReply('{"say":"Yo","mood":"hack","opinion_delta":99,"action":"rm -rf"}');
  assert.deepEqual([r.mood, r.opinionDelta, r.action], [null, 10, "none"]);
  assert.equal(sanitizeReply("pas du json"), null);
  const n = Brain.createNpc(NPC_DEFS[3], city, mulberry32(4));
  assert.equal(offlineReply(n, "threat", mulberry32(1)).action, "attack");
});
test("baston cercle : 1v1 gagnable, 2v1 dur", () => {
  const run = (k) => { let w = 0; for (let s = 1; s <= 10; s++) { const st = newGameState(42); const foes = []; for (let i = 0; i < k; i++) foes.push({ id: "f" + i, npc: { x: 1, y: i * 0.3 }, hero: B.makeFoe(st, CATALOG, "F", 1, s * 10 + i) });
    const b = B.createBrawl(st, foes, s); const c = { x: 0, y: 0 }; while (!b.over && b.t < 120) { B.tick(b, st, c, 0.1); B.cast(b, st, 0, c); } if (b.result.kind === "victoire") w++; } return w; };
  assert.ok(run(1) >= 7); assert.ok(run(2) <= 4);
});
test("baston : hors du cercle = pas engagé", () => {
  const st = newGameState(1);
  const b = B.createBrawl(st, [{ id: "f", npc: { x: 9, y: 9 }, hero: B.makeFoe(st, CATALOG, "F", 0, 1) }], 1);
  B.tick(b, st, { x: 0, y: 0 }, 0.1);
  assert.equal(b.foes[0].engaged, false);
  assert.equal(B.cast(b, st, 0, { x: 0, y: 0 }).ok, false);
});
test("métiers + entraînement (données v3.7.9)", () => {
  const st = newGameState(5), c = createCareer(mulberry32(1)), g0 = st.hero.gold, f0 = st.hero.base.force;
  assert.ok(work(st, c, "mecano", 2).gold > 0 && st.hero.gold > g0);
  assert.ok(train(st, c, "poids").ok && st.hero.base.force === f0 + 1);
});
test("simulation : 10 min de jeu sans erreur", () => {
  const g = createGame(9);
  for (let i = 0; i < 6000; i++) update(g, 0.1);
  assert.ok(g.npcs.some((n) => n.lastDecision));
});
