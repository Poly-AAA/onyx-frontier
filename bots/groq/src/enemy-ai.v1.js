(function (root, factory) {
  const core = root.NeoFailleCombat || (typeof require === 'function' ? require('./combat-core.v1.js') : null);
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeoFailleAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  /*** RNG ***/
  function mulberry32(state) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function createRng(seed) {
    let s = seed >>> 0;
    return {
      next() {
        const v = mulberry32(s);
        s = (s + 0x6d2b79f5) >>> 0;
        return v;
      },
      int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
      },
      getState() { return s; }
    };
  }
  function rngNext(state) {
    const v = mulberry32(state.rngState);
    state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
    return v;
  }
  function rngInt(state, min, max) {
    return Math.floor(rngNext(state) * (max - min + 1)) + min;
  }

  /*** ARCHETYPES ***/
  const ARCHETYPES = {
    melee:   { preferredRange: 1, fleeHp: 0.2, wDamage: 1.0, wKill: 30, wWeak: 15, wHeal: 0.3, wPosition: 6, wSafety: 2 },
    ranged:  { preferredRange: 5, fleeHp: 0.35, wDamage: 1.0, wKill: 30, wWeak: 15, wHeal: 0.3, wPosition: 6, wSafety: 6 },
    support: { preferredRange: 4, fleeHp: 0.4, wDamage: 0.6, wKill: 20, wWeak: 8, wHeal: 1.6, wPosition: 5, wSafety: 8 }
  };

  /*** Helper utilities ***/
  function manhattan(a, b) {
    return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
  }
  function cloneUnitPos(unit) {
    return { c: unit.c, r: unit.r };
  }
  function getLivingUnits(state) {
    return state.units.filter(u => !u.dead);
  }
  function enemiesOf(state, unit) {
    return getLivingUnits(state).filter(u => u.side !== unit.side);
  }
  function alliesOf(state, unit) {
    return getLivingUnits(state).filter(u => u.side === unit.side);
  }
  function unitsInAoe(state, target, radius, sideFilter) {
    const res = [];
    const cells = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dc) + Math.abs(dr) <= radius) cells.push({ c: target.c + dc, r: target.r + dr });
      }
    }
    for (const cell of cells) {
      const u = core.unitAt(state, cell.c, cell.r);
      if (u && (!sideFilter || u.side === sideFilter)) res.push(u);
    }
    return res;
  }
  function avg(arr) { return (arr[0] + arr[1]) / 2; }

  /*** Scoring ***/
  function scoreCast(state, unit, spell, target, arch, evalCount) {
    const can = core.canCast(state, unit.id, spell.id, target);
    evalCount.cnt++;
    if (!can.ok) return null;
    const avgDmg = avg(spell.dmg);
    let score = 0;
    if (spell.type === 'damage') {
      const enemies = unitsInAoe(state, target, spell.aoe || 0, unit.side === 'a' ? 'b' : 'a');
      for (const e of enemies) {
        const exp = Math.min(e.hp, avgDmg);
        score += arch.wDamage * exp;
        if (exp >= e.hp) score += arch.wKill;
        score += arch.wWeak * (1 - e.hp / e.maxHp);
      }
    } else if (spell.type === 'heal') {
      const allies = unitsInAoe(state, target, spell.aoe || 0, unit.side);
      let totalMissing = 0;
      for (const a of allies) {
        const missing = a.maxHp - a.hp;
        totalMissing += missing;
        const val = Math.min(missing, avgDmg);
        score += arch.wHeal * val * (1 + missing / a.maxHp);
      }
      if (totalMissing === 0) return null;
    }
    return { score, reason: spell.type === 'damage' ? 'attack' : 'heal' };
  }

  function bestCastScoreFrom(state, unit, arch, evalCount) {
    let best = { score: -Infinity, reason: '' };
    for (const spell of unit.spells) {
      const targets = [];
      if (spell.type === 'damage') {
        for (const e of enemiesOf(state, unit)) targets.push({ c: e.c, r: e.r });
      } else if (spell.type === 'heal') {
        for (const a of alliesOf(state, unit)) targets.push({ c: a.c, r: a.r });
        if (spell.self) targets.push({ c: unit.c, r: unit.r });
      }
      for (const tgt of targets) {
        const res = scoreCast(state, unit, spell, tgt, arch, evalCount);
        if (res && res.score > best.score) best = res;
      }
    }
    return best.score === -Infinity ? 0 : best.score;
  }

  function positionScore(state, unit, arch, evalCount) {
    const nearestEnemyDist = Math.min(...enemiesOf(state, unit).map(e => manhattan(unit, e)));
    const pref = arch.preferredRange;
    let pos = -arch.wPosition * Math.abs(nearestEnemyDist - pref) / 10;
    if (arch === ARCHETYPES.support) {
      const woundedAllyDist = Math.min(...alliesOf(state, unit)
        .filter(a => a.hp < a.maxHp && a.id !== unit.id)
        .map(a => manhattan(unit, a)), Infinity);
      if (woundedAllyDist !== Infinity) pos -= 0.5 * woundedAllyDist;
    }
    const hpRatio = unit.hp / unit.maxHp;
    if (hpRatio < arch.fleeHp) {
      pos = arch.wSafety * nearestEnemyDist;
      const anyLos = enemiesOf(state, unit).some(e => core.losClear(state, { c: unit.c, r: unit.r }, { c: e.c, r: e.r }));
      if (!anyLos) pos += arch.wSafety * 3;
    }
    const safetyEnemies = enemiesOf(state, unit).filter(e => manhattan(unit, e) <= 6 && core.losClear(state, { c: unit.c, r: unit.r }, { c: e.c, r: e.r }));
    pos -= arch.wSafety * 0.5 * safetyEnemies.length;
    return pos;
  }

  function evaluateMove(state, unit, dest, baseScore, arch, evalCount, moveCount) {
    const origPos = cloneUnitPos(unit);
    try {
      unit.c = dest.c;
      unit.r = dest.r;
      const bestCast = bestCastScoreFrom(state, unit, arch, evalCount) * 0.9;
      const posScore = positionScore(state, unit, arch, evalCount);
      const apLoss = (() => {
        if (!core.tackleCost) return 0;
        const adj = enemiesOf(state, unit).some(e => manhattan(origPos, e) === 1);
        if (!adj) return 0;
        const foeAgis = enemiesOf(state, unit).filter(e => manhattan(origPos, e) === 1).map(e => Math.max(1, e.agi));
        const tc = core.tackleCost(unit.agi, foeAgis);
        return tc.pa || 0;
      })();
      const moveScore = bestCast + posScore - baseScore - 0.5 * dest.cost - 8 * apLoss;
      return moveScore;
    } finally {
      unit.c = origPos.c;
      unit.r = origPos.r;
    }
  }

  /*** Core AI methods ***/
  function scoreActions(state, unitId, opts = {}) {
    const evalCount = { cnt: 0 };
    const maxEvals = opts.maxEvals || 4000;
    const maxMoves = opts.maxMoves || 60;
    const arch = (opts.archetypes && opts.archetypes[core.getUnit(state, unitId).archetype]) || ARCHETYPES[core.getUnit(state, unitId).archetype] || ARCHETYPES.melee;
    const unit = core.getUnit(state, unitId);
    const basePosScore = positionScore(state, unit, arch, evalCount);
    const baseCastScore = bestCastScoreFrom(state, unit, arch, evalCount);
    const baseScore = basePosScore + baseCastScore;
    const actions = [];

    // CAST actions
    for (const spell of unit.spells) {
      const targets = [];
      if (spell.type === 'damage') {
        for (const e of enemiesOf(state, unit)) targets.push({ c: e.c, r: e.r });
      } else if (spell.type === 'heal') {
        for (const a of alliesOf(state, unit)) targets.push({ c: a.c, r: a.r });
        if (spell.self) targets.push({ c: unit.c, r: unit.r });
      }
      for (const tgt of targets) {
        if (evalCount.cnt >= maxEvals) break;
        const can = core.canCast(state, unit.id, spell.id, tgt);
        evalCount.cnt++;
        if (!can.ok) continue;
        const sc = scoreCast(state, unit, spell, tgt, arch, evalCount);
        if (sc) actions.push({ action: { type: 'cast', spellId: spell.id, target: tgt }, score: sc.score, reason: sc.reason });
      }
      if (evalCount.cnt >= maxEvals) break;
    }

    // MOVE actions
    const reachable = core.reachableCells(state, unitId);
    const moves = reachable.slice(0, maxMoves);
    const currentCellScore = baseScore;
    for (const cell of moves) {
      if (evalCount.cnt >= maxEvals) break;
      const moveScore = evaluateMove(state, unit, cell, currentCellScore, arch, evalCount, moves.length);
      if (moveScore > 0.5) actions.push({ action: { type: 'move', dest: { c: cell.c, r: cell.r }, cost: cell.cost }, score: moveScore, reason: 'move' });
    }

    // END action
    actions.push({ action: { type: 'end' }, score: 0, reason: 'end' });

    // sort
    actions.sort((a, b) => b.score - a.score);
    return actions;
  }

  function chooseAction(state, unitId, opts = {}) {
    const scored = scoreActions(state, unitId, opts);
    return scored.length ? scored[0].action : { type: 'end' };
  }

  function playTurn(state, unitId, opts = {}) {
    const maxSteps = opts.maxSteps || 8;
    const results = [];
    let steps = 0;
    let moveCount = 0;
    while (steps < maxSteps && core.currentUnit(state).id === unitId && state.status === 'ongoing') {
      const action = chooseAction(state, unitId, opts);
      let res;
      if (action.type === 'move') {
        if (moveCount >= 2) { res = { ok: false, reason: 'move_limit' }; }
        else res = core.moveUnit(state, unitId, action.dest);
        moveCount++;
      } else if (action.type === 'cast') {
        res = core.castSpell(state, unitId, action.spellId, action.target);
      } else {
        res = core.endTurn(state);
      }
      const scored = scoreActions(state, unitId, opts);
      const entry = { action, result: res, score: (scored[0] && scored[0].score) || 0, reason: (scored[0] && scored[0].reason) || '' };
      results.push(entry);
      steps++;
      if (!res.ok || action.type === 'end') break;
    }
    if (state.status === 'ongoing' && core.currentUnit(state).id === unitId) {
      const endRes = core.endTurn(state);
      results.push({ action: { type: 'end' }, result: endRes, score: 0, reason: 'end' });
    }
    return { actions: results, steps };
  }

  /*** Enemy AI factory ***/
  function createEnemyAI(coreOverride) {
    const usedCore = coreOverride || core;
    return {
      core: usedCore,
      scoreActions: (state, unitId, opts) => scoreActions(state, unitId, opts),
      chooseAction: (state, unitId, opts) => chooseAction(state, unitId, opts),
      playTurn: (state, unitId, opts) => playTurn(state, unitId, opts)
    };
  }

  /*** Exported API ***/
  return {
    ARCHETYPES,
    createRng,
    rngNext,
    rngInt,
    createCombat: core ? core.createCombat : undefined,
    createEnemyAI
  };
});
