(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeoFailleBrainsAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  /** @type {string} */
  const VERSION = '1';

  /** Mapping from v3.4.1 effect to AI effectId */
  const SPELL_EFFECT_MAP = {
    dmg: { eau: 96, terre: 97, air: 98, feu: 99, neutre: 100 },
    heal: 108,
    shield: 105,
    push: 5,
    mp_loss: 127,
    ap_loss: 101,
    drainPA: 101
  };

  /** Mulberry32 PRNG */
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = a + 0x6d2b79f5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /** Convert entity to AI fighter */
  function toFighter(ent) {
    return {
      id: ent.id || ent.name,
      ent,
      cellId: cellIdOf(ent.c, ent.r),
      hp: ent.pv,
      maxHp: ent.pvMax,
      shield: ent.shield | 0,
      hidden: (ent.invis | 0) > 0,
      ap: ent.pa,
      mp: ent.pm,
      level: ent.level || 1,
      stats: Object.assign({}, ent.stats, { agility: ent.stats && ent.stats.agi })
    };
  }

  /** Convert v3.4.1 spell to AI engine spell */
  function toEngineSpell(sp, ent) {
    if (!sp) return null;
    const effects = [];
    const dmgId = SPELL_EFFECT_MAP.dmg[sp.element] || SPELL_EFFECT_MAP.dmg.neutre;
    if (sp.dmg && sp.dmg.length) {
      effects.push({
        effectId: dmgId,
        min: sp.dmg[0],
        max: sp.dmg[1],
        zoneShape: sp.aoe > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
        duration: 0
      });
    }
    if (sp.heal && sp.heal.length) {
      const cap = Math.max(4, Math.round(ent.pvMax * 0.12));
      effects.push({
        effectId: SPELL_EFFECT_MAP.heal,
        min: cap,
        max: cap,
        zoneShape: sp.aoe > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
        duration: 0
      });
    }
    if (sp.type === 'shield') {
      const cap = Math.max(4, Math.round(ent.pvMax * 0.12));
      effects.push({
        effectId: SPELL_EFFECT_MAP.shield,
        min: cap,
        max: cap,
        zoneShape: 'P',
        zoneSize: 0,
        duration: 1
      });
    }
    if (sp.effect === 'push') {
      effects.push({
        effectId: SPELL_EFFECT_MAP.push,
        min: 1,
        max: 1,
        zoneShape: 'P',
        zoneSize: 0,
        duration: 0
      });
    }
    if (sp.effect === 'mp_loss') {
      effects.push({
        effectId: SPELL_EFFECT_MAP.mp_loss,
        min: 1,
        max: 1,
        zoneShape: 'P',
        zoneSize: 0,
        duration: 1
      });
    }
    if (sp.effect === 'ap_loss' || sp.effect === 'drainPA') {
      effects.push({
        effectId: SPELL_EFFECT_MAP.ap_loss,
        min: 1,
        max: 1,
        zoneShape: 'P',
        zoneSize: 0,
        duration: 1
      });
    }
    if (!effects.length) return null;
    return {
      id: sp.id,
      apCost: Math.max(1, sp.cost | 0),
      effects
    };
  }

  /** Helper: cell key */
  function key(c, r) {
    return c + ',' + r;
  }

  /** Convert (c,r) to cellId */
  function cellIdOf(c, r) {
    return r * (opts.gridSize || 10) + c;
  }

  /** Convert cellId to {c,r} */
  function cellToCR(id, gridSize) {
    const g = gridSize || 10;
    return { c: id % g, r: Math.floor(id / g) };
  }

  /** Create rule functions bound to G */
  function createRules(G, opts) {
    const GRID = opts.grid || root.CombatGrid;
    if (!GRID) throw new Error('CombatGrid missing');
    const gridSize = opts.gridSize || 10;

    function inBounds(c, r) {
      return c >= 0 && r >= 0 && c < gridSize && r < gridSize;
    }

    function occupied(c, r, skip) {
      if (G.blocks && G.blocks.has(key(c, r))) return 'block';
      if (G.player && G.player.alive && skip !== 'player' && G.player.c === c && G.player.r === r) return 'player';
      if (G.enemy && G.enemy.alive && skip !== 'enemy' && G.enemy.c === c && G.enemy.r === r) return 'enemy';
      if (G.clone && G.clone.alive && skip !== 'clone' && G.clone.c === c && G.clone.r === r) return 'clone';
      if (skip === 'pawn') return null;
      for (const p of G.roster || []) {
        if (!p.alive || p === G.enemy) continue;
        if (p.c === c && p.r === r) return p.side === 'b' ? 'enemy' : 'ally';
      }
      return null;
    }

    function dist(a, b) {
      return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
    }

    function unitSide(ent) {
      if (!ent || ent === G.player || ent === G.clone) return 'a';
      return ent.side || 'b';
    }

    function agiOf(ent) {
      const n = ent && ent.stats && ent.stats.agi;
      return Math.max(1, (n == null ? 5 : n) | 0);
    }

    function foeAgisAt(c, r, ent) {
      const side = unitSide(ent);
      const out = [];
      const list = [];
      if (G.player && G.player !== ent && G.player.alive) list.push(G.player);
      if (G.clone && G.clone !== ent && G.clone.alive) list.push(G.clone);
      if (G.enemy && G.enemy !== ent && G.enemy.alive) list.push(G.enemy);
      (G.roster || []).forEach(p => {
        if (p && p !== ent && p !== G.enemy && p.alive) list.push(p);
      });
      list.forEach(u => {
        if (unitSide(u) === side) return;
        if (Math.abs(u.c - c) + Math.abs(u.r - r) === 1) out.push(agiOf(u));
      });
      return out;
    }

    function tackleFor(ent, c, r) {
      const myAgi = agiOf(ent);
      const foes = foeAgisAt(c, r, ent);
      return GRID.tackleCost(myAgi, foes);
    }

    function losBlock(c, r) {
      if (!inBounds(c, r)) return true;
      if (G.blocks && G.blocks.has(key(c, r))) return true;
      return !!occupied(c, r);
    }

    function spellGeom(sp) {
      const min = sp.minRange == null ? 0 : Math.max(0, sp.minRange | 0);
      const max = Math.max(0, sp.range | 0);
      const line = !!sp.line;
      const los = sp.los !== false && !(sp.self === true || max === 0);
      return { min, max, line, los };
    }

    function spellCellState(from, to, sp) {
      const geom = spellGeom(sp);
      const blocked = (c, r) => losBlock(c, r);
      return GRID.spellReach(geom, from, to, blocked);
    }

    function livingUnits() {
      const arr = [];
      if (G.player && G.player.alive) arr.push(G.player);
      if (G.clone && G.clone.alive) arr.push(G.clone);
      if (G.enemy && G.enemy.alive) arr.push(G.enemy);
      (G.roster || []).forEach(p => {
        if (p && p.alive && p !== G.enemy) arr.push(p);
      });
      return arr;
    }

    function enemiesOf(ent) {
      const side = unitSide(ent);
      return livingUnits().filter(u => unitSide(u) !== side);
    }

    function alliesOf(ent) {
      const side = unitSide(ent);
      return livingUnits().filter(u => unitSide(u) === side && u !== ent);
    }

    return {
      inBounds,
      occupied,
      dist,
      unitSide,
      agiOf,
      foeAgisAt,
      tackleFor,
      losBlock,
      spellGeom,
      spellCellState,
      livingUnits,
      enemiesOf,
      alliesOf,
      gridSize
    };
  }

  /** Create AI context */
  function createContext(G, ent, opts) {
    const rules = createRules(G, opts);
    const fighter = toFighter(ent);
    const memory = { lastCast: null, targetAllies: false };
    return {
      G,
      ent,
      opts,
      fighter,
      memory,
      getMainEnemy() {
        const enemies = rules.enemiesOf(ent);
        if (!enemies.length) return null;
        const main = enemies.reduce((best, cur) => {
          const dCur = rules.dist(ent, cur);
          const dBest = rules.dist(ent, best);
          if (dCur < dBest) return cur;
          if (dCur === dBest && cur.pv < best.pv) return cur;
          return best;
        }, enemies[0]);
        return toFighter(main);
      },
      getMainAlly() {
        return null;
      },
      getDistance(a, b) {
        const ca = cellToCR(a, rules.gridSize);
        const cb = cellToCR(b, rules.gridSize);
        return Math.abs(ca.c - cb.c) + Math.abs(ca.r - cb.r);
      },
      resolveTargetsInZone(casterCellId, targetCellId, shape, size) {
        const caster = cellToCR(casterCellId, rules.gridSize);
        const target = cellToCR(targetCellId, rules.gridSize);
        const units = rules.livingUnits();
        const res = [];
        units.forEach(u => {
          const pos = { c: u.c, r: u.r };
          let inZone = false;
          if (shape === 'P') {
            inZone = pos.c === target.c && pos.r === target.r;
          } else {
            const d = Math.abs(pos.c - target.c) + Math.abs(pos.r - target.r);
            inZone = d <= size;
          }
          if (inZone) {
            const f = toFighter(u);
            f._aoeDist = Math.abs(pos.c - target.c) + Math.abs(pos.r - target.r);
            res.push(f);
          }
        });
        return res;
      },
      getLifePercent() {
        return (ent.pv / ent.pvMax) * 100;
      },
      hasAllies() {
        return rules.alliesOf(ent).length > 0;
      },
      hasEnemyInRange() {
        const spells = (ent.spells || []).map(id => opts.spellById(id, ent)).filter(Boolean);
        const enemies = rules.enemiesOf(ent);
        for (const sp of spells) {
          for (const e of enemies) {
            const state = rules.spellCellState(ent, e, sp);
            if (state === 'ok') return true;
          }
        }
        return false;
      }
    };
  }

  /** BFS reachable cells */
  function reachable(G, ent, opts) {
    const rules = createRules(G, opts);
    const start = { c: ent.c, r: ent.r };
    const queue = [{ c: start.c, r: start.r, mp: ent.pm, ap: ent.pa, path: [] }];
    const visited = new Set([key(start.c, start.r)]);
    const results = [{ c: start.c, r: start.r, mpCost: 0, apCost: 0, path: [] }];
    while (queue.length) {
      const cur = queue.shift();
      const dirs = [
        { dc: 1, dr: 0 },
        { dc: -1, dr: 0 },
        { dc: 0, dr: 1 },
        { dc: 0, dr: -1 }
      ];
      for (const d of dirs) {
        const nc = cur.c + d.dc, nr = cur.r + d.dr;
        if (!rules.inBounds(nc, nr)) continue;
        if (rules.occupied(nc, nr, ent) !== null) continue;
        const price = rules.tackleFor(ent, nc, nr);
        if (cur.mp < price.pm) continue;
        if (price.pa && cur.ap < price.pa) continue;
        const nmp = cur.mp - price.pm;
        const nap = price.pa ? cur.ap - price.pa : cur.ap;
        const nkey = key(nc, nr);
        if (visited.has(nkey)) continue;
        visited.add(nkey);
        const npath = cur.path.concat({ c: nc, r: nr });
        results.push({ c: nc, r: nr, mpCost: ent.pm - nmp, apCost: ent.pa - nap, path: npath });
        queue.push({ c: nc, r: nr, mp: nmp, ap: nap, path: npath });
      }
    }
    return results;
  }

  /** Cast step executor */
  function castStep(aiCtx, selector, opts) {
    const AI = opts.ai || root.DofusTouchAI;
    if (!AI) throw new Error('DofusTouchAI missing');
    const simulator = new AI.Simulator();
    const ent = aiCtx.ent;
    const maxEvals = opts.maxEvals || 4000;
    let evals = 0;
    let best = null;
    const spells = (ent.spells || []).map(id => opts.spellById(id, ent)).filter(Boolean);
    for (const sp of spells) {
      if (ent.pa < Math.max(1, sp.cost | 0)) continue;
      const engineSp = toEngineSpell(sp, ent);
      if (!engineSp) continue;
      for (let c = 0; c < opts.gridSize; c++) {
        for (let r = 0; r < opts.gridSize; r++) {
          if (evals >= maxEvals) break;
          const state = aiCtx.opts.rules.spellCellState(ent, { c, r }, sp);
          if (state !== 'ok') continue;
          const sim = simulator.simulateCast(engineSp, aiCtx, toFighter(ent), cellIdOf(c, r));
          evals++;
          if (!selector.valid(sim)) continue;
          const score = selector.score(sim);
          if (!best || score > best.score) {
            best = {
              type: 'cast',
              spellId: sp.id,
              target: { c, r },
              score,
              selector: selector.name || 'unknown'
            };
          }
        }
      }
    }
    return best;
  }

  /** Move to cast step executor */
  function moveToCastStep(aiCtx, selector, strategy, opts) {
    const reachableCells = reachable(aiCtx.G, aiCtx.ent, opts);
    let best = null;
    for (const cell of reachableCells) {
      const saved = { c: aiCtx.ent.c, r: aiCtx.ent.r };
      aiCtx.ent.c = cell.c;
      aiCtx.ent.r = cell.r;
      const cast = castStep(aiCtx, selector, opts);
      aiCtx.ent.c = saved.c;
      aiCtx.ent.r = saved.r;
      if (!cast) continue;
      const rawScore = cast.score;
      const value = strategy === 'nearest'
        ? -cell.mpCost + AI.AiFormula.sigmoid(rawScore)
        : rawScore - cell.mpCost;
      if (!best || value > best.value) {
        best = {
          type: 'move',
          path: cell.path,
          to: { c: cell.c, r: cell.r },
          value,
          cast
        };
      }
    }
    if (!best || best.path.length === 0) return null;
    return best;
  }

  /** Movement helpers */
  function moveNearEnemy(aiCtx, opts) {
    const main = aiCtx.getMainEnemy();
    if (!main) return null;
    const curDist = opts.rules.dist(aiCtx.ent, main);
    const cells = reachable(aiCtx.G, aiCtx.ent, opts);
    let best = null;
    for (const cell of cells) {
      const d = opts.rules.dist({ c: cell.c, r: cell.r }, main);
      if (d < curDist && (!best || d < best.dist || (d === best.dist && cell.mpCost < best.mpCost))) {
        best = { ...cell, dist: d };
      }
    }
    if (!best) return null;
    return { type: 'move', path: best.path, to: { c: best.c, r: best.r } };
  }

  function moveFarEnemies(aiCtx, opts) {
    const enemies = opts.rules.enemiesOf(aiCtx.ent);
    if (!enemies.length) return null;
    const curMin = Math.min(...enemies.map(e => opts.rules.dist(aiCtx.ent, e)));
    const cells = reachable(aiCtx.G, aiCtx.ent, opts);
    let best = null;
    for (const cell of cells) {
      const minDist = Math.min(...enemies.map(e => Math.abs(cell.c - e.c) + Math.abs(cell.r - e.r)));
      if (minDist > curMin && (!best || minDist > best.minDist || (minDist === best.minDist && cell.mpCost < best.mpCost))) {
        best = { ...cell, minDist };
      }
    }
    if (!best) return null;
    return { type: 'move', path: best.path, to: { c: best.c, r: best.r } };
  }

  function moveNearAllies(aiCtx, opts) {
    const allies = opts.rules.alliesOf(aiCtx.ent);
    if (!allies.length) return null;
    const bary = allies.reduce((acc, u) => ({ c: acc.c + u.c, r: acc.r + u.r }), { c: 0, r: 0 });
    bary.c /= allies.length;
    bary.r /= allies.length;
    const curDist = Math.hypot(aiCtx.ent.c - bary.c, aiCtx.ent.r - bary.r);
    const cells = reachable(aiCtx.G, aiCtx.ent, opts);
    let best = null;
    for (const cell of cells) {
      const d = Math.hypot(cell.c - bary.c, cell.r - bary.r);
      if (d < curDist && (!best || d < best.dist || (d === best.dist && cell.mpCost < best.mpCost))) {
        best = { ...cell, dist: d };
      }
    }
    if (!best) return null;
    return { type: 'move', path: best.path, to: { c: best.c, r: best.r } };
  }

  function blockNearestEnemy(aiCtx, opts) {
    const main = aiCtx.getMainEnemy();
    if (!main) return null;
    const adj = reachable(aiCtx.G, aiCtx.ent, opts).filter(c => Math.abs(c.c - main.c) + Math.abs(c.r - main.r) === 1);
    if (!adj.length) return moveNearEnemy(aiCtx, opts);
    let best = null;
    for (const cell of adj) {
      const count = opts.rules.enemiesOf(aiCtx.ent).filter(e => Math.abs(e.c - cell.c) + Math.abs(e.r - cell.r) === 1).length;
      if (!best || count > best.count || (count === best.count && cell.mpCost < best.mpCost)) {
        best = { ...cell, count };
      }
    }
    return { type: 'move', path: best.path, to: { c: best.c, r: best.r } };
  }

  /** Unsupported steps placeholder */
  const unsupportedSteps = new Set(['teleportNearEnemy', 'attractEnemy']);

  /** Resolve brain spec */
  function resolveBrain(spec, AI) {
    if (typeof spec === 'string') {
      if (AI.BRAIN_PIPELINES[spec]) return AI.BRAIN_PIPELINES[spec];
      if (AI.COMPOSITE_BRAINS[spec]) return AI.COMPOSITE_BRAINS[spec];
      throw new Error('Unknown brain spec: ' + spec);
    }
    if (Array.isArray(spec)) {
      return AI.combineBrains(spec);
    }
    if (spec && typeof spec === 'object') {
      if (spec.evaluatePipeline) return spec.evaluatePipeline;
      if (spec.mode === 'utility_fusion') {
        const selector = {
          name: 'fusion',
          valid: sim => true,
          score: sim => spec.scoreSimulation(sim, { avgEnemyHp: 0, enemiesCount: 0 })
        };
        return [
          { type: 'cast', selector },
          { type: 'moveToCast', selector, strategy: 'bestTarget' },
          { type: 'moveNearEnemy' }
        ];
      }
      return spec;
    }
    throw new Error('Invalid brain spec');
  }

  /** Decide next action */
  function decideNext(G, ent, opts) {
    const AI = opts.ai || root.DofusTouchAI;
    if (!AI) throw new Error('DofusTouchAI missing');
    const brainSpec = opts.brain || ent.aiBrains || 'TACTICAL';
    const brain = resolveBrain(brainSpec, AI);
    const steps = Array.isArray(brain) ? brain : brain.evaluatePipeline ? brain.evaluatePipeline : [];
    const aiCtx = createContext(G, ent, opts);
    for (const step of steps) {
      let action = null;
      switch (step.type) {
        case 'cast':
          action = castStep(aiCtx, step.selector, opts);
          break;
        case 'moveToCast':
          action = moveToCastStep(aiCtx, step.selector, step.strategy, opts);
          break;
        case 'moveNearEnemy':
          action = moveNearEnemy(aiCtx, opts);
          break;
        case 'moveFarEnemies':
          action = moveFarEnemies(aiCtx, opts);
          break;
        case 'moveNearAllies':
          action = moveNearAllies(aiCtx, opts);
          break;
        case 'blockNearestEnemy':
          action = blockNearestEnemy(aiCtx, opts);
          break;
        case 'when':
          if (step.condition(aiCtx)) {
            const branch = typeof step.success === 'string' ? resolveBrain(step.success, AI) : step.success;
            const sub = decideNext(G, ent, Object.assign({}, opts, { brain: branch }));
            if (sub) return sub;
          } else if (step.otherwise) {
            const branch = typeof step.otherwise === 'string' ? resolveBrain(step.otherwise, AI) : step.otherwise;
            const sub = decideNext(G, ent, Object.assign({}, opts, { brain: branch }));
            if (sub) return sub;
          }
          break;
        default:
          if (unsupportedSteps.has(step.type)) {
            // ignore, could record unsupported
          }
      }
      if (action) return { action, stepType: step.type, brain: brainSpec };
    }
    return null;
  }

  /** Legality check */
  function isLegal(G, ent, action, opts) {
    const rules = createRules(G, opts);
    if (!ent.alive) return { ok: false, reason: 'dead' };
    if (action.type === 'cast') {
      const sp = opts.spellById(action.spellId, ent);
      if (!sp) return { ok: false, reason: 'unknown spell' };
      if (ent.pa < Math.max(1, sp.cost | 0)) return { ok: false, reason: 'not enough AP' };
      const state = rules.spellCellState(ent, action.target, sp);
      if (state !== 'ok') return { ok: false, reason: 'invalid target' };
      return { ok: true };
    }
    if (action.type === 'move') {
      let curC = ent.c, curR = ent.r, mp = ent.pm, ap = ent.pa;
      for (const step of action.path) {
        const price = rules.tackleFor(ent, step.c, step.r);
        if (mp < price.pm) return { ok: false, reason: 'not enough MP' };
        if (price.pa && ap < price.pa) return { ok: false, reason: 'not enough AP' };
        mp -= price.pm;
        if (price.pa) ap -= price.pa;
        if (rules.occupied(step.c, step.r, ent) !== null) return { ok: false, reason: 'blocked' };
        curC = step.c; curR = step.r;
      }
      return { ok: true };
    }
    return { ok: false, reason: 'unknown action type' };
  }

  /** Apply action simulation */
  function applyActionSim(G, ent, action, opts) {
    const rng = opts.rng || mulberry32(opts.seed || 1);
    const rules = createRules(G, opts);
    const result = { ok: true, effects: [] };
    if (action.type === 'move') {
      for (const step of action.path) {
        const price = rules.tackleFor(ent, step.c, step.r);
        if (ent.pm < price.pm) { result.ok = false; break; }
        if (price.pa && ent.pa < price.pa) { result.ok = false; break; }
        ent.pm -= price.pm;
        if (price.pa) ent.pa -= price.pa;
        ent.c = step.c; ent.r = step.r;
      }
    } else if (action.type === 'cast') {
      const sp = opts.spellById(action.spellId, ent);
      if (!sp) return { ok: false, reason: 'unknown spell' };
      const cost = Math.max(1, sp.cost | 0);
      if (ent.pa < cost) return { ok: false, reason: 'not enough AP' };
      ent.pa -= cost;
      const engineSp = toEngineSpell(sp, ent);
      const zone = sp.aoe > 0 ? sp.aoe : 0;
      const targets = [];
      const allUnits = rules.livingUnits();
      for (const u of allUnits) {
        const d = Math.abs(u.c - action.target.c) + Math.abs(u.r - action.target.r);
        const inZone = sp.aoe > 0 ? d <= zone : u.c === action.target.c && u.r === action.target.r;
        if (!inZone) continue;
        targets.push(u);
      }
      const cap = Math.max(4, Math.round(ent.pvMax * 0.12));
      for (const tgt of targets) {
        if (sp.type === 'heal' && rules.unitSide(tgt) === rules.unitSide(ent)) {
          const amount = sp.heal[0] + Math.floor(rng() * (sp.heal[1] - sp.heal[0] + 1));
          const heal = Math.min(cap, amount);
          tgt.pv = Math.min(tgt.pvMax, tgt.pv + heal);
          result.effects.push({ id: action.spellId, kind: 'heal', amount: heal, target: tgt.id });
        } else if (sp.type === 'shield' && tgt === ent) {
          const amount = cap;
          ent.shield = Math.min(cap, (ent.shield || 0) + amount);
          result.effects.push({ id: action.spellId, kind: 'shield', amount, target: ent.id });
        } else if (sp.dmg && rules.unitSide(tgt) !== rules.unitSide(ent)) {
          const dmg = sp.dmg[0] + Math.floor(rng() * (sp.dmg[1] - sp.dmg[0] + 1));
          let remaining = dmg;
          if (tgt.shield) {
            const absorbed = Math.min(tgt.shield, remaining);
            tgt.shield -= absorbed;
            remaining -= absorbed;
          }
          if (remaining > 0) {
            tgt.pv = Math.max(0, tgt.pv - remaining);
            if (tgt.pv === 0) {
              tgt.alive = false;
              result.effects.push({ id: action.spellId, kind: 'damage', amount: dmg, target: tgt.id, killed: true });
            } else {
              result.effects.push({ id: action.spellId, kind: 'damage', amount: dmg, target: tgt.id });
            }
          }
        }
      }
    }
    return result;
  }

  /** Play a full turn */
  function playTurn(G, ent, opts) {
    const AI = opts.ai || root.DofusTouchAI;
    if (!AI) throw new Error('DofusTouchAI missing');
    const rng = opts.rng || mulberry32(opts.seed || 1);
    const memory = { lastCast: null, targetAllies: rng() < 0.5 };
    const turnOpts = Object.assign({}, opts, { rng, memory });
    const actions = [];
    const unsupported = [];
    const maxSteps = opts.maxSteps || 12;
    for (let i = 0; i < maxSteps; i++) {
      const decision = decideNext(G, ent, turnOpts);
      if (!decision) break;
      const { action, stepType, brain } = decision;
      const legal = isLegal(G, ent, action, turnOpts);
      actions.push({ action, stepType, legal, brain });
      if (!legal.ok) break;
      const res = (opts.apply || applyActionSim)(G, ent, action, turnOpts);
      if (action.type === 'cast') turnOpts.memory.lastCast = action.spellId;
      if (!ent.alive) break;
      const enemiesAlive = createRules(G, turnOpts).enemiesOf(ent).some(e => e.alive);
      if (!enemiesAlive) break;
    }
    return { brain: opts.brain || ent.aiBrains || 'TACTICAL', actions, unsupported, steps: [] };
  }

  return {
    VERSION,
    SPELL_EFFECT_MAP,
    mulberry32,
    createRules,
    toFighter,
    toEngineSpell,
    createContext,
    reachable,
    decideNext,
    isLegal,
    applyActionSim,
    playTurn,
    resolveBrain
  };
});
