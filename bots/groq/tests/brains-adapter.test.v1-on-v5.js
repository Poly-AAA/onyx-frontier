'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../vendor/combat-grid.from-v3.4.1.js');
require('../vendor/dofus-touch-ai.from-v3.4.1.js');
const A = require('../src/brains-adapter.v5.js');

const SPELLS = {
  punch: { id: 'punch', cost: 2, range: 1, dmg: [8, 12] },
  arc: { id: 'arc', cost: 3, range: 5, minRange: 2, dmg: [10, 14], element: 'air', los: true },
  soin: { id: 'soin', cost: 3, range: 3, heal: [8, 12], type: 'heal' },
  zone: { id: 'zone', cost: 4, range: 4, aoe: 1, dmg: [6, 9], element: 'feu' },
};

function makeWorld(overrides) {
  const opts = { gridSize: 14, spellById: (id) => SPELLS[id] || null, seed: 3 };
  const G = { blocks: new Set(), roster: [] };
  G.player = {
    name: 'Hero', c: 1, r: 7, pv: 100, pvMax: 100, pa: 6, paMax: 6,
    pm: 3, pmMax: 3, alive: true, stats: { agi: 10 }, spells: ['punch', 'arc'],
  };
  G.enemy = {
    id: 'boss', name: 'Boss', side: 'b', c: 5, r: 7, pv: 120, pvMax: 120,
    pa: 7, paMax: 7, pm: 4, pmMax: 4, alive: true, stats: { agi: 8 },
    spells: ['punch', 'arc', 'soin', 'zone'],
  };
  G.roster = [G.enemy];
  if (overrides) {
    if (overrides.blocks) G.blocks = new Set(overrides.blocks);
    if (overrides.player) Object.assign(G.player, overrides.player);
    if (overrides.enemy) Object.assign(G.enemy, overrides.enemy);
    if (overrides.roster) G.roster = overrides.roster;
    if (overrides.opts) Object.assign(opts, overrides.opts);
  }
  return { G, opts };
}

test('spell effect mapping', () => {
  const arc = A.toEngineSpell(SPELLS.arc);
  assert.ok(arc, 'arc should map');
  assert.equal(arc.effects[0].effectId, 98);

  const zone = A.toEngineSpell(SPELLS.zone);
  assert.ok(zone, 'zone should map');
  assert.equal(zone.effects[0].effectId, 99);
  assert.equal(zone.effects[0].zoneShape, 'C');
  assert.equal(zone.effects[0].zoneSize, 1);

  const soin = A.toEngineSpell(SPELLS.soin);
  assert.ok(soin, 'soin should map');
  assert.equal(soin.effects[0].effectId, 108);

  const unknown = A.toEngineSpell({ id: 'x', cost: 1, range: 1 });
  assert.equal(unknown, null);
});

test('LoS and range checks', () => {
  const { G, opts } = makeWorld({ blocks: ['3,7'] });
  const rules = A.createRules(G, opts);
  const state = rules.spellCellState({ c: 5, r: 7 }, { c: 1, r: 7 }, SPELLS.arc);
  assert.notEqual(state, 'ok');

  const { G: G2, opts: opts2 } = makeWorld({ blocks: [] });
  const rules2 = A.createRules(G2, opts2);
  const state2 = rules2.spellCellState({ c: 5, r: 7 }, { c: 1, r: 7 }, SPELLS.arc);
  assert.equal(state2, 'ok');

  const { G: G3, opts: opts3 } = makeWorld({ enemy: { c: 7, r: 7 } });
  const rules3 = A.createRules(G3, opts3);
  const state3 = rules3.spellCellState({ c: 7, r: 7 }, { c: 1, r: 7 }, SPELLS.arc);
  assert.notEqual(state3, 'ok');

  const { G: G4, opts: opts4 } = makeWorld({ enemy: { c: 2, r: 7 } });
  const rules4 = A.createRules(G4, opts4);
  const state4 = rules4.spellCellState({ c: 2, r: 7 }, { c: 1, r: 7 }, SPELLS.arc);
  assert.notEqual(state4, 'ok');
});

test('tackle and reachable MP costs', () => {
  const { G, opts } = makeWorld({ enemy: { c: 2, r: 7 } });
  const rules = A.createRules(G, opts);
  const tackle = rules.tackleFor(G.enemy, 2, 7);
  assert.ok(tackle.pm >= 2, `tackle pm should be >= 2, got ${tackle.pm}`);

  const reach = A.reachable(G, G.enemy, opts);
  assert.ok(Array.isArray(reach) && reach.length > 0);
  for (const cell of reach) {
    assert.ok(cell.mpCost <= 4, `mpCost ${cell.mpCost} exceeds 4`);
  }
  const start = reach.find((c) => c.c === 2 && c.r === 7);
  assert.ok(start, 'start cell should be in reachable');
  const neighbors = reach.filter((c) => !(c.c === 2 && c.r === 7));
  for (const n of neighbors) {
    assert.ok(n.mpCost >= 2, `neighbor at ${n.c},${n.r} should cost >= 2 MP, got ${n.mpCost}`);
  }
});

test('reachable avoids blocks and player, paths are adjacent', () => {
  const { G, opts } = makeWorld({ blocks: ['6,7'] });
  const reach = A.reachable(G, G.enemy, opts);
  for (const cell of reach) {
    assert.ok(!(cell.c === 6 && cell.r === 7), '6,7 is blocked');
    assert.ok(!(cell.c === 1 && cell.r === 7), 'player cell occupied');
    for (let i = 1; i < cell.path.length; i++) {
      const a = cell.path[i - 1];
      const b = cell.path[i];
      const d = Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
      assert.equal(d, 1, `path step ${i} not adjacent: ${a.c},${a.r} -> ${b.c},${b.r}`);
    }
  }
});

test('isLegal rejects bad actions', () => {
  const { G, opts } = makeWorld({ enemy: { pa: 1 } });
  const rules = A.createRules(G, opts);
  const badCast = { type: 'cast', spellId: 'arc', target: { c: 1, r: 7 } };
  const res1 = A.isLegal(G, G.enemy, badCast, opts);
  assert.equal(res1.ok, false);

  const { G: G2, opts: opts2 } = makeWorld({});
  const badMove = { type: 'move', path: [{ c: 5, r: 7 }, { c: 7, r: 7 }], to: { c: 7, r: 7 } };
  const res2 = A.isLegal(G2, G2.enemy, badMove, opts2);
  assert.equal(res2.ok, false);

  const { G: G3, opts: opts3 } = makeWorld({ blocks: ['6,7'] });
  const badMove2 = { type: 'move', path: [{ c: 5, r: 7 }, { c: 6, r: 7 }], to: { c: 6, r: 7 } };
  const res3 = A.isLegal(G3, G3.enemy, badMove2, opts3);
  assert.equal(res3.ok, false);
});

test('every brain plays legally', () => {
  const brains = [
    'TACTICAL', 'AGGRESSIVE', 'SUPPORT', 'BLOCKING', 'RUNAWAY', 'LUNATIC',
    'FIXED', 'BOSS_BOUNTY_HUNTER', 'BATTLE_CLERIC', 'TACTICAL_SUPPORT_FOCUS_KILL',
  ];
  for (const brain of brains) {
    const { G, opts } = makeWorld({
      enemy: { c: 9, r: 7 },
      roster: [
        {
          id: 'boss', name: 'Boss', side: 'b', c: 9, r: 7, pv: 120, pvMax: 120,
          pa: 7, paMax: 7, pm: 4, pmMax: 4, alive: true, stats: { agi: 8 },
          spells: ['punch', 'arc', 'soin', 'zone'],
        },
        {
          id: 'm2', name: 'M2', side: 'b', c: 10, r: 9, pv: 20, pvMax: 60,
          pa: 6, paMax: 6, pm: 3, pmMax: 3, alive: true, stats: { agi: 4 },
          spells: ['punch', 'soin'],
        },
      ],
    });
    let totalActions = 0;
    for (let i = 0; i < 3; i++) {
      const result = A.playTurn(G, G.enemy, { ...opts, brain, resetPoints: true });
      for (const rec of result.actions) {
        assert.equal(rec.legal.ok, true, `brain ${brain} turn ${i} action not legal: ${rec.legal.reason}`);
        totalActions++;
      }
      assert.ok(G.enemy.pa >= 0, `brain ${brain} turn ${i} pa negative`);
      assert.ok(G.enemy.pm >= 0, `brain ${brain} turn ${i} pm negative`);
    }
    if (brain !== 'FIXED') {
      assert.ok(totalActions >= 1, `brain ${brain} should produce at least 1 action`);
    }
  }
});

test('AGGRESSIVE ends closer than RUNAWAY', () => {
  function runBrain(brain) {
    const { G, opts } = makeWorld({
      enemy: { c: 9, r: 7 },
      roster: [
        {
          id: 'boss', name: 'Boss', side: 'b', c: 9, r: 7, pv: 120, pvMax: 120,
          pa: 7, paMax: 7, pm: 4, pmMax: 4, alive: true, stats: { agi: 8 },
          spells: ['punch', 'arc', 'soin', 'zone'],
        },
        {
          id: 'm2', name: 'M2', side: 'b', c: 10, r: 9, pv: 20, pvMax: 60,
          pa: 6, paMax: 6, pm: 3, pmMax: 3, alive: true, stats: { agi: 4 },
          spells: ['punch', 'soin'],
        },
      ],
    });
    for (let i = 0; i < 3; i++) {
      A.playTurn(G, G.enemy, { ...opts, brain, resetPoints: true });
    }
    return Math.abs(G.enemy.c - G.player.c) + Math.abs(G.enemy.r - G.player.r);
  }
  const aggDist = runBrain('AGGRESSIVE');
  const runDist = runBrain('RUNAWAY');
  assert.ok(aggDist < runDist, `AGGRESSIVE dist ${aggDist} should be < RUNAWAY dist ${runDist}`);
});

test('determinism with same seed', () => {
  function runLunatic() {
    const { G, opts } = makeWorld({});
    const actions = [];
    for (let i = 0; i < 3; i++) {
      const result = A.playTurn(G, G.enemy, { ...opts, brain: 'LUNATIC', resetPoints: true });
      actions.push(...result.actions);
    }
    return { actions, pv: G.enemy.pv };
  }
  const a = runLunatic();
  const b = runLunatic();
  assert.equal(JSON.stringify(a.actions), JSON.stringify(b.actions));
  assert.equal(a.pv, b.pv);
});

test('composite resolution brain', () => {
  const { G, opts } = makeWorld({ enemy: { c: 9, r: 7 } });
  const decision = A.decideNext(G, G.enemy, { ...opts, brain: 'BOSS_BOUNTY_HUNTER' });
  assert.ok(decision, 'decision should not be null');
  assert.equal(decision.brain, 'BOSS_BOUNTY_HUNTER');
});

test('unsupported actions reported', () => {
  const { G, opts } = makeWorld({ player: { c: 1, r: 7 } });
  const result = A.playTurn(G, G.enemy, { ...opts, brain: 'AGGRESSIVE', resetPoints: true });
  assert.ok(Array.isArray(result.unsupported));
  const hasUnsupported = result.unsupported.some(
    (u) => u === 'teleportNearEnemy' || u === 'attractEnemy'
  );
  assert.ok(hasUnsupported, `expected teleportNearEnemy or attractEnemy in unsupported, got ${JSON.stringify(result.unsupported)}`);
});
