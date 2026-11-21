You previously wrote the file below from this SPEC. Fix ALL listed issues and return the COMPLETE corrected file (one javascript code block, no explanation). Keep everything that already works; follow the SPEC.

=== ISSUES (from review and real test runs) ===
1. RUNTIME CRASH: `ReferenceError: opts is not defined` in cellIdOf (module-level function uses `opts`). Make cellIdOf(c, r, gridSize) and cellToCR(id, gridSize) take gridSize explicitly; toFighter(ent, gridSize).
2. Scoping: step functions use `opts.rules.*` and `aiCtx.opts.rules.*` which never exist. createContext must build `rules = createRules(G, opts)` ONCE and expose it as `aiCtx.rules`; every step function must use `aiCtx.rules`, `aiCtx.opts`, `aiCtx.gridSize` (= opts.gridSize || 10) consistently. reachable(G, ent, opts) may build its own rules when called directly, but steps should pass/reuse aiCtx.rules.
3. castStep loops must use aiCtx.gridSize (opts.gridSize may be undefined -> loop never runs).
4. `when` steps must evaluate the chosen branch with the SAME aiCtx (same memory, same unsupported list, same eval budget) — do not rebuild a context via a recursive decideNext. Write a helper runSteps(aiCtx, steps) -> {action, stepType} | null used by decideNext and by `when` branches (branch can be an array or a brain name string resolved via AI.BRAIN_PIPELINES).
5. unsupported step types (teleportNearEnemy, attractEnemy, and any unknown type) must be pushed once into aiCtx.unsupported (an array supplied by playTurn via opts.unsupported, or created) and playTurn must return it.
6. Budget: one evaluation counter per decideNext call stored on aiCtx (aiCtx.evals), shared by castStep and moveToCastStep.
7. Make sure decideNext also works for composite objects (evaluatePipeline(aiCtx)) and utility_fusion objects, as per SPEC item 4.

=== SPEC ===
Write ONE plain JavaScript file `brains-adapter.js` (ES2020, no dependencies, no DOM access, no Math.random, no Date/performance). It ADAPTS an EXISTING AI engine (6 Araknemu brains, already written, do NOT rewrite its scoring) to the EXISTING combat state of a game engine v3.4.1. Reuse existing code as much as possible; do not invent new scoring formulas.

PACKAGING (mandatory UMD):
(function (root, factory) { const api = factory(root); if (typeof module === 'object' && module.exports) module.exports = api; root.NeoFailleBrainsAdapter = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function (root) { 'use strict'; ... return api; });
Dependencies are looked up AT CALL TIME: `const AI = opts.ai || root.DofusTouchAI; const GRID = opts.grid || root.CombatGrid;` throw a clear Error if missing.

=== EXISTING DEPENDENCY 1: root.DofusTouchAI (do not modify) ===
Exports: BRAIN_PIPELINES, COMPOSITE_BRAINS, ActionSelectors, AiFormula, CastSimulation, Simulator, combineBrains.
- `new AI.Simulator()`; `sim = simulator.simulateCast(spell, aiCtx, caster, targetCellId)` where spell = {id, apCost, effects:[{effectId, min, max, zoneShape, zoneSize, duration}]}, caster = fighter {id, cellId, hp, maxHp, shield, hidden, ap, mp, level, stats}. It calls aiCtx.getMainEnemy(), aiCtx.getMainAlly(), aiCtx.resolveTargetsInZone(casterCellId, targetCellId, zoneShape, zoneSize) (must return fighters, each may get `_aoeDist`), aiCtx.getDistance(cellA, cellB), and optionally aiCtx.tracePushback (omit it).
- ActionSelectors: attack(suicideStrategy='IF_KILL_ENEMY', averageEnemyMaxLife, enemiesCount), boostSelf(), boostAllies(), heal(), debuff(), invoke(teamLifeRatio, mainEnemyMaxLife), lunatic(targetAllies). Each returns {name, valid(sim), score(sim)}. NOTE: boostSelf/boostAllies use `this.boost` so call them as methods: AI.ActionSelectors.boostSelf().
- BRAIN_PIPELINES: { TACTICAL, AGGRESSIVE, SUPPORT, BLOCKING, RUNAWAY, LUNATIC, FIXED } arrays of steps:
  {type:'cast', selector}, {type:'moveToCast', selector, strategy:'bestTarget'|'nearest'}, {type:'when', condition:(aiCtx)=>bool, success:[steps], otherwise:[steps] | 'TACTICAL' (a brain name string)}, {type:'moveNearEnemy'}, {type:'moveFarEnemies'}, {type:'moveNearAllies'}, {type:'blockNearestEnemy'}, {type:'teleportNearEnemy'}, {type:'attractEnemy'}.
  selector names: attack, boostSelf, boostAllies, heal, debuff, invoke, lunaticAllies (=lunatic(true)), lunaticEnemies (=lunatic(false)).
  Conditions use aiCtx.getLifePercent(), aiCtx.hasEnemyInRange(), aiCtx.hasAllies(), aiCtx.memory.lastCast, aiCtx.memory.targetAllies.
- COMPOSITE_BRAINS / combineBrains(...) objects: {name, mode:'pipeline'|'conditional', evaluatePipeline(aiCtx) -> steps[]} or {name, mode:'utility_fusion', scoreSimulation(sim, {avgEnemyHp, enemiesCount}) -> number}.
- Araknemu execution loop (documented): each step of the pipeline is tried in order; the FIRST step that yields a valid action is executed, then the AI restarts from the FIRST step with updated AP/MP/position. If no step yields an action, the turn ends.
- Default target selection (documented): main enemy = nearest living visible enemy (Manhattan), tie-break lowest current HP. Main ally = invoker (does not exist in v3.4.1 -> null).

=== EXISTING DEPENDENCY 2: root.CombatGrid (from v3.4.1, do not modify) ===
GRID.manhattan(a,b); GRID.losClear(c0,r0,c1,r1, blocked(c,r)->bool); GRID.tackleCost(myAgi, foeAgis[]) -> {pm, pa, hold}; GRID.spellReach({min,max,line,los}, from, to, blocked) -> 'ok'|'out'|'blocked'.

=== EXISTING STATE OF v3.4.1 (object `G`, passed in) ===
G.player, G.enemy, G.clone (optional), G.roster (array, may also contain G.enemy; skip duplicates by identity), G.blocks = Set of "c,r" strings. Grid size = opts.gridSize (default 10, the v3.4.1 const GRID). Entities: {id?, name, c, r, pv, pvMax, pa, paMax, pm, pmMax, alive, side?, stats:{agi,...}, spells:[spellIds], shield, invis, level}. Spells are resolved with opts.spellById(id, ent) (in the real game this is window.__careerBridge.spellById). Spell shape: {id, name, cost, range, minRange, line, los, aoe, dmg:[min,max], heal:[min,max], type:'heal'|'shield'|..., element:'terre'|'feu'|'eau'|'air'|'neutre', effect:'push'|'mp_loss'|'ap_loss'|'drainPA'|...}.
Port these v3.4.1 functions EXACTLY, parameterised by G and gridSize (they are the real rules):
```
  function key(c,r){ return c+","+r; }
  function inBounds(c,r){ return c>=0&&r>=0&&c<GRID&&r<GRID; }
  function occupied(c,r, skip){
    if(G.blocks && G.blocks.has(key(c,r))) return "block";
    if(G.player.alive && skip!=="player" && G.player.c===c && G.player.r===r) return "player";
    if(G.enemy && G.enemy.alive && skip!=="enemy" && G.enemy.c===c && G.enemy.r===r) return "enemy";
    if(G.clone && G.clone.alive && skip!=="clone" && G.clone.c===c && G.clone.r===r) return "clone";
    if(skip==="pawn") return null;
    for(const p of (G.roster||[])){
      if(!p.alive || p===G.enemy) continue;
      if(p.c===c && p.r===r) return p.side==="b" ? "enemy" : "ally";
    }
    return null;
  }
  function dist(a,b){ return Math.abs(a.c-b.c) + Math.abs(a.r-b.r); }
  function unitSide(ent){
    if(!ent || ent===G.player || ent===G.clone) return "a";
    return ent.side || "b";
  }
  function agiOf(ent){
    const n = ent && ent.stats && ent.stats.agi;
    return Math.max(1, (n == null ? 5 : n) | 0);
  }
  function foeAgisAt(c, r, ent){
    const side = unitSide(ent);
    const out = [];
    const list = [];
    if(G.player && G.player!==ent && G.player.alive) list.push(G.player);
    if(G.clone && G.clone!==ent && G.clone.alive) list.push(G.clone);
    if(G.enemy && G.enemy!==ent && G.enemy.alive) list.push(G.enemy);
    (G.roster||[]).forEach(p=>{ if(p && p!==ent && p!==G.enemy && p.alive) list.push(p); });
    list.forEach(u=>{
      if(unitSide(u)===side) return;
      if(Math.abs(u.c-c)+Math.abs(u.r-r)===1) out.push(agiOf(u));
    });
    return out;
  }
  function losBlock(c, r){
    if(!inBounds(c, r)) return true;
    if(G.blocks && G.blocks.has(key(c, r))) return true;
    return !!occupied(c, r);
  }
  function spellCellState(from, to, sp){
    const g = window.CombatGrid;
    if(!from || !to || !sp) return "out";
    if(sp.ray8 && !exploOnRay8(from, to, sp.ray8)) return "out";
    if(!g) return dist(from, to) <= spellRange(sp) ? "ok" : "out";
  function spellRange(sp){
    if(!sp) return 0;
    const evo = evoBonusesFor(sp);
    return Math.max(0, (sp.range|0) + (evo.range|0));
  }
  function spellMin(sp){
    if(!sp || sp.minRange == null) return 0;
    return Math.max(0, sp.minRange|0);
  }
  function spellNeedsLos(sp){
    if(!sp || isSelfSpell(sp)) return false;
    return sp.los !== false;
  }
  function spellGeom(sp){
    return { min: spellMin(sp), max: spellRange(sp), line: !!(sp && sp.line), los: spellNeedsLos(sp) };
  }
  function stepFromEvoEntry(ed){
    return normalizeCastStep({
  function payMove(ent, o){
    const price = tackleFor(ent, ent.c, ent.r);
    if((ent.pm|0) < price.pm) return false;
    if(price.pa && (ent.pa|0) < price.pa) return false;
    const fromC = ent.c, fromR = ent.r;
    ent.c=o.c; ent.r=o.r;
    ent.slide = { kind: "walk", fromC: fromC, fromR: fromR, toC: o.c, toR: o.r, t0: performance.now(), dur: 210 };
    ent.pm -= price.pm;
    if(price.pa) ent.pa -= price.pa;
    return true;
  }
  function enemyStepToward(goalC, goalR){
    const e = G.enemy;
```
(Remove G.player special-casing differences only where needed; unitSide(ent): player and clone are side 'a', others ent.side || 'b'. evoBonusesFor does not exist: spellRange(sp) = max(0, sp.range|0). isSelfSpell(sp) = sp.self === true || (sp.range|0) === 0. Rendering fields like ent.slide / playAnim / faceToward must be dropped.)
idOf(ent) = ent.id || ent.name. cellIdOf(c,r) = r*gridSize + c; cellToCR(id).

=== WHAT TO WRITE ===
1. Conversions:
 - toFighter(ent): {id: idOf(ent), ent, cellId, hp: ent.pv, maxHp: ent.pvMax, shield: ent.shield|0, hidden: (ent.invis|0) > 0, ap: ent.pa, mp: ent.pm, level: ent.level||1, stats: Object.assign({}, ent.stats, { agility: ent.stats && ent.stats.agi })}.
 - toEngineSpell(sp, ent): {id: sp.id, apCost: Math.max(1, sp.cost|0), effects}. Mapping table (export it as SPELL_EFFECT_MAP): dmg -> effectId by element {eau:96, terre:97, air:98, feu:99, other/neutre:100}; heal array -> 108; type 'shield' -> 105 with min=max=Math.max(4, Math.round(ent.pvMax*0.12)), duration 1 (v3.4.1 shield cap); effect 'push' -> 5 (min 1,max 1); effect 'mp_loss' -> 127 (1,1,duration 1); effect 'ap_loss' or 'drainPA' -> 101 (1,1,duration 1). Each effect: zoneShape = (sp.aoe|0) > 0 ? 'C' : 'P', zoneSize = sp.aoe|0, duration default 0. Return null if no effect mapped.
2. createContext(G, ent, opts) -> aiCtx implementing: memory {lastCast:null, targetAllies:false}, getMainEnemy() (fighter or null), getMainAlly() -> null, getDistance(a,b) on cellIds, resolveTargetsInZone(casterCellId, targetCellId, shape, size): living units (all sides) whose Manhattan distance to target <= size if shape !== 'P', else only the unit on target cell; returns fighters with _aoeDist; getLifePercent() = 100*pv/pvMax; hasAllies() = another living unit on the same side; hasEnemyInRange() = some damage spell (has dmg) of ent with spellCellState(ent, enemy, sp) === 'ok' for some living enemy; plus fields G, ent, opts, fighter.
3. Step executors (each returns an action or null; NEVER mutate G except temporarily setting ent.c/ent.r inside try/finally to evaluate hypothetical positions):
 - reachable(G, ent): BFS over 4-neighbours using payMove semantics: each step costs tackleFor(ent at the cell being left) pm and pa (needs remaining pm >= price.pm and pa >= price.pa), cells must be inBounds and !occupied(c,r,ent). Returns [{c,r, mpCost, apCost, path:[{c,r},...]}] deterministic order (BFS expansion order right, left, down, up). Include the start cell with cost 0 and empty path. Cap visited at gridSize*gridSize.
 - castStep(selector or scorer): for every spell id of ent (resolved, skip null), skip if ent.pa < max(1,cost); engine spell = toEngineSpell; for every cell (c,r) in the grid with spellCellState(ent, {c,r}, sp) === 'ok': sim = simulator.simulateCast(engineSpell, aiCtx, toFighter(ent), cellId); if selector.valid(sim) then s = selector.score(sim); keep best (strictly greater wins => deterministic). Return {type:'cast', spellId, target:{c,r}, score, selector:name} or null. Evaluation budget opts.maxEvals (default 4000) counted per simulateCast; stop when exceeded.
 - moveToCastStep(selector, strategy): for each reachable cell (including start), temporarily place ent there, run castStep; value = strategy==='nearest' ? -mpCost + AI.AiFormula.sigmoid(score) : score - mpCost. Choose best; if best is the start cell or none -> null; else {type:'move', path, to:{c,r}}.
 - moveNearEnemy: reachable cell minimising Manhattan distance to main enemy (tie: lower mpCost); null if not strictly closer than now.
 - moveFarEnemies: maximise the minimum Manhattan distance to all living enemies; null if not strictly better.
 - moveNearAllies: minimise distance to the rounded barycenter of living allies (excluding ent); null if no allies or not better.
 - blockNearestEnemy: among reachable cells adjacent (distance 1) to main enemy, maximise number of adjacent living enemies, tie lower mpCost; if none adjacent, behave like moveNearEnemy.
 - teleportNearEnemy, attractEnemy: no such mechanic in v3.4.1 -> return null and push the step type into result.unsupported (once).
 - when: run condition(aiCtx); then run the chosen branch (array of steps, or a brain name string -> AI.BRAIN_PIPELINES[name]).
4. resolveBrain(spec): string -> AI.BRAIN_PIPELINES[spec] (array) or AI.COMPOSITE_BRAINS[spec] (object); array of names -> AI.combineBrains(names) ; object passed through. For objects with evaluatePipeline -> steps = obj.evaluatePipeline(aiCtx). For mode 'utility_fusion': steps are synthesized as [castStep with scorer {name:'fusion', valid: sim => score>0, score: sim => obj.scoreSimulation(sim, {avgEnemyHp, enemiesCount})}, moveToCastStep same scorer 'bestTarget', moveNearEnemy] (document this as adapter choice in a comment).
5. decideNext(G, ent, opts) -> {action, stepType, brain} or null: build aiCtx (reusing opts.memory if given), iterate steps in order, return the first non-null action.
6. isLegal(G, ent, action, opts) -> {ok, reason}: cast: ent.alive, pa >= max(1,cost), spellCellState === 'ok'; move: each step adjacent, inBounds, not occupied, affordable with payMove semantics from the current position.
7. applyActionSim(G, ent, action, opts) — TEST EXECUTOR mirroring v3.4.1 (enemyCast/payMove), used by the offline test page (the real game would apply via its own functions): move = payMove per step (stop if unaffordable); cast: ent.pa -= max(1,cost); if spell has heal (or type 'heal'): for every living ally (same side) in zone heal h = min(cap, roll(heal)), cap = max(4, round(pvMax*0.12)), pv = min(pvMax, pv+h); if type 'shield': ent.shield = min(cap, shield+cap); if dmg: for every living ENEMY in zone (Manhattan <= aoe|0 from target): d = roll(dmg); shield absorbs first; pv = max(0, pv-d); if pv <= 0 then alive=false. roll([a,b]) = a + floor(rng()*max(1,b-a+1)). Returns {ok, effects:[{id, kind, amount, killed}]}.
8. playTurn(G, ent, opts) -> {brain, actions:[{action, stepType, legal, result}], unsupported:[], steps}: memory refresh at turn start: {lastCast:null, targetAllies: rng() < 0.5} (the Lunatic coin flip, seeded instead of Java Random). Loop up to opts.maxSteps (default 12): decideNext; if null break; check isLegal (if not legal record and break); apply with opts.apply || applyActionSim; if cast set memory.lastCast = spellId; break if ent dead or no living enemies. Brain spec = opts.brain || ent.aiBrains || 'TACTICAL'. Does not reset PA/PM (the engine's enemyTurn does: ent.pa=ent.paMax; ent.pm=ent.pmMax) unless opts.resetPoints.
9. RNG: opts.rng (function) or mulberry32(opts.seed|0 default 1): `function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}`. Create the rng once per playTurn call and reuse it.
Export: { VERSION:'1', SPELL_EFFECT_MAP, mulberry32, createRules(G, opts) (returns the ported rule functions bound to G: inBounds, occupied, dist, unitSide, agiOf, foeAgisAt, tackleFor, losBlock, spellGeom, spellCellState, livingUnits, enemiesOf, alliesOf), toFighter, toEngineSpell, createContext, reachable, decideNext, isLegal, applyActionSim, playTurn, resolveBrain }.
JSDoc on exported functions. Keep it compact (< 500 lines). Return ONLY the code block.

=== CURRENT FILE ===
```javascript
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
```
