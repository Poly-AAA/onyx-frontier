Write a plain JavaScript file `enemy-ai.js` (ES2020, no dependencies, no DOM, no Math.random, no Date) implementing a deterministic utility-based enemy AI for a Dofus-like tactical combat. It uses an existing combat core module (described below) and must NOT re-implement rules: always use the core functions for legality (canCast, reachableCells, spellCellState, moveUnit, castSpell, endTurn).

PACKAGING (mandatory UMD):
```
(function (root, factory) {
  const core = root.NeoFailleCombat || (typeof require === 'function' ? require('./combat-core.v1.js') : null);
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeoFailleAI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) { 'use strict'; ... return api; });
```
api = { ARCHETYPES, createEnemyAI(coreOverride?) -> ai, plus ai methods bound to default core: scoreActions, chooseAction, playTurn, core }.

COMBAT CORE (already exists, you call it as `core.xxx`):
DATA MODEL (state must be plain JSON: no Map/Set/functions/class instances in state):
state = {
  version: 1,
  grid: { w, h, shape: 'square'|'diamond', blocks: [[c,r],...] },
  rules: { tackle: true },
  units: [ { id, name, side: 'a'|'b', c, r, hp, maxHp, ap, maxAp, mp, maxMp, agi, init, archetype, dead:false, spells:[spell...], cooldowns:{ [spellId]: n } } ],
  turn: { round: 1, order: [unitIds], index: 0 },
  rngState: uint32,
  status: 'ongoing'|'victory'|'defeat',   // victory = all side 'b' dead, defeat = all side 'a' dead (side 'a' = player team)
  log: [ {round, actor, type, ...} ]
}
spell = { id, name, cost (AP), minRange (default 0), range (max, Manhattan), line (bool, default false: target must be on same row/col/diagonal), los (default true), aoe (Manhattan radius around target, default 0), type: 'damage'|'heal', dmg:[min,max] (inclusive, used as heal amount for type 'heal'), cooldown (turns, default 0), self (bool: target must be caster cell) }

Coordinates: c = column (0..w-1), r = row (0..h-1). Distance = Manhattan |dc|+|dr|.
Cell valid ("inBounds") if 0<=c<w and 0<=r<h, and for shape 'diamond' additionally |c-cx|+|r-cy| <= floor(min(w,h)/2) where cx=floor((w-1)/2), cy=floor((h-1)/2) (rhombus arena).
A cell is walkable if inBounds, not a block, and no living unit on it.

API to export (exact names):
API to export (exact names):
- createRng(seed) -> { next() /* float [0,1) */, int(min,max) /* inclusive */, getState() } using mulberry32 on a uint32 state.
- rngNext(state) -> float in [0,1): advances state.rngState with mulberry32 step (so randomness is serializable). Implement mulberry32 as:
  `s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;` storing s back into state.rngState.
- rngInt(state, min, max) inclusive.
- createCombat(config) -> state. config = { seed, grid:{w,h,shape,blocks}, rules, units:[partial units] }. Fill defaults (hp=maxHp, ap=maxAp, mp=maxMp, agi 0, init 0, cooldowns {}, dead false, spells [] with spell defaults filled). Deep-copy input (never mutate config). Compute turn order: sort living units by init descending, ties broken by id ascending (string compare). Then start the first unit's turn (reset its ap/mp). Throw Error if two units share a cell, a unit is on a block or out of bounds, or duplicate ids.
- inBounds(state,c,r), isBlocked(state,c,r), unitAt(state,c,r) (living unit or null), getUnit(state,id), currentUnit(state), manhattan(a,b) (a,b objects with c,r).
- losClear(state, from, to): Bresenham-style line of sight. Blockers = blocks and living units, but the target cell and origin cell never block. Use exactly this algorithm (port of the reference engine, `blocked(x,y)` returns true for out-of-bounds, block, or living unit):
```
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
      if (((x + sx !== c1 || y !== r1) && blocked(x + sx, y)) || ((x !== c1 || y + sy !== r1) && blocked(x, y + sy))) return false;
      if (blocked(nx, ny)) return false;
      err = err - ady + adx; x = nx; y = ny; continue;
    }
    if (stepX) { err -= ady; x += sx; } else { err += adx; y += sy; }
    if (x === c1 && y === r1) return true;
    if (blocked(x, y)) return false;
  }
  return false;
}
```
- tackleCost(myAgi, foeAgis[]) -> {pm, pa, hold}: if no foe with agi>0 -> {pm:1,pa:0,hold:0}; else foe=max(foeAgis), mine=max(1,myAgi), hold=foe/(foe+mine), extra = hold<0.34?0:hold<0.67?1:2, return {pm:1+extra, pa: hold>=0.75?1:0, hold}.
  NOTE: adjacent living enemies with agi 0 still count as tacklers: use agi value max(1, agi) for adjacent enemies when computing.
- reachableCells(state, unitId) -> array of {c, r, cost, path:[[c,r],...]} (excluding start cell) reachable with the unit's current mp using BFS over 4-neighbours on walkable cells. Each step costs 1 MP. Tackle (if state.rules.tackle): only the FIRST step of a move, when the unit starts adjacent (Manhattan 1) to at least one living enemy, costs tackleCost(agi, adjacentEnemyAgis).pm MP instead of 1, and the whole move also costs tackleCost().pa AP (if unit lacks the AP, the move is still allowed but AP becomes max(0, ap - pa)). Results sorted by cost, then r, then c (deterministic). Bounded: never visit more than w*h cells.
- findPath(state, unitId, dest) -> array of [c,r] steps (excluding start) or null, shortest by MP cost using the same rules (ties deterministic: neighbour order right(+1,0), left(-1,0), down(0,+1), up(0,-1)).
- moveUnit(state, unitId, dest) -> { ok, error?, path?, mpSpent, apSpent }. Must be the current unit's turn and status 'ongoing'. Mutates state; appends log {type:'move'}.
- spellCellState(state, unitId, spell, target) -> 'ok'|'out'|'blocked'|'nolos': out = out of bounds / out of range (d<minRange or d>range) / line constraint failed / self spell not on caster cell; blocked = target cell is a block; nolos = los required (spell.los !== false and not self) and losClear false.
- canCast(state, unitId, spellId, target) -> { ok, reason? } reasons: 'status','not_turn','dead','unknown_spell','ap','cooldown','out','blocked','nolos'.
- castSpell(state, unitId, spellId, target) -> { ok, reason?, effects:[{unitId, kind:'damage'|'heal', amount, killed}] }. On success: ap -= cost; cooldowns[id] = spell.cooldown if >0. Affected cells = all inBounds cells with Manhattan distance <= aoe from target. 'damage': each living ENEMY (other side than caster) in area takes rngInt(dmg[0],dmg[1]) (roll once per affected unit, in order of units array), hp clamped at 0, dead=true if hp<=0. 'heal': each living ALLY (same side, including caster) in area healed by rngInt, capped at maxHp (amount = actual healed). Log {type:'cast'}. Then update status via checkEnd.
- checkEnd(state) -> status (and sets state.status).
- startTurn(state): for current unit: ap=maxAp, mp=maxMp, decrement every cooldown >0 by 1 (remove keys reaching 0). (Do NOT decrement on the very cast turn: cooldown n means the spell is unavailable during the caster's next n-1 own turns... keep simple: decrement at the start of each own turn.)
- endTurn(state) -> next unit: advance index to the next LIVING unit in order (wrap => round+1), then startTurn. If status != 'ongoing', do nothing and return null.
- legalActions(state, unitId, opts={maxMoves:40}) -> array: for each reachable cell (first opts.maxMoves by sort order) {type:'move', dest:{c,r}, cost}; for each spell and each inBounds cell where canCast ok: {type:'cast', spellId, target:{c,r}}; plus {type:'end'}. Deterministic order.
- applyAction(state, unitId, action) -> result of moveUnit / castSpell / endTurn ({ok:true} for end).
- serialize(state) -> JSON string; deserialize(str) -> state (throw if version !== 1 or units missing). Also cloneState(state).


AI REQUIREMENTS:
ARCHETYPES = {
  melee:   { preferredRange: 1, fleeHp: 0.2, wDamage: 1.0, wKill: 30, wWeak: 15, wHeal: 0.3, wPosition: 6, wSafety: 2 },
  ranged:  { preferredRange: 5, fleeHp: 0.35, wDamage: 1.0, wKill: 30, wWeak: 15, wHeal: 0.3, wPosition: 6, wSafety: 6 },
  support: { preferredRange: 4, fleeHp: 0.4, wDamage: 0.6, wKill: 20, wWeak: 8, wHeal: 1.6, wPosition: 5, wSafety: 8 }
}
unit.archetype selects one (default 'melee'); opts.archetypes may override.

1. scoreActions(state, unitId, opts) -> array of { action, score, reason } sorted by score desc, ties keep generation order (stable). action shapes exactly as core.legalActions: {type:'move',dest:{c,r},cost}, {type:'cast',spellId,target:{c,r}}, {type:'end'}.
   - Never modify `state` permanently. To evaluate a hypothetical position, temporarily set unit.c/unit.r, evaluate, then restore (try/finally). Do not clone the state per candidate.
   - CAST candidates: for each spell of the unit and each candidate target cell = cells of living units (enemies for 'damage', allies including self for 'heal'; for self spells only the caster cell) PLUS no other cells (keeps budget bounded). Keep only those where core.canCast(...).ok. Score:
     damage: for every living enemy within aoe of target: expected = min(hp, (dmg0+dmg1)/2); sum wDamage*expected + (expected >= hp ? wKill : 0) + wWeak*(1 - hp/maxHp) ; minus 1000 if an ally (same side) is in the area? (core damage only hits enemies, so no penalty).
     heal: for every living ally in aoe: missing = maxHp-hp; value = min(missing, avg); score sum wHeal*value*(1 + missing/maxHp); if total missing is 0 the score is -Infinity (skip).
   - MOVE candidates: from core.reachableCells (cap opts.maxMoves default 60, in returned order). Score for a destination cell:
     a) bestCastFrom(cell) = best cast score that would be legal from that cell with the unit's current AP (temporarily move unit), times 0.9 (bonus for enabling an attack/heal), 
     b) position = -wPosition * |distToNearestEnemy - preferredRange| / 10 ; support archetype also adds -0.5*distance to nearest wounded ally,
     c) fleeing: if hp/maxHp < fleeHp then position term becomes +wSafety * distToNearestEnemy and +wSafety*3 if NO living enemy has line of sight (core.losClear) to that cell,
     d) safety: -wSafety*0.5 * (number of enemies with LoS to the cell within distance 6),
     e) cost: -0.5*cost - 8*apLoss where apLoss is the AP the move would cost through tackle (compute: unit.ap - ap after hypothetical move is unknown, so estimate with core.tackleCost when the unit is currently adjacent to an enemy: pa from tackleCost).
     The score of a move is (its cell score) - (the same score computed for staying on the current cell) so that a move only wins if it improves the situation. Moves with score <= 0.5 are dropped.
   - END candidate always present with score 0.
   - BUDGET: count evaluations (each canCast / spellCellState / losClear call counts 1). opts.maxEvals default 4000. When the budget is exhausted stop generating new candidates (already scored remain), and still return END.
   - Each entry has a short `reason` string (e.g. 'attack weakest', 'heal ally', 'approach', 'flee', 'end').
2. chooseAction(state, unitId, opts) -> the first element's action of scoreActions (or {type:'end'}).
3. playTurn(state, unitId, opts) -> { actions: [ {action, result, score, reason} ], steps }. Loop: if core.currentUnit(state).id !== unitId or state.status !== 'ongoing' stop. Choose action; apply via core.moveUnit / core.castSpell; if the applied result is not ok, or action is end, stop. Max opts.maxSteps (default 8) actions; a unit may move at most 2 times per turn (track count, after that skip move candidates). Finally call core.endTurn(state) once at the end if still that unit's turn and ongoing (record as {type:'end'}).
4. Determinism: identical input state + opts => identical outputs. No randomness at all in the AI.

Code quality: JSDoc, small helpers, under ~300 lines. Return ONLY the code block.
