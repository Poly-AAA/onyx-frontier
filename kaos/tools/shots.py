"""Captures portrait headless (393x873) : combat de ligue, ville libre, dialogue IA, baston 2v1 avec spectateurs."""
import json, sys, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8797/?new=1"
OUT = "screenshots/"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = b.new_page(viewport={"width": 393, "height": 873}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.screenshot(path=OUT + "01-combat-ligue.png")
    # gagne/termine le combat de ligue via les vrais sorts
    for i in range(80):
        pg.evaluate("() => { const g=KAOS.g; if(g.brawl){ document.querySelectorAll('.spell:not([disabled])')[0]?.click(); } }")
        pg.wait_for_timeout(400)
        if pg.evaluate("() => !KAOS.g.brawl"): break
    pg.wait_for_timeout(1500)
    st = pg.evaluate("() => ({phase: KAOS.g.phase, career: KAOS.g.career, pv: KAOS.g.state.hero.pv, lvl: KAOS.g.state.hero.level, log: KAOS.g.log.slice(-6)})")
    pg.screenshot(path=OUT + "02-apres-ligue.png")
    # balade : vers le parc (cerisiers)
    pg.evaluate("() => { const g=KAOS.g, p=g.city.poi('parc'); g.player.x=p.door.x; g.player.y=p.door.y+3; g.player.path=[]; }")
    pg.wait_for_timeout(2500); pg.screenshot(path=OUT + "03-parc-cerisiers.png")
    # dialogue avec Rico (LLM si serveur + clé, sinon script)
    pg.evaluate("() => { const g=KAOS.g, n=KAOS.G.npc(g,'rico'); g.player.x=n.x+1; g.player.y=n.y; KAOS.openDialogue('rico'); }")
    pg.wait_for_timeout(4000)
    pg.click("#dlgChoices button[data-k=job]"); pg.wait_for_timeout(5000)
    dlg = pg.evaluate("() => [...document.querySelectorAll('#dlgLog .line')].map(e=>e.textContent)")
    pg.screenshot(path=OUT + "04-dialogue-ia.png")
    if pg.query_selector("#mOk"): pg.click("#mOk")
    pg.click("#dlgClose"); pg.wait_for_timeout(500)
    # baston contre Kross : Vex se ligue (2v1), les PNJ s'attroupent
    pg.evaluate("""() => { const g=KAOS.g, k=KAOS.G.npc(g,'brute'), v=KAOS.G.npc(g,'vex'), pl=g.city.poi('place');
      g.player.x=pl.door.x; g.player.y=pl.door.y; k.ko=false; k.x=g.player.x+1.5; k.y=g.player.y; v.ko=false; v.x=g.player.x+5; v.y=g.player.y+3;
      g.npcs.forEach((n,i)=>{ if(n.id!=='brute'&&n.id!=='vex'){ n.x=g.player.x-6+i; n.y=g.player.y+7; n.path=[]; n.fear=0; } });
      g.state.hero.pv=g.state.hero.pvMax; KAOS.G.startBrawl(g,[k]); }""")
    pg.wait_for_timeout(2500); pg.screenshot(path=OUT + "05-baston-2v1-spectateurs.png")
    fight = pg.evaluate("() => ({foes: KAOS.g.brawl ? KAOS.g.brawl.foes.map(f=>f.hero.name+':'+f.pv) : null, spect: KAOS.g.npcs.filter(n=>n.goal==='spectate').map(n=>n.name)})")
    for i in range(120):
        if pg.evaluate("() => !KAOS.g.brawl"): break
        pg.evaluate("() => document.querySelectorAll('.spell:not([disabled])')[0]?.click()"); pg.wait_for_timeout(400)
    pg.wait_for_timeout(800); pg.screenshot(path=OUT + "06-apres-baston.png")
    end = pg.evaluate("() => KAOS.g.log.slice(-4)")
    # métier
    pg.evaluate("() => { const g=KAOS.g, p=g.city.poi('garage'); g.player.x=p.door.x; g.player.y=p.door.y; }"); pg.wait_for_timeout(800)
    pg.click("#btnJobs"); pg.wait_for_timeout(300); pg.screenshot(path=OUT + "07-metiers.png")
    print(json.dumps({"apres_ligue": st, "dialogue": dlg, "baston": fight, "fin_baston": end, "erreurs": errs}, ensure_ascii=False, indent=1))
    b.close()
