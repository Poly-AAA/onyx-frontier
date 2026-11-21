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
