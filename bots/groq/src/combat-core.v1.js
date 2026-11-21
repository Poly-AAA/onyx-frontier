(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeoFailleCombat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** @type {number} */
  const VERSION = 1;

  /** @typedef {{c:number,r:number}} Coord */
  /** @typedef {{id:string,name:string,side:'a'|'b',c:number,r:number,hp:number,maxHp:number,ap:number,maxAp:number,mp:number,maxMp:number,agi:number,init:number,archetype?:any,dead:boolean,spells:Spell[],cooldowns:{[k:string]:number}}} Unit */
  /** @typedef {{id:number,name:string,cost:number,minRange?:number,range:number,line?:boolean,los?:boolean,aoe?:number,type:'damage'|'heal',dmg:[number,number],cooldown?:number,self?:boolean}} Spell */

  // ---------- RNG ----------
  function createRng(seed) {
    let s = seed >>> 0;
    return {
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
      },
      getState() {
        return s;
      }
    };
  }

  function rngNext(state) {
    let s = (state.rngState + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    state.rngState = s;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function rngInt(state, min, max) {
    const r = rngNext(state);
    return Math.floor(r * (max - min + 1)) + min;
  }

  // ---------- Helpers ----------
  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function inBounds(state, c, r) {
    const { w, h, shape } = state.grid;
    if (c < 0 || c >= w || r < 0 || r >= h) return false;
    if (shape === 'diamond') {
      const cx = Math.floor((w - 1) / 2);
      const cy = Math.floor((h - 1) / 2);
      const radius = Math.floor(Math.min(w, h) / 2);
      return Math.abs(c - cx) + Math.abs(r - cy) <= radius;
    }
    return true;
  }

  function isBlocked(state, c, r) {
    return state.grid.blocks.some(b => b[0] === c && b[1] === r);
  }

  function unitAt(state, c, r) {
    return state.units.find(u => !u.dead && u.c === c && u.r === r) || null;
  }

  function getUnit(state, id) {
    return state.units.find(u => u.id === id) || null;
  }

  function currentUnit(state) {
    const uid = state.turn.order[state.turn.index];
    return getUnit(state, uid);
  }

  function manhattan(a, b) {
    return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
  }

  // ---------- LOS ----------
  function losClearRaw(c0, r0, c1, r1, blocked) {
    if (c0 === c1 && r0 === r1) return true;
    const dx = c1 - c0, dy = r1 - r0, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx + ady <= 1) return true;
    if (adx === 1 && ady === 1) return true;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let x = c0, y = r0, err = adx - ady;
    const guard = adx + ady + 4;
    for (let n = 0; n < guard; n++) {
      const e2 = err * 2;
      const stepX = sx !== 0 && e2 > -ady;
      const stepY = sy !== 0 && e2 < adx;
      if (stepX && stepY) {
        const nx = x + sx, ny = y + sy;
        if (nx === c1 && ny === r1) return true;
        if (((x + sx !== c1 || y !== r1) && blocked(x + sx, y)) ||
            ((x !== c1 || y + sy !== r1) && blocked(x, y + sy))) return false;
        if (blocked(nx, ny)) return false;
        err = err - ady + adx; x = nx; y = ny; continue;
      }
      if (stepX) { err -= ady; x += sx; } else { err += adx; y += sy; }
      if (x === c1 && y === r1) return true;
      if (blocked(x, y)) return false;
    }
    return false;
  }

  function losClear(state, from, to) {
    const blocked = (c, r) => {
      if (!inBounds(state, c, r)) return true;
      if (isBlocked(state, c, r)) return true;
      const u = unitAt(state, c, r);
      if (u && !(c === from.c && r === from.r) && !(c === to.c && r === to.r)) return true;
      return false;
    };
    return losClearRaw(from.c, from.r, to.c, to.r, blocked);
  }

  // ---------- Tackle ----------
  function tackleCost(myAgi, foeAgis) {
    if (foeAgis.length === 0) return { pm: 1, pa: 0, hold: 0 };
    const foe = Math.max(...foeAgis);
    const mine = Math.max(1, myAgi);
    const hold = foe / (foe + mine);
    const extra = hold < 0.34 ? 0 : hold < 0.67 ? 1 : 2;
    return { pm: 1 + extra, pa: hold >= 0.75 ? 1 : 0, hold };
  }

  // ---------- Reachability ----------
  function reachableCells(state, unitId) {
    const unit = getUnit(state, unitId);
    if (!unit) return [];
    const maxMP = unit.mp;
    const start = { c: unit.c, r: unit.r };
    const visited = {};
    const queue = [{ c: start.c, r: start.r, cost: 0, path: [] }];
    const results = [];
    const w = state.grid.w, h = state.grid.h;
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    const adjacentEnemies = state.units.filter(u => !u.dead && u.side !== unit.side && manhattan(u, start) === 1);
    const foeAgis = adjacentEnemies.map(e => Math.max(1, e.agi));
    const firstStepCost = tackleCost(unit.agi, foeAgis);
    const maxVisits = w * h;

    while (queue.length && Object.keys(visited).length < maxVisits) {
      const cur = queue.shift();
      const key = `${cur.c},${cur.r}`;
      if (visited[key] !== undefined && visited[key] <= cur.cost) continue;
      visited[key] = cur.cost;

      if (cur.cost > 0) {
        results.push({
          c: cur.c,
          r: cur.r,
          cost: cur.cost,
          path: cur.path.slice()
        });
      }

      for (const [dx, dy] of dirs) {
        const nc = cur.c + dx, nr = cur.r + dy;
        if (!inBounds(state, nc, nr) || isBlocked(state, nc, nr) || unitAt(state, nc, nr)) continue;
        const stepCost = (cur.path.length === 0) ? firstStepCost.pm : 1;
        const newCost = cur.cost + stepCost;
        if (newCost > maxMP) continue;
        const newPath = cur.path.concat([{ c: nc, r: nr }]);
        queue.push({ c: nc, r: nr, cost: newCost, path: newPath });
      }
    }

    results.sort((a, b) => a.cost - b.cost || a.r - b.r || a.c - b.c);
    return results;
  }

  function findPath(state, unitId, dest) {
    const unit = getUnit(state, unitId);
    if (!unit) return null;
    const start = { c: unit.c, r: unit.r };
    if (start.c === dest.c && start.r === dest.r) return [];
    const w = state.grid.w, h = state.grid.h;
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ];
    const adjacentEnemies = state.units.filter(u => !u.dead && u.side !== unit.side && manhattan(u, start) === 1);
    const foeAgis = adjacentEnemies.map(e => Math.max(1, e.agi));
    const firstStepCost = tackleCost(unit.agi, foeAgis);
    const maxMP = unit.mp;
    const visited = {};
    const queue = [{ c: start.c, r: start.r, cost: 0, path: [] }];

    while (queue.length) {
      const cur = queue.shift();
      const key = `${cur.c},${cur.r}`;
      if (visited[key] !== undefined && visited[key] <= cur.cost) continue;
      visited[key] = cur.cost;

      if (cur.c === dest.c && cur.r === dest.r) return cur.path;

      for (const [dx, dy] of dirs) {
        const nc = cur.c + dx, nr = cur.r + dy;
        if (!inBounds(state, nc, nr) || isBlocked(state, nc, nr) || unitAt(state, nc, nr)) continue;
        const stepCost = (cur.path.length === 0) ? firstStepCost.pm : 1;
        const newCost = cur.cost + stepCost;
        if (newCost > maxMP) continue;
        const newPath = cur.path.concat([{ c: nc, r: nr }]);
        queue.push({ c: nc, r: nr, cost: newCost, path: newPath });
      }
    }
    return null;
  }

  // ---------- Movement ----------
  function moveUnit(state, unitId, dest) {
    const unit = getUnit(state, unitId);
    if (!unit) return { ok: false, error: 'unknown_unit' };
    if (state.status !== 'ongoing') return { ok: false, error: 'status' };
    if (currentUnit(state).id !== unitId) return { ok: false, error: 'not_turn' };
    if (unit.dead) return { ok: false, error: 'dead' };
    const path = findPath(state, unitId, dest);
    if (!path) return { ok: false, error: 'unreachable' };
    const start = { c: unit.c, r: unit.r };
    const adjacentEnemies = state.units.filter(u => !u.dead && u.side !== unit.side && manhattan(u, start) === 1);
    const foeAgis = adjacentEnemies.map(e => Math.max(1, e.agi));
    const firstCost = tackleCost(unit.agi, foeAgis);
    const mpSpent = (path.length > 0 ? firstCost.pm + (path.length - 1) : 0);
    const apSpent = path.length > 0 ? firstCost.pa : 0;
    if (unit.mp < mpSpent) return { ok: false, error: 'not_enough_mp' };
    unit.mp -= mpSpent;
    unit.ap = Math.max(0, unit.ap - apSpent);
    unit.c = dest.c;
    unit.r = dest.r;
    state.log.push({
      round: state.turn.round,
      actor: unit.id,
      type: 'move',
      dest: { c: dest.c, r: dest.r },
      cost: mpSpent,
      ap: apSpent
    });
    return { ok: true, path, mpSpent, apSpent };
  }

  // ---------- Spell Checks ----------
  function spellCellState(state, unitId, spell, target) {
    const unit = getUnit(state, unitId);
    if (!unit) return 'unknown_spell';
    const from = { c: unit.c, r: unit.r };
    const to = { c: target.c, r: target.r };
    if (!inBounds(state, to.c, to.r)) return 'out';
    const dist = manhattan(from, to);
    const minR = spell.minRange || 0;
    const maxR = spell.range;
    if (dist < minR || dist > maxR) return 'out';
    if (spell.line) {
      if (!(from.c === to.c || from.r === to.r || Math.abs(from.c - to.c) === Math.abs(from.r - to.r))) return 'out';
    }
    if (spell.self && (from.c !== to.c || from.r !== to.r)) return 'out';
    if (isBlocked(state, to.c, to.r)) return 'blocked';
    if (spell.los !== false && !(spell.self && from.c === to.c && from.r === to.r)) {
      if (!losClear(state, from, to)) return 'nolos';
    }
    return 'ok';
  }

  function canCast(state, unitId, spellId, target) {
    if (state.status !== 'ongoing') return { ok: false, reason: 'status' };
    const unit = getUnit(state, unitId);
    if (!unit) return { ok: false, reason: 'unknown_unit' };
    if (currentUnit(state).id !== unitId) return { ok: false, reason: 'not_turn' };
    if (unit.dead) return { ok: false, reason: 'dead' };
    const spell = unit.spells.find(s => s.id === spellId);
    if (!spell) return { ok: false, reason: 'unknown_spell' };
    if (unit.ap < (spell.cost || 0)) return { ok: false, reason: 'ap' };
    if (unit.cooldowns && unit.cooldowns[spellId]) return { ok: false, reason: 'cooldown' };
    const cellState = spellCellState(state, unitId, spell, target);
    if (cellState !== 'ok') return { ok: false, reason: cellState };
    return { ok: true };
  }

  // ---------- Casting ----------
  function castSpell(state, unitId, spellId, target) {
    const unit = getUnit(state, unitId);
    if (!unit) return { ok: false, reason: 'unknown_unit' };
    const spell = unit.spells.find(s => s.id === spellId);
    if (!spell) return { ok: false, reason: 'unknown_spell' };
    const can = canCast(state, unitId, spellId, target);
    if (!can.ok) return { ok: false, reason: can.reason };
    // deduct AP and set cooldown
    unit.ap -= spell.cost || 0;
    if (spell.cooldown && spell.cooldown > 0) unit.cooldowns[spellId] = spell.cooldown;
    const effects = [];
    const aoe = spell.aoe || 0;
    const cells = [];
    for (let c = target.c - aoe; c <= target.c + aoe; c++) {
      for (let r = target.r - aoe; r <= target.r + aoe; r++) {
        if (!inBounds(state, c, r)) continue;
        if (Math.abs(c - target.c) + Math.abs(r - target.r) <= aoe) cells.push({ c, r });
      }
    }
    const dmgMin = spell.dmg[0], dmgMax = spell.dmg[1];
    for (const u of state.units) {
      if (u.dead) continue;
      const inArea = cells.some(cell => cell.c === u.c && cell.r === u.r);
      if (!inArea) continue;
      if (spell.type === 'damage' && u.side !== unit.side) {
        const dmg = rngInt(state, dmgMin, dmgMax);
        u.hp = Math.max(0, u.hp - dmg);
        const killed = u.hp === 0 && !u.dead;
        if (killed) u.dead = true;
        effects.push({ unitId: u.id, kind: 'damage', amount: dmg, killed });
      } else if (spell.type === 'heal' && u.side === unit.side) {
        const heal = rngInt(state, dmgMin, dmgMax);
        const before = u.hp;
        u.hp = Math.min(u.maxHp, u.hp + heal);
        const actual = u.hp - before;
        effects.push({ unitId: u.id, kind: 'heal', amount: actual });
      }
    }
    state.log.push({
      round: state.turn.round,
      actor: unit.id,
      type: 'cast',
      spellId,
      target: { c: target.c, r: target.r },
      effects
    });
    checkEnd(state);
    return { ok: true, effects };
  }

  // ---------- End Check ----------
  function checkEnd(state) {
    const sideAAlive = state.units.some(u => u.side === 'a' && !u.dead);
    const sideBAlive = state.units.some(u => u.side === 'b' && !u.dead);
    if (!sideBAlive) state.status = 'victory';
    else if (!sideAAlive) state.status = 'defeat';
    else state.status = 'ongoing';
    return state.status;
  }

  // ---------- Turn Management ----------
  function startTurn(state) {
    const unit = currentUnit(state);
    if (!unit) return;
    unit.ap = unit.maxAp;
    unit.mp = unit.maxMp;
    for (const key in unit.cooldowns) {
      unit.cooldowns[key]--;
      if (unit.cooldowns[key] <= 0) delete unit.cooldowns[key];
    }
  }

  function endTurn(state) {
    if (state.status !== 'ongoing') return null;
    const order = state.turn.order;
    let idx = state.turn.index;
    const len = order.length;
    for (let i = 1; i <= len; i++) {
      const nextIdx = (idx + i) % len;
      const uid = order[nextIdx];
      const u = getUnit(state, uid);
      if (u && !u.dead) {
        if (nextIdx <= idx) state.turn.round++;
        state.turn.index = nextIdx;
        startTurn(state);
        return { ok: true };
      }
    }
    // no living units (should not happen)
    state.status = 'defeat';
    return null;
  }

  // ---------- Legal Actions ----------
  function legalActions(state, unitId, opts = { maxMoves: 40 }) {
    const unit = getUnit(state, unitId);
    if (!unit) return [];
    const actions = [];
    const moves = reachableCells(state, unitId).slice(0, opts.maxMoves);
    for (const m of moves) {
      actions.push({ type: 'move', dest: { c: m.c, r: m.r }, cost: m.cost });
    }
    for (const spell of unit.spells) {
      for (let c = 0; c < state.grid.w; c++) {
        for (let r = 0; r < state.grid.h; r++) {
          const target = { c, r };
          const can = canCast(state, unitId, spell.id, target);
          if (can.ok) {
            actions.push({ type: 'cast', spellId: spell.id, target });
          }
        }
      }
    }
    actions.push({ type: 'end' });
    return actions;
  }

  // ---------- Apply Action ----------
  function applyAction(state, unitId, action) {
    if (action.type === 'move') {
      return moveUnit(state, unitId, action.dest);
    } else if (action.type === 'cast') {
      return castSpell(state, unitId, action.spellId, action.target);
    } else if (action.type === 'end') {
      const res = endTurn(state);
      return res ? { ok: true } : { ok: false, reason: 'status' };
    }
    return { ok: false, reason: 'unknown_action' };
  }

  // ---------- Serialization ----------
  function serialize(state) {
    return JSON.stringify(state);
  }

  function deserialize(str) {
    const obj = JSON.parse(str);
    if (obj.version !== VERSION) throw new Error('Invalid version');
    if (!Array.isArray(obj.units)) throw new Error('Invalid state');
    return obj;
  }

  function cloneState(state) {
    return deepCopy(state);
  }

  // ---------- Combat Creation ----------
  function createCombat(config) {
    const cfg = deepCopy(config);
    const state = {
      version: VERSION,
      grid: {
        w: cfg.grid.w,
        h: cfg.grid.h,
        shape: cfg.grid.shape || 'square',
        blocks: cfg.grid.blocks ? cfg.grid.blocks.map(b => [b[0], b[1]]) : []
      },
      rules: { tackle: cfg.rules?.tackle ?? true },
      units: [],
      turn: { round: 1, order: [], index: 0 },
      rngState: (cfg.seed >>> 0) || 0,
      status: 'ongoing',
      log: []
    };
    const ids = new Set();
    for (const pu of cfg.units) {
      if (ids.has(pu.id)) throw new Error('Duplicate unit id');
      ids.add(pu.id);
      const unit = {
        id: pu.id,
        name: pu.name || '',
        side: pu.side,
        c: pu.c,
        r: pu.r,
        maxHp: pu.maxHp,
        hp: pu.hp !== undefined ? pu.hp : pu.maxHp,
        maxAp: pu.maxAp,
        ap: pu.ap !== undefined ? pu.ap : pu.maxAp,
        maxMp: pu.maxMp,
        mp: pu.mp !== undefined ? pu.mp : pu.maxMp,
        agi: pu.agi || 0,
        init: pu.init || 0,
        archetype: pu.archetype,
        dead: pu.dead || false,
        spells: [],
        cooldowns: {}
      };
      // validate position
      if (!inBounds(state, unit.c, unit.r)) throw new Error('Unit out of bounds');
      if (isBlocked(state, unit.c, unit.r)) throw new Error('Unit on block');
      if (unitAt(state, unit.c, unit.r)) throw new Error('Two units share a cell');
      // spells
      for (const ps of pu.spells || []) {
        const spell = {
          id: ps.id,
          name: ps.name || '',
          cost: ps.cost || 0,
          minRange: ps.minRange || 0,
          range: ps.range,
          line: !!ps.line,
          los: ps.los !== undefined ? !!ps.los : true,
          aoe: ps.aoe || 0,
          type: ps.type,
          dmg: ps.dmg,
          cooldown: ps.cooldown || 0,
          self: !!ps.self
        };
        unit.spells.push(spell);
      }
      state.units.push(unit);
    }
    // turn order
    const living = state.units.filter(u => !u.dead);
    living.sort((a, b) => b.init - a.init || (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
    state.turn.order = living.map(u => u.id);
    if (state.turn.order.length === 0) throw new Error('No living units');
    startTurn(state);
    return state;
  }

  // ---------- Export ----------
  return {
    createRng,
    rngNext,
    rngInt,
    createCombat,
    inBounds,
    isBlocked,
    unitAt,
    getUnit,
    currentUnit,
    manhattan,
    losClear,
    tackleCost,
    reachableCells,
    findPath,
    moveUnit,
    spellCellState,
    canCast,
    castSpell,
    checkEnd,
    startTurn,
    endTurn,
    legalActions,
    applyAction,
    serialize,
    deserialize,
    cloneState
  };
});
