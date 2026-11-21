Write ONE self-contained offline HTML file `brains-test.html` (no CDN, no network, no external fonts, no modules; plain <script> tags; must work from file://). Mobile portrait first (viewport meta, width 100%, max-width 430px centered, dark neutral background #15131c, NO blue glow effects, no box-shadow glow).
It loads, in this order, with classic script tags (relative paths):
  <script src="vendor/combat-grid.from-v3.4.1.js"></script>
  <script src="vendor/dofus-touch-ai.from-v3.4.1.js"></script>
  <script src="brains-adapter.js"></script>
These define window.CombatGrid, window.DofusTouchAI and window.NeoFailleBrainsAdapter (A). API used:
  A.playTurn(G, ent, opts) -> {brain, actions:[{action, stepType, brain, legal:{ok,reason}, result}], unsupported:[strings], steps}
  action = {type:'move', path:[{c,r}], to:{c,r}} | {type:'cast', spellId, target:{c,r}}
  opts = {gridSize:14, spellById:(id)=>SPELLS[id]||null, seed, brain, resetPoints:true}
World (fresh for each brain, function makeWorld()):
  SPELLS = { punch:{id:'punch',name:'Coup',cost:2,range:1,dmg:[8,12]}, arc:{id:'arc',name:'Trait',cost:3,range:5,minRange:2,dmg:[10,14],element:'air',los:true}, soin:{id:'soin',name:'Soin',cost:3,range:3,heal:[8,12],type:'heal'}, zone:{id:'zone',name:'Onde',cost:4,range:4,aoe:1,dmg:[6,9],element:'feu'} }
  G = {blocks:new Set(['6,6','6,7','7,6','3,9','10,4','8,11','4,3']), roster:[]}
  G.player = {name:'Héros', c:1, r:7, pv:100, pvMax:100, pa:6, paMax:6, pm:3, pmMax:3, alive:true, stats:{agi:10}, spells:['punch','arc']}
  ally = {id:'allie', name:'Alliée', side:'a', c:2, r:9, pv:60, pvMax:80, pa:6, paMax:6, pm:3, pmMax:3, alive:true, stats:{agi:5}, spells:['punch']}
  G.enemy = {id:'boss', name:'Boss', side:'b', c:12, r:6, pv:50, pvMax:120, pa:7, paMax:7, pm:4, pmMax:4, alive:true, stats:{agi:8}, spells:['punch','arc','soin','zone']}
  m2 = {id:'m2', name:'Sbire', side:'b', c:11, r:9, pv:30, pvMax:60, pa:6, paMax:6, pm:3, pmMax:3, alive:true, stats:{agi:4}, spells:['punch','soin']}
  G.roster = [ally, G.enemy, m2]
BRAINS = ['TACTICAL','AGGRESSIVE','SUPPORT','BLOCKING','RUNAWAY','LUNATIC','FIXED','BOSS_BOUNTY_HUNTER','BATTLE_CLERIC','TACTICAL_SUPPORT_FOCUS_KILL'].
For each brain: makeWorld(); for turn t in 0..2: res = A.playTurn(G, G.enemy, {...opts, brain, seed: 100 + t}) inside try/catch; collect per brain: {brain, turns:[{t, actions:[{type, spellId, to, target, legal, stepType, effects}], unsupported}], illegal: count of actions with legal.ok !== true, totalActions, finalBoss:{c,r,pv}, heroPv, allyPv, error: message or null}. Only the boss plays (the heroes stay still: it is a brain demo).
UI: title "Neo-Faille · cerveaux IA (adaptateur v3.4.1)", a short subtitle, a select to choose the brain + a "Rejouer" button, and a <canvas> 14x14 grid (cell 26px, square grid, top-down) showing for the selected brain: blocks (dark grey #3a3542), units as filled circles (side a: #d9a441 gold, side b: #b5443c red, dead units hollow), the boss path of every move action as a polyline (#e8e2d0) and cast targets as small crosses (#f08a4b). Below, a compact log table for the selected brain (turn, step type, action, legal ✓/✗, effects). And a summary list of ALL brains: name, total actions, illegal count, unsupported steps, error.
For automated testing set window.__brainsResults = array of the per-brain objects and window.__brainsDone = true when finished. Never call console.error/console.warn unless a real error occurs (then console.error the message). No Math.random anywhere in the page. Keep CSS minimal and readable on 360px wide screens (canvas scales with CSS width:100%; height:auto).
Return ONLY one ```html code block.
