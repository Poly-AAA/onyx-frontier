import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as G from "../src/core/gen.js";
import { save, load, KEY } from "../src/core/save.js";

const biomes = JSON.parse(readFileSync(new URL("../data/biomes.json", import.meta.url)));
test("morceaux : 500 m, ≈59×59 sur 870 km², 3×3 chargés", () => {
  assert.equal(G.CHUNK, 500); assert.equal(G.MAP_CHUNKS, 59);
  assert.equal(G.chunksAround(250, 250, 1).length, 9);
  assert.deepEqual(G.chunkOf(250, 250), G.CITY_CHUNK);
  const [ox] = G.chunkOrigin(0, 0); assert.equal(G.chunksAround(ox + 10, ox + 10, 1).length, 4); // coin de carte
});
test("déterminisme : même graine = même monde", () => {
  const a = G.chunkHeights(G.createWorldGen(870, biomes), 31, 27, 16), b = G.chunkHeights(G.createWorldGen(870, biomes), 31, 27, 16), c = G.chunkHeights(G.createWorldGen(871, biomes), 31, 27, 16);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  const g = G.createWorldGen(870, biomes);
  assert.equal(g.height(250, 250), 0); // ville à plat
  const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(g.biomeAt(i * 997 - 2e5, i * 613 - 1e5).id);
  assert.ok(seen.size === 3, [...seen].join());
});
test("vitesse = base × (1 + 0,05 × (PM − 4))", () => {
  assert.equal(G.walkSpeed(4, 4), 4); assert.equal(G.walkSpeed(4, 6), 4.4); assert.ok(Math.abs(G.walkSpeed(4, 2) - 3.6) < 1e-9);
});
test("sauvegarde neofaille.v1 + .bak, jamais d'effacement", () => {
  const m = new Map(), st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: () => { throw new Error("interdit"); } };
  save(st, { pm: 4 }); save(st, { pm: 5 });
  assert.equal(JSON.parse(m.get(KEY)).pm, 5); assert.equal(JSON.parse(m.get(KEY + ".bak")).pm, 4);
  m.set(KEY, "{corrompu"); assert.equal(load(st).pm, 4);
});
