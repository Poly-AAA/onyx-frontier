You previously wrote the HTML file below. Fix ALL listed issues and return the COMPLETE corrected file as one ```html code block, no explanation.

=== ISSUES (from a real headless run) ===
1. Mobile layout BUG (headless screenshot at 393x873): the page overflows horizontally (document ~487px wide, left part of title/select/canvas cut off). Fix: `*{box-sizing:border-box}`, html,body{margin:0;overflow-x:hidden}, main container width:100%;max-width:430px;margin:0 auto;padding:8px; canvas {display:block;width:100%;height:auto}; table {width:100%;table-layout:fixed;word-break:break-word;font-size:12px}; select/button wrap with flex-wrap.
2. The effects column prints raw JSON of the whole result. Print a short French text instead: for each effect `${id} −${amount}` (damage, add ' KO' if killed, ' (bouclier ${absorbed})' if absorbed>0) or `${id} +${amount}` (heal/shield); '—' if none.
3. The canvas must draw the boss path of ALL move actions of all 3 turns (one polyline per move starting from the boss position before that move: record `from:{c,r}` before calling playTurn? -> instead compute: keep the boss start position, and for each move action draw from the previous boss position through action.path cells, updating the previous position to action.to). Draw also the boss START position as a small hollow red circle.
4. Summary 'unsupported' must list the UNIQUE step names (e.g. 'teleportNearEnemy, attractEnemy'), not a count.
5. FIXED never moves (Araknemu: attack only from its own cell), so in the shared world it does nothing. Add per-brain start overrides: START = { FIXED: {c:5, r:7} } (boss starts within 'arc' range of the hero, line of sight clear) so that every brain demonstrates at least one legal action. Mention in the subtitle: "FIXED démarre à portée (il ne se déplace jamais)".
Keep everything else (script order, window.__brainsResults/__brainsDone, no Math.random, offline, no blue glow).

=== CURRENT FILE ===
```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Neo-Faille · cerveaux IA (adaptateur v3.4.1)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;padding:0;background:#15131c;color:#e8e2d0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center}
  h1{margin:0.5em 0 0.2em;font-size:1.4em}
  h2{margin:0 0 0.8em;font-size:1em;font-weight:normal;color:#a09f9c}
  #controls{margin-bottom:0.8em;display:flex;gap:0.5em;align-items:center}
  select,button{padding:0.4em 0.6em;font-size:0.9em;border:none;border-radius:4px;background:#3a3542;color:#e8e2d0}
  canvas{background:#2b2832;display:block;width:100%;max-width:430px;height:auto;margin-bottom:0.8em}
  table{border-collapse:collapse;width:100%;max-width:430px;margin-bottom:0.8em}
  th,td{border:1px solid #3a3542;padding:0.3em 0.4em;font-size:0.8em;text-align:left}
  th{background:#3a3542}
  .summary{max-width:430px;width:100%;font-size:0.8em}
  .summary li{margin:0.2em 0}
</style>
</head>
<body>
<h1>Neo-Faille · cerveaux IA (adaptateur v3.4.1)</h1>
<h2>Démo hors‑ligne des différents cerveaux</h2>
<div id="controls">
  <label for="brainSelect">Cerveau :</label>
  <select id="brainSelect"></select>
  <button id="replayBtn">Rejouer</button>
</div>
<canvas id="gridCanvas" width="364" height="364"></canvas>
<table id="logTable">
  <thead><tr><th>Tour</th><th>Step</th><th>Action</th><th>Legal</th><th>Effets</th></tr></thead>
  <tbody></tbody>
</table>
<ul class="summary" id="summaryList"></ul>

<script src="vendor/combat-grid.from-v3.4.1.js"></script>
<script src="vendor/dofus-touch-ai.from-v3.4.1.js"></script>
<script src="brains-adapter.js"></script>
<script>
(() => {
  const CELL = 26;
  const GRID_SIZE = 14;
  const BRAINS = ['TACTICAL','AGGRESSIVE','SUPPORT','BLOCKING','RUNAWAY','LUNATIC','FIXED','BOSS_BOUNTY_HUNTER','BATTLE_CLERIC','TACTICAL_SUPPORT_FOCUS_KILL'];
  const SPELLS = {
    punch:{id:'punch',name:'Coup',cost:2,range:1,dmg:[8,12]},
    arc:{id:'arc',name:'Trait',cost:3,range:5,minRange:2,dmg:[10,14],element:'air',los:true},
    soin:{id:'soin',name:'Soin',cost:3,range:3,heal:[8,12],type:'heal'},
    zone:{id:'zone',name:'Onde',cost:4,range:4,aoe:1,dmg:[6,9],element:'feu'}
  };
  const makeWorld = () => {
    const G = {
      blocks:new Set(['6,6','6,7','7,6','3,9','10,4','8,11','4,3']),
      roster:[],
      player:{name:'Héros',c:1,r:7,pv:100,pvMax:100,pa:6,paMax:6,pm:3,pmMax:3,alive:true,stats:{agi:10},spells:['punch','arc']},
      enemy:{id:'boss',name:'Boss',side:'b',c:12,r:6,pv:50,pvMax:120,pa:7,paMax:7,pm:4,pmMax:4,alive:true,stats:{agi:8},spells:['punch','arc','soin','zone']},
    };
    const ally = {id:'allie',name:'Alliée',side:'a',c:2,r:9,pv:60,pvMax:80,pa:6,paMax:6,pm:3,pmMax:3,alive:true,stats:{agi:5},spells:['punch']};
    const m2 = {id:'m2',name:'Sbire',side:'b',c:11,r:9,pv:30,pvMax:60,pa:6,paMax:6,pm:3,pmMax:3,alive:true,stats:{agi:4},spells:['punch','soin']};
    G.roster=[ally,G.enemy,m2];
    G.playerSide='a';
    return G;
  };
  const results = [];
  const runAll = () => {
    for (const brain of BRAINS) {
      const G = makeWorld();
      const per = {brain, turns:[], illegal:0, totalActions:0, unsupported:[], error:null, finalBoss:null, heroPv:null, allyPv:null};
      try {
        for (let t=0;t<3;t++) {
          const opts = {gridSize:GRID_SIZE, spellById:id=>SPELLS[id]||null, seed:100+t, brain, resetPoints:true};
          const turnRes = window.NeoFailleBrainsAdapter.playTurn(G, G.enemy, opts);
          const turnInfo = {t, actions:[], unsupported:turnRes.unsupported||[]};
          per.unsupported.push(...turnInfo.unsupported);
          for (const act of turnRes.actions||[]) {
            const a = act.action||{};
            const entry = {
              type:a.type,
              spellId:a.spellId||null,
              to:a.to||null,
              target:a.target||null,
              legal:act.legal,
              stepType:act.stepType,
              effects:act.result||null
            };
            turnInfo.actions.push(entry);
            per.totalActions++;
            if (!act.legal.ok) per.illegal++;
          }
          per.turns.push(turnInfo);
        }
        per.finalBoss={c:G.enemy.c,r:G.enemy.r,pv:G.enemy.pv};
        per.heroPv=G.player.pv;
        const ally = G.roster.find(u=>u.id==='allie');
        per.allyPv=ally?ally.pv:null;
      } catch (e) {
        per.error=e.message||String(e);
        console.error('Brain error',brain, e);
      }
      results.push(per);
    }
    window.__brainsResults = results;
    window.__brainsDone = true;
    populateUI();
  };
  const populateUI = () => {
    const select = document.getElementById('brainSelect');
    select.innerHTML = '';
    results.forEach((r,i)=>{ const opt=document.createElement('option'); opt.value=i; opt.textContent=r.brain; select.appendChild(opt); });
    const summary = document.getElementById('summaryList');
    summary.innerHTML = '';
    results.forEach(r=>{
      const li=document.createElement('li');
      li.textContent=`${r.brain}: actions=${r.totalActions}, illegal=${r.illegal}, unsupported=${r.unsupported.length}${r.error?' – error: '+r.error:''}`;
      summary.appendChild(li);
    });
    select.addEventListener('change',drawSelected);
    document.getElementById('replayBtn').addEventListener('click',()=>{ results.length=0; runAll(); });
    drawSelected();
  };
  const drawSelected = () => {
    const idx = document.getElementById('brainSelect').value;
    const data = results[idx];
    if (!data) return;
    drawCanvas(data);
    fillLog(data);
  };
  const drawCanvas = (data) => {
    const canvas=document.getElementById('gridCanvas');
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // grid
    ctx.strokeStyle='#3a3542';
    for(let i=0;i<=GRID_SIZE;i++){
      ctx.beginPath();ctx.moveTo(i*CELL,0);ctx.lineTo(i*CELL,GRID_SIZE*CELL);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,i*CELL);ctx.lineTo(GRID_SIZE*CELL,i*CELL);ctx.stroke();
    }
    // blocks
    ctx.fillStyle='#3a3542';
    data.turns.forEach(t=>t.actions.forEach(a=>{})); // ignore
    const G = makeWorld(); // recreate to get blocks (static)
    G.blocks.forEach(b=>{ const [c,r]=b.split(',').map(Number); ctx.fillRect((c-1)*CELL,(r-1)*CELL,CELL,CELL); });
    // units final positions
    const final = (()=>{ // capture final world from last turn
      const world = makeWorld();
      // apply moves from actions to boss only (simplified)
      const boss = world.enemy;
      data.turns.forEach(turn=>{ turn.actions.forEach(act=>{ if(act.type==='move' && act.to){ boss.c=act.to.c; boss.r=act.to.r; } }); });
      // apply damage/heal from results (simplified)
      data.turns.forEach(turn=>{ turn.actions.forEach(act=>{ if(act.effects && act.effects.damage){ boss.pv-=act.effects.damage; } if(act.effects && act.effects.heal){ boss.pv+=act.effects.heal; } }); });
      return world;
    })();
    const drawUnit = (unit, color) => {
      const x=(unit.c-1)*CELL+CELL/2;
      const y=(unit.r-1)*CELL+CELL/2;
      ctx.beginPath();ctx.arc(x,y,CELL*0.35,0,2*Math.PI);
      if(unit.alive===false){ ctx.strokeStyle='#e8e2d0';ctx.lineWidth=2;ctx.stroke();}
      else{ ctx.fillStyle=color;ctx.fill();}
    };
    // player (gold)
    drawUnit(final.player,'#d9a441');
    // ally
    const ally = final.roster.find(u=>u.id==='allie');
    if(ally) drawUnit(ally,'#d9a441');
    // boss (red)
    drawUnit(final.enemy,'#b5443c');
    // other enemies
    final.roster.filter(u=>u.side==='b' && u.id!=='boss').forEach(u=>drawUnit(u,'#b5443c'));
    // boss path
    ctx.strokeStyle='#e8e2d0';
    ctx.lineWidth=2;
    ctx.beginPath();
    let started=false;
    data.turns.forEach(turn=>{ turn.actions.forEach(act=>{ if(act.type==='move' && act.to){ const x=(act.to.c-1)*CELL+CELL/2; const y=(act.to.r-1)*CELL+CELL/2; if(!started){ctx.moveTo(x,y);started=true;} else ctx.lineTo(x,y); } }); });
    ctx.stroke();
    // cast targets
    ctx.strokeStyle='#f08a4b';
    ctx.lineWidth=2;
    data.turns.forEach(turn=>{ turn.actions.forEach(act=>{ if(act.type==='cast' && act.target){ const x=(act.target.c-1)*CELL+CELL/2; const y=(act.target.r-1)*CELL+CELL/2; ctx.beginPath();ctx.moveTo(x-5,y-5);ctx.lineTo(x+5,y+5);ctx.moveTo(x+5,y-5);ctx.lineTo(x-5,y+5);ctx.stroke(); } }); });
  };
  const fillLog = (data) => {
    const tbody=document.querySelector('#logTable tbody');
    tbody.innerHTML='';
    data.turns.forEach(turn=>{ turn.actions.forEach((act,i)=>{ const tr=document.createElement('tr');
      tr.innerHTML=`<td>${turn.t}</td><td>${act.stepType||''}</td><td>${act.type}${act.spellId?(' '+act.spellId):''}</td><td>${act.legal.ok?'✓':'✗'}</td><td>${act.effects?JSON.stringify(act.effects):''}</td>`;
      tbody.appendChild(tr);
    });});
  };
  document.addEventListener('DOMContentLoaded',runAll);
})();
</script>
</body>
</html>
```
