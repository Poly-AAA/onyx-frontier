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
  function toFighter(ent, gridSize, teamId) {
    return {
      id: ent.id || ent.name,
      ent,
      cellId: cellIdOf(ent.c, ent.r, gridSize),
      hp: ent.pv,
      maxHp: ent.pvMax,
      shield: ent.shield | 0,
      hidden: (ent.invis | 0) > 0,
      ap: ent.pa,
      mp: ent.pm,
      level: ent.level || 1,
      teamId: teamId,
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
        zoneShape: (sp.aoe | 0) > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
        duration: 0
      });
    }
    if (sp.heal && sp.heal.length) {
      const cap = ent ? Math.max(4, Math.round(ent.pvMax * 0.12)) : Infinity;
      const min = Math.min(cap, sp.heal[0]);
      const max = Math.min(cap, sp.heal[1]);
      effects.push({
        effectId: SPELL_EFFECT_MAP.heal,
        min,
        max,
        zoneShape: (sp.aoe | 0) > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
        duration: 0
      });
    }
    if (sp.type === 'shield') {
      const cap = ent ? Math.max(4, Math.round(ent.pvMax * 0.12)) : 4;
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
        zoneShape: (sp.aoe | 0) > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
        duration: 0
      });
    }
    if (sp.effect === 'mp_loss') {
      effects.push({
        effectId: SPELL_EFFECT_MAP.mp_loss,
        min: 1,
        max: 1,
        zoneShape: (sp.aoe | 0) > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
        duration: 1
      });
    }
    if (sp.effect === 'ap_loss' || sp.effect === 'drainPA') {
      effects.push({
        effectId: SPELL_EFFECT_MAP.ap_loss,
        min: 1,
        max: 1,
        zoneShape: (sp.aoe | 0) > 0 ? 'C' : 'P',
        zoneSize: sp.aoe | 0,
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
  function cellIdOf(c, r, gridSize) {
    return r * (gridSize || 10) + c;
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
    const AI = opts.ai || root.DofusTouchAI;
    if (!AI) throw new Error('DofusTouchAI missing');
    const rules = createRules(G, opts);
    const gridSize = opts.gridSize || 10;
    const fighterOf = (e) => toFighter(e, gridSize, rules.unitSide(e));
    const fighter = fighterOf(ent);
    const memory = opts.memory || { lastCast: null, targetAllies: false };
    const simulator = opts.simulator || new AI.Simulator();
    const unsupported = opts.unsupported || [];
    const maxEvals = opts.maxEvals || 4000;
    const spellById = opts.spellById;

    return {
      G,
      ent,
      opts,
      AI,
      rules,
      gridSize,
      simulator,
      fighter,
      memory,
      unsupported,
      evals: 0,
      maxEvals,
      spellById,
      fighterOf,
      getMainEnemy() {
        const enemies = rules.enemiesOf(ent);
        if (!enemies.length) return null;
        const visible = enemies.filter(e => ((e.invis | 0) <= 0));
        if (!visible.length) return null;
        const main = visible.reduce((best, cur) => {
          const dCur = rules.dist(ent, cur);
          const dBest = rules.dist(ent, best);
          if (dCur < dBest) return cur;
          if (dCur === dBest && cur.pv < best.pv) return cur;
          return best;
        }, visible[0]);
        return fighterOf(main);
      },
      getMainAlly() {
        return null;
      },
      getDistance(a, b) {
        const ca = cellToCR(a, gridSize);
        const cb = cellToCR(b, gridSize);
        return Math.abs(ca.c - cb.c) + Math.abs(ca.r - cb.r);
      },
      resolveTargetsInZone(casterCellId, targetCellId, shape, size) {
        const target = cellToCR(targetCellId, gridSize);
        const units = rules.livingUnits();
        const res = [];
        units.forEach(u => {
          const pos = { c: u.c, r: u.r };
          let inZone = false;
          if (shape === 'P' || !size) {
            inZone = pos.c === target.c && pos.r === target.r;
          } else {
            const d = Math.abs(pos.c - target.c) + Math.abs(pos.r - target.r);
            inZone = d <= size;
          }
          if (inZone) {
            const f = fighterOf(u);
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
        const spells = (ent.spells || []).map(id => spellById(id, ent)).filter(Boolean);
        const enemies = rules.enemiesOf(ent);
        for (const sp of spells) {
          if (!sp.dmg) continue;
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
  function reachable(G, ent, opts, rules) {
    rules = rules || createRules(G, opts);
    const gridSize = opts.gridSize || 10;
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
        const savedC = ent.c, savedR = ent.r;
        let price;
        try {
          ent.c = cur.c;
          ent.r = cur.r;
          price = rules.tackleFor(ent, cur.c, cur.r);
        } finally {
          ent.c = savedC;
          ent.r = savedR;
        }
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
  function castStep(aiCtx, selector) {
    if (!selector) return null;
    const ent = aiCtx.ent;
    const gridSize = aiCtx.gridSize;
    const simulator = aiCtx.simulator;
    const spellById = aiCtx.spellById;
    const rules = aiCtx.rules;
    let best = null;
    const spells = (ent.spells || []).map(id => spellById(id, ent)).filter(Boolean);
    for (const sp of spells) {
      if (ent.pa < Math.max(1, sp.cost | 0)) continue;
      const engineSp = toEngineSpell(sp, ent);
      if (!engineSp) continue;
      for (let c = 0; c < gridSize; c++) {
        for (let r = 0; r < gridSize; r++) {
          if (aiCtx.evals >= aiCtx.maxEvals) break;
          const state = rules.spellCellState(ent, { c, r }, sp);
          if (state !== 'ok') continue;
          const fighter = toFighter(ent, gridSize, rules.unitSide(ent));
          const sim = simulator.simulateCast(engineSp, aiCtx, fighter, cellIdOf(c, r, gridSize));
          aiCtx.evals++;
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
  function moveToCastStep(aiCtx, selector, strategy) {
    const reachableCells = reachable(aiCtx.G, aiCtx.ent, aiCtx.opts, aiCtx.rules);
    let best = null;
    for (const cell of reachableCells) {
      const savedC = aiCtx.ent.c, savedR = aiCtx.ent.r;
      try {
        aiCtx.ent.c = cell.c;
        aiCtx.ent.r = cell.r;
        const cast = castStep(aiCtx, selector);
        if (!cast) continue;
        const rawScore = cast.score;
        const value = strategy === 'nearest'
          ? -cell.mpCost + aiCtx.AI.AiFormula.sigmoid(rawScore)
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
      } finally {
        aiCtx.ent.c = savedC;
        aiCtx.ent.r = savedR;
      }
    }
    if (!best || best.path.length === 0) return null;
    return { type: 'move', path: best.path, to: { c: best.to.c, r: best.to.r }, score: best.value };
  }

  /** Movement helpers */
  /** Movement steps using aiCtx.rules */
  function moveNearEnemy(aiCtx) {
    const mainF = aiCtx.getMainEnemy();
    const main = mainF && mainF.ent;
    if (!main) return null;
    const curDist = aiCtx.rules.dist(aiCtx.ent, main);
    const cells = reachable(aiCtx.G, aiCtx.ent, aiCtx.opts, aiCtx.rules);
    let best = null;
    for (const cell of cells) {
      const d = aiCtx.rules.dist({ c: cell.c, r: cell.r }, main);
      if (d < curDist && (!best || d < best.dist || (d === best.dist && cell.mpCost < best.mpCost))) {
        best = { ...cell, dist: d };
      }
    }
    if (!best) return null;
    return { type: 'move', path: best.path, to: { c: best.c, r: best.r } };
  }

  function moveFarEnemies(aiCtx) {
    const enemies = aiCtx.rules.enemiesOf(aiCtx.ent);
    if (!enemies.length) return null;
    const curMin = Math.min(...enemies.map(e => aiCtx.rules.dist(aiCtx.ent, e)));
    const cells = reachable(aiCtx.G, aiCtx.ent, aiCtx.opts, aiCtx.rules);
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

  function moveNearAllies(aiCtx) {
    const allies = aiCtx.rules.alliesOf(aiCtx.ent);
    if (!allies.length) return null;
    const bary = allies.reduce((acc, u) => ({ c: acc.c + u.c, r: acc.r + u.r }), { c: 0, r: 0 });
    bary.c = Math.round(bary.c / allies.length);
    bary.r = Math.round(bary.r / allies.length);
    const curDist = Math.abs(aiCtx.ent.c - bary.c) + Math.abs(aiCtx.ent.r - bary.r);
    const cells = reachable(aiCtx.G, aiCtx.ent, aiCtx.opts, aiCtx.rules);
    let best = null;
    for (const cell of cells) {
      const d = Math.abs(cell.c - bary.c) + Math.abs(cell.r - bary.r);
      if (d < curDist && (!best || d < best.dist || (d === best.dist && cell.mpCost < best.mpCost))) {
        best = { ...cell, dist: d };
      }
    }
    if (!best) return null;
    return { type: 'move', path: best.path, to: { c: best.c, r: best.r } };
  }

  function blockNearestEnemy(aiCtx) {
    const mainF = aiCtx.getMainEnemy();
    const main = mainF && mainF.ent;
    if (!main) return null;
    const adj = reachable(aiCtx.G, aiCtx.ent, aiCtx.opts, aiCtx.rules)
      .filter(c => Math.abs(c.c - main.c) + Math.abs(c.r - main.r) === 1);
    if (!adj.length) return moveNearEnemy(aiCtx);
    let best = null;
    for (const cell of adj) {
      const count = aiCtx.rules.enemiesOf(aiCtx.ent)
        .filter(e => Math.abs(e.c - cell.c) + Math.abs(e.r - cell.r) === 1).length;
      if (!best || count > best.count || (count === best.count && cell.mpCost < best.mpCost)) {
        best = { ...cell, count };
      }
    }
    if (!best || best.path.length === 0) return null;
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
      return spec;
    }
    throw new Error('Invalid brain spec');
  }

  /** Selector factory */
  function selectorFor(aiCtx, name) {
    const AS = aiCtx.AI.ActionSelectors;
    const enemies = aiCtx.rules.enemiesOf(aiCtx.ent);
    const avgEnemyMaxLife = enemies.length
      ? enemies.reduce((s, e) => s + (e.pvMax || 0), 0) / enemies.length
      : 300;
    switch (name) {
      case 'attack':
        return AS.attack('IF_KILL_ENEMY', avgEnemyMaxLife, Math.max(1, enemies.length));
      case 'boostSelf':
        return AS.boostSelf();
      case 'boostAllies':
        return AS.boostAllies();
      case 'heal':
        return AS.heal();
      case 'debuff':
        return AS.debuff();
      case 'invoke': {
        const allies = aiCtx.rules.alliesOf(aiCtx.ent);
        const team = [aiCtx.ent, ...allies];
        const sumPv = team.reduce((s, u) => s + (u.pv || 0), 0);
        const sumPvMax = team.reduce((s, u) => s + (u.pvMax || 0), 0);
        const ratio = sumPvMax ? sumPv / sumPvMax : 0;
        return AS.invoke(ratio, avgEnemyMaxLife);
      }
      case 'lunaticAllies':
        return AS.lunatic(true);
      case 'lunaticEnemies':
        return AS.lunatic(false);
      default:
        return null;
    }
  }

  /** Run a list of steps */
  function runSteps(aiCtx, steps) {
    for (const step of steps) {
      let action = null;
      // Resolve selector if needed
      const selector = step.selectorObj || (step.selector ? selectorFor(aiCtx, step.selector) : null);
      switch (step.type) {
        case 'cast':
          if (selector) action = castStep(aiCtx, selector);
          break;
        case 'moveToCast':
          if (selector) action = moveToCastStep(aiCtx, selector, step.strategy);
          break;
        case 'moveNearEnemy':
          action = moveNearEnemy(aiCtx);
          break;
        case 'moveFarEnemies':
          action = moveFarEnemies(aiCtx);
          break;
        case 'moveNearAllies':
          action = moveNearAllies(aiCtx);
          break;
        case 'blockNearestEnemy':
          action = blockNearestEnemy(aiCtx);
          break;
        case 'when': {
          const branch = step.condition(aiCtx) ? step.success : step.otherwise;
          if (!branch) break;
          const subSteps = typeof branch === 'string'
            ? aiCtx.AI.BRAIN_PIPELINES[branch]
            : branch;
          if (Array.isArray(subSteps)) {
            const subResult = runSteps(aiCtx, subSteps);
            if (subResult) return subResult;
          }
          break;
        }
        default:
          if (unsupportedSteps.has(step.type)) {
            if (!aiCtx.unsupported.includes(step.type)) aiCtx.unsupported.push(step.type);
          }
          // unknown step types are ignored
          break;
      }
      if (action) return { action, stepType: step.type };
    }
    return null;
  }

  /** Decide next action */
  function decideNext(G, ent, opts) {
    const AI = opts.ai || root.DofusTouchAI;
    if (!AI) throw new Error('DofusTouchAI missing');
    const brainSpec = opts.brain || ent.aiBrains || 'TACTICAL';
    const brain = resolveBrain(brainSpec, AI);
    const aiCtx = createContext(G, ent, opts);
    let steps;

    if (Array.isArray(brain)) {
      steps = brain;
    } else if (brain && typeof brain === 'object') {
      if (brain.mode === 'utility_fusion') {
        const livingEnemies = aiCtx.rules.livingUnits().filter(u => u.side !== aiCtx.fighter.side);
        const ctxInfo = {
          avgEnemyHp: livingEnemies.length
            ? livingEnemies.reduce((s, u) => s + (u.pv || 0), 0) / livingEnemies.length
            : 300,
          enemiesCount: livingEnemies.length
        };
        const selector = {
          name: 'fusion',
          valid: sim => true,
          score: sim => brain.scoreSimulation(sim, ctxInfo)
        };
        steps = [
          { type: 'cast', selectorObj: selector },
          { type: 'moveToCast', selectorObj: selector, strategy: 'bestTarget' },
          { type: 'moveNearEnemy' }
        ];
      } else if (typeof brain.evaluatePipeline === 'function') {
        steps = brain.evaluatePipeline(aiCtx);
      } else {
        steps = aiCtx.AI.BRAIN_PIPELINES.TACTICAL;
      }
    } else {
      steps = aiCtx.AI.BRAIN_PIPELINES.TACTICAL;
    }

    const result = runSteps(aiCtx, steps);
    let brainName;
    if (Array.isArray(brainSpec)) {
      brainName = brainSpec.join('+');
    } else if (brainSpec && typeof brainSpec === 'object') {
      brainName = brainSpec.name || '';
    } else {
      brainName = String(brainSpec);
    }

    return result
      ? { action: result.action, stepType: result.stepType, brain: brainName }
      : null;
  }

  /** Legality check */
  function isLegal(G, ent, action, opts) {
    const rules = createRules(G, opts);
    if (!ent.alive) return { ok: false, reason: 'dead' };

    // Cast actions
    if (action.type === 'cast') {
      const sp = opts.spellById(action.spellId, ent);
      if (!sp) return { ok: false, reason: 'unknown spell' };
      if (ent.pa < Math.max(1, sp.cost | 0)) return { ok: false, reason: 'not enough AP' };
      const state = rules.spellCellState(ent, action.target, sp);
      if (state !== 'ok') return { ok: false, reason: 'invalid target' };
      return { ok: true };
    }

    // Move actions – simulate step‑by‑step using the source cell for tackle price
    if (action.type === 'move') {
      if (!action.path || action.path.length === 0) return { ok: false, reason: 'empty path' };
      const origC = ent.c, origR = ent.r;
      let mp = ent.pm, ap = ent.pa;
      try {
        for (const step of action.path) {
          // adjacency check
          if (Math.abs(step.c - ent.c) + Math.abs(step.r - ent.r) !== 1) {
            return { ok: false, reason: 'invalid step' };
          }
          // bounds & occupancy
          if (!rules.inBounds(step.c, step.r)) return { ok: false, reason: 'out of bounds' };
          if (rules.occupied(step.c, step.r, ent) !== null) return { ok: false, reason: 'blocked' };
          // tackle price from current cell
          const price = rules.tackleFor(ent, ent.c, ent.r);
          if (mp < price.pm) return { ok: false, reason: 'not enough MP' };
          if (price.pa && ap < price.pa) return { ok: false, reason: 'not enough AP' };
          mp -= price.pm;
          if (price.pa) ap -= price.pa;
          // move ent virtually
          ent.c = step.c;
          ent.r = step.r;
        }
        return { ok: true };
      } finally {
        ent.c = origC;
        ent.r = origR;
      }
    }

    // End actions are always legal
    if (action.type === 'end') return { ok: true };

    return { ok: false, reason: 'unknown action type' };
  }

  /** Apply action simulation */
  function applyActionSim(G, ent, action, opts) {
    const rng = opts.rng || mulberry32(opts.seed || 1);
    const rules = createRules(G, opts);
    const result = { ok: true, effects: [] };

    // Move simulation – pay tackle price before each step
    if (action.type === 'move') {
      for (const step of action.path) {
        const price = rules.tackleFor(ent, ent.c, ent.r);
        if (ent.pm < price.pm) { result.ok = false; break; }
        if (price.pa && ent.pa < price.pa) { result.ok = false; break; }
        ent.pm -= price.pm;
        if (price.pa) ent.pa -= price.pa;
        // bounds & occupancy checks (defensive)
        if (!rules.inBounds(step.c, step.r) || rules.occupied(step.c, step.r, ent) !== null) {
          result.ok = false;
          break;
        }
        ent.c = step.c;
        ent.r = step.r;
      }
      return result;
    }

    // Cast simulation – handle heal, shield, damage with proper effect records
    if (action.type === 'cast') {
      const sp = opts.spellById(action.spellId, ent);
      if (!sp) return { ok: false, reason: 'unknown spell' };
      const cost = Math.max(1, sp.cost | 0);
      if (ent.pa < cost) return { ok: false, reason: 'not enough AP' };
      ent.pa -= cost;

      // Determine targets within spell zone
      const zone = sp.aoe > 0 ? sp.aoe : 0;
      const targets = [];
      for (const u of rules.livingUnits()) {
        const d = Math.abs(u.c - action.target.c) + Math.abs(u.r - action.target.r);
        const inZone = sp.aoe > 0 ? d <= zone : u.c === action.target.c && u.r === action.target.r;
        if (inZone) targets.push(u);
      }

      const cap = Math.max(4, Math.round(ent.pvMax * 0.12));

      for (const tgt of targets) {
        // Healing – only if heal array is present
        if (Array.isArray(sp.heal) && rules.unitSide(tgt) === rules.unitSide(ent)) {
          const amount = sp.heal[0] + Math.floor(rng() * (sp.heal[1] - sp.heal[0] + 1));
          const heal = Math.min(cap, amount);
          tgt.pv = Math.min(tgt.pvMax, tgt.pv + heal);
          result.effects.push({ id: tgt.id, spellId: action.spellId, kind: 'heal', amount: heal });
        }
        // Shield – only on caster
        else if (sp.type === 'shield' && tgt === ent) {
          const amount = cap;
          ent.shield = Math.min(cap, (ent.shield || 0) + amount);
          result.effects.push({ id: ent.id, spellId: action.spellId, kind: 'shield', amount });
        }
        // Damage – only if dmg array is present and target is enemy
        else if (Array.isArray(sp.dmg) && rules.unitSide(tgt) !== rules.unitSide(ent)) {
          const dmg = sp.dmg[0] + Math.floor(rng() * (sp.dmg[1] - sp.dmg[0] + 1));
          let absorbed = 0;
          let remaining = dmg;
          if (tgt.shield) {
            absorbed = Math.min(tgt.shield, remaining);
            tgt.shield -= absorbed;
            remaining -= absorbed;
          }
          const lost = Math.min(remaining, tgt.pv);
          tgt.pv = Math.max(0, tgt.pv - remaining);
          const killed = tgt.pv === 0;
          if (killed) tgt.alive = false;
          result.effects.push({
            id: tgt.id,
            spellId: action.spellId,
            kind: 'damage',
            amount: lost,
            absorbed,
            killed
          });
        }
      }
      return result;
    }

    // End or unknown actions – nothing to simulate
    return result;
  }

  /** Play a full turn */
  function playTurn(G, ent, opts) {
    const AI = opts.ai || root.DofusTouchAI;
    if (!AI) throw new Error('DofusTouchAI missing');

    // Reset points if requested
    if (opts.resetPoints) {
      ent.pa = ent.paMax;
      ent.pm = ent.pmMax;
    }

    const rng = opts.rng || mulberry32((opts.seed | 0) || 1);
    const memory = { lastCast: null, targetAllies: rng() < 0.5 };
    const unsupported = [];
    const turnOpts = Object.assign({}, opts, { rng, memory, unsupported, simulator: new AI.Simulator() });

    const actions = [];
    let steps = 0;
    let firstBrain = null;

    const maxSteps = opts.maxSteps || 12;
    for (let i = 0; i < maxSteps; i++) {
      const decision = decideNext(G, ent, turnOpts);
      if (!decision) break;
      const { action, stepType, brain } = decision;
      if (!firstBrain) firstBrain = brain || String(opts.brain || ent.aiBrains || 'TACTICAL');

      const legal = isLegal(G, ent, action, turnOpts);
      if (!legal.ok) {
        actions.push({ action, stepType, brain, legal, result: null });
        break;
      }

      const result = (opts.apply || applyActionSim)(G, ent, action, turnOpts);
      actions.push({ action, stepType, brain, legal, result });

      if (result.ok === false) break;

      if (action.type === 'cast') turnOpts.memory.lastCast = action.spellId;

      steps++;

      if (!ent.alive) break;
      if (createRules(G, turnOpts).enemiesOf(ent).length === 0) break;
    }

    return {
      brain: firstBrain || String(opts.brain || ent.aiBrains || 'TACTICAL'),
      actions,
      unsupported,
      steps,
      targetAllies: memory.targetAllies
    };
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
    resolveBrain,
    runSteps,
    selectorFor,
    castStep,
    moveToCastStep,
    cellIdOf,
    cellToCR
  };
});