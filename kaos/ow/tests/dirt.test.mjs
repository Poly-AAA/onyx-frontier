import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirtLevel, createDirt } from "../src/dirt.js";
import { save, load, KEY } from "../src/core/save.js";

const cfg = JSON.parse(readFileSync(new URL("../data/dirt.json", import.meta.url)));

test("saleté : 4 paliers selon les seuils", () => {
  const th = cfg.thresholds;
  assert.equal(dirtLevel(0, th), 0);
  assert.equal(dirtLevel(th[0] - 0.01, th), 0);
  assert.equal(dirtLevel(th[0], th), 1);
  assert.equal(dirtLevel(th[1], th), 2);
  assert.equal(dirtLevel(th[2], th), 3);
  assert.equal(dirtLevel(1, th), 3);
});

test("addDirt, hooks walk/combat/work, clean stub, setAll", () => {
  const d = createDirt(null, cfg, null);
  const obj = { userData: { dirt: "character", dirtId: "p" }, traverse() {} };
  d.register(obj, "p", 0);
  assert.equal(d.value(obj), 0);
  d.addDirt(obj, 0.25, "walk");
  assert.ok(d.value(obj) >= 0.25);
  const before = d.value(obj);
  d.walk(obj, 10, "desert");
  assert.ok(d.value(obj) > before);
  d.combat(obj); d.work(obj);
  assert.ok(d.value(obj) <= 1);
  d.clean(obj); // stub : ne change rien
  assert.ok(d.value(obj) > 0);
  d.setAll(1);
  assert.equal(d.value(obj), 1);
  assert.equal(d.level(obj), 3);
  d.setAll(0);
  assert.equal(d.level(obj), 0);
});

test("sauvegarde neofaille.v1 conserve la saleté + .bak", () => {
  const d = createDirt(null, cfg, null);
  const obj = { userData: { dirtId: "player:0" }, traverse() {} };
  d.register(obj, "player:0", 0.42);
  const m = new Map(), st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: () => { throw new Error("interdit"); } };
  save(st, { pm: 4, dirt: d.serialize() });
  save(st, { pm: 5, dirt: { "player:0": 0.9 } });
  assert.equal(JSON.parse(m.get(KEY)).dirt["player:0"], 0.9);
  assert.equal(JSON.parse(m.get(KEY + ".bak")).dirt["player:0"], 0.42);
  const loaded = load(st);
  const d2 = createDirt(null, cfg, loaded.dirt);
  const o2 = { userData: { dirtId: "player:0" }, traverse() {} };
  d2.register(o2, "player:0", loaded.dirt["player:0"]);
  assert.equal(d2.value(o2), 0.9);
});
