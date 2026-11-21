Write a Node.js test file `brains-adapter.test.js` using ONLY `node:test` and `node:assert/strict` (CommonJS require). No other dependency.
Setup at top (paths relative to __dirname which is /workspace/game/bots/groq/tests):
  require('../vendor/combat-grid.from-v3.4.1.js'); require('../vendor/dofus-touch-ai.from-v3.4.1.js'); const A = require('../src/brains-adapter.v4.js');
These set globalThis.CombatGrid and globalThis.DofusTouchAI. A exposes: createRules(G, opts) -> {inBounds, occupied(c,r,ent), dist, unitSide, tackleFor(ent,c,r)->{pm,pa}, spellCellState(from,to,sp)->'ok'|'out'|'blocked', enemiesOf(ent), alliesOf(ent), livingUnits()}, toFighter(ent, gridSize, teamId), toEngineSpell(sp, ent) -> {id, apCost, effects:[{effectId,min,max,zoneShape,zoneSize,duration}]}|null, createContext(G, ent, opts), reachable(G, ent, opts) -> [{c,r,mpCost,apCost,path:[{c,r}]}] (includes start cell with empty path), decideNext(G, ent, opts) -> {action, stepType, brain}|null, isLegal(G, ent, action, opts) -> {ok, reason}, applyActionSim(G, ent, action, opts), playTurn(G, ent, opts) -> {brain, actions:[{action, stepType, brain, legal, result}], unsupported:[], steps}, SPELL_EFFECT_MAP, resolveBrain.
Actions: {type:'move', path:[{c,r}...], to:{c,r}} or {type:'cast', spellId, target:{c,r}}.

World factory (write a function makeWorld(overrides) returning a fresh G every call):
  SPELLS = { punch:{id:'punch',cost:2,range:1,dmg:[8,12]}, arc:{id:'arc',cost:3,range:5,minRange:2,dmg:[10,14],element:'air',los:true}, soin:{id:'soin',cost:3,range:3,heal:[8,12],type:'heal'}, zone:{id:'zone',cost:4,range:4,aoe:1,dmg:[6,9],element:'feu'} };
  opts base = { gridSize: 14, spellById: id => SPELLS[id] || null, seed: 3 }.
  G = { blocks: new Set(), roster: [] }; G.player = {name:'Hero', c:1, r:7, pv:100, pvMax:100, pa:6, paMax:6, pm:3, pmMax:3, alive:true, stats:{agi:10}, spells:['punch','arc']};
  G.enemy = {id:'boss', name:'Boss', side:'b', c:5, r:7, pv:120, pvMax:120, pa:7, paMax:7, pm:4, pmMax:4, alive:true, stats:{agi:8}, spells:['punch','arc','soin','zone']}; G.roster = [G.enemy];

Tests (each its own `test(...)`):
1. spell effect mapping: toEngineSpell(SPELLS.arc).effects[0].effectId === 98 (air) ; zone -> 99 with zoneShape 'C' zoneSize 1 ; soin -> 108 ; a spell {id:'x',cost:1,range:1} -> null.
2. LoS: with G.blocks = new Set(['3,7']) spellCellState(enemy at 5,7 -> player 1,7, arc) is not 'ok'; without blocks it is 'ok'. Range: player at 1,7 and enemy moved to 7,7 (distance 6) -> arc not 'ok'; minRange: enemy at 2,7 (distance 1) -> arc not 'ok'.
3. Tackle: enemy at 2,7 adjacent to player (agi 10) with enemy agi 8: rules.tackleFor(enemy, 2,7).pm >= 2 (tackle applies); reachable from that cell: every result has mpCost <= 4 and cells next to the start cost at least 2 MP.
4. reachable: with G.blocks containing '6,7', no reachable cell equals 6,7 and no cell is occupied by the player; all paths consist of adjacent steps.
5. isLegal: a cast with too few PA (set enemy.pa = 1) is illegal; a move whose path jumps 2 cells is illegal; a move into a block is illegal.
6. Every brain plays legally: for each brain in ['TACTICAL','AGGRESSIVE','SUPPORT','BLOCKING','RUNAWAY','LUNATIC','FIXED','BOSS_BOUNTY_HUNTER','BATTLE_CLERIC','TACTICAL_SUPPORT_FOCUS_KILL'] build a world where enemy is at 9,7, add a hurt ally of the boss {id:'m2', name:'M2', side:'b', c:10, r:9, pv:20, pvMax:60, pa:6, paMax:6, pm:3, pmMax:3, alive:true, stats:{agi:4}, spells:['punch','soin']} to G.roster, run playTurn(G, G.enemy, {...opts, brain}) 3 times with resetPoints:true; assert every recorded action has legal.ok === true, enemy pa >= 0 and pm >= 0 after each turn, and that the total number of actions across the 3 turns is >= 1 for every brain except 'FIXED' (FIXED only casts from its cell).
7. Brains differ: AGGRESSIVE ends closer (Manhattan) to the player than RUNAWAY after 3 turns in the world of test 6 (enemy starting at 9,7).
8. Determinism: two fresh worlds, same opts and seed, playTurn LUNATIC 3 turns each -> JSON.stringify of the actions lists are identical and final pv identical.
9. Composite resolution: decideNext with brain 'BOSS_BOUNTY_HUNTER' returns a decision whose brain === 'BOSS_BOUNTY_HUNTER'.
10. unsupported: playTurn AGGRESSIVE from a world where player is out of reach reports 'teleportNearEnemy' or 'attractEnemy' in result.unsupported (they do not exist in v3.4.1).
Return ONLY the code block.
