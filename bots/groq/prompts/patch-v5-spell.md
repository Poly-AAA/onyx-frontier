CONTEXT: file `brains-adapter.js`, a UMD module adapting the existing Araknemu AI engine (root.DofusTouchAI: Simulator, ActionSelectors, BRAIN_PIPELINES, COMPOSITE_BRAINS, AiFormula, combineBrains) to the v3.4.1 combat state G (G.player, G.enemy, G.roster, G.blocks Set "c,r"; entities {c,r,pv,pvMax,pa,pm,alive,side,stats,spells:[ids]}).
Module-level helpers available (do not redefine): mulberry32(seed), key(c,r), cellIdOf(c, r, gridSize), cellToCR(id, gridSize), toFighter(ent, gridSize), toEngineSpell(sp, ent), createRules(G, opts) -> {inBounds, occupied(c,r,ent), dist(a,b), unitSide, agiOf, foeAgisAt, tackleFor(ent,c,r)->{pm,pa}, losBlock, spellGeom, spellCellState(from,to,sp)->'ok'|..., livingUnits(), enemiesOf(ent), alliesOf(ent)}, resolveBrain(spec, AI).
AGREED aiCtx SHAPE (built once per decision by createContext(G, ent, opts)):
 { G, ent, opts, AI, rules, gridSize (opts.gridSize||10), simulator (new AI.Simulator(), reuse opts.simulator if given), fighter (toFighter(ent, gridSize)), memory (opts.memory || {lastCast:null,targetAllies:false}), unsupported (opts.unsupported || []), evals: 0, maxEvals (opts.maxEvals||4000), spellById: opts.spellById,
   getMainEnemy(), getMainAlly(), getDistance(a,b), resolveTargetsInZone(casterCellId, targetCellId, shape, size), getLifePercent(), hasAllies(), hasEnemyInRange() }
Step functions signature: fn(aiCtx, ...) -> action|null and must ONLY use aiCtx.* (never a free variable `opts`, never `opts.rules`).

FIX IN THIS REGION (toEngineSpell). BUGS found by tests:
1. Crash `Cannot read properties of undefined (reading 'pvMax')` when toEngineSpell(sp) is called without ent. ent is optional: cap = ent ? Math.max(4, Math.round(ent.pvMax * 0.12)) : Infinity.
2. Heal effect (108) must use the spell's real heal values: min = Math.min(cap, sp.heal[0]), max = Math.min(cap, sp.heal[1]) (v3.4.1 enemyCast caps enemy heals at 12% pvMax), not min=max=cap. Shield (105) keeps min=max=cap but if ent is missing use 4.
Change nothing else.
