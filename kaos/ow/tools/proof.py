"""Preuves : réseau coupé, 0 sprite 2D, captures 393x873, stats GPU, overflow 360/320."""
import json, sys, subprocess, time
from playwright.sync_api import sync_playwright
PORT = 8799
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
URL = f"http://127.0.0.1:{PORT}/index.html"
errs, external, images, total = [], [], [], {"bytes": 0}

def route(r):
    u = r.request.url
    if not u.startswith(f"http://127.0.0.1:{PORT}") and not u.startswith("data:") and not u.startswith("blob:"):
        external.append(u); return r.abort()
    r.continue_()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = b.new_context(viewport={"width": 393, "height": 873}, device_scale_factor=1, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.route("**/*", route)
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        def resp(r):
            try: total["bytes"] += len(r.body())
            except Exception: pass
            if r.request.resource_type == "image" or r.url.endswith((".png", ".gif", ".jpg", ".webp")):
                if "/screenshots/" not in r.url: images.append(r.url)
        pg.on("response", resp)
        pg.goto(URL, wait_until="domcontentloaded")
        pg.wait_for_function("() => window.NF && NF.terrain && NF.terrain.live.size >= 9 && NF.party && NF.party.every(p => p.rig) && NF.walkers.every(w => w.rig)", timeout=180000)
        pg.wait_for_timeout(2000)

        def stats():
            return pg.evaluate("() => ({backend: NF.eng.backend, fps: NF.state.fps, stats: NF.state.stats, walkers: NF.walkers.length, props: NF.props.objects.length, playerRig: !!NF.player.rig})")

        # 05 persos marchent — près du joueur + PNJ
        pg.evaluate("""() => {
          NF.state.minutes = 11*60;
          NF.cam.dist = 16; NF.cam.yaw = 0.7;
          const w = NF.walkers.find(x => x.def.id === 'flic_1') || NF.walkers[0];
          const p = w.body.root.position;
          const b = NF.player.ch.body;
          b.setNextKinematicTranslation({x:p.x+3,y:2,z:p.z+3});
          NF.player.target = {x:p.x+10,y:0,z:p.z+3};
        }""")
        pg.wait_for_timeout(1500)
        pg.screenshot(path="screenshots/05-persos-marchent.png")

        # 06 routine PNJ — secrétaire assise + civil en pause/interaction
        pg.evaluate("""() => {
          NF.player.target = null;
          const s = NF.walkers.find(x => x.def.id === 'secretary_1') || NF.walkers[0];
          const p = s.body.root.position;
          NF.player.ch.body.setNextKinematicTranslation({x:p.x+4,y:2,z:p.z+3});
          NF.cam.dist = 14; NF.cam.yaw = 0.5;
          NF.state.minutes = 21*60; // nuit : les scriptés rentrent / s'assoient
        }""")
        pg.wait_for_timeout(2000)
        pg.screenshot(path="screenshots/06-routine-pnj.png")

        # 07 objets + véhicules
        pg.evaluate("""() => {
          NF.state.minutes = 12*60;
          NF.player.ch.body.setNextKinematicTranslation({x:210,y:2,z:255});
          NF.cam.dist = 22; NF.cam.yaw = -0.4;
        }""")
        pg.wait_for_timeout(1200)
        pg.screenshot(path="screenshots/07-objets-vehicules.png")

        # 08 route — axe de rue, pointillés, pas de rambarde rose
        pg.evaluate("""() => {
          NF.player.ch.body.setNextKinematicTranslation({x:200,y:2,z:250});
          NF.cam.dist = 40; NF.cam.yaw = 0; NF.cam.update({x:200,y:1,z:250});
          NF.state.minutes = 12*60;
        }""")
        pg.wait_for_timeout(1200)
        pg.screenshot(path="screenshots/08-route.png")

        # 09 propre / 10 sale — même cadrage
        frame = """() => {
          NF.player.ch.body.setNextKinematicTranslation({x:210,y:2,z:248});
          NF.cam.dist = 18; NF.cam.yaw = 0.85;
          NF.state.minutes = 12*60;
        }"""
        pg.evaluate(frame)
        pg.evaluate("() => NF.dirt.setAll(0)")
        pg.wait_for_timeout(800)
        pg.screenshot(path="screenshots/09-propre.png")
        pg.evaluate(frame)
        pg.evaluate("() => NF.dirt.setAll(1)")
        pg.wait_for_timeout(800)
        pg.screenshot(path="screenshots/10-sale.png")
        pg.evaluate("() => NF.dirt.setAll(0)")

        info = stats()
        walk = pg.evaluate("() => ({npc: NF.walkers.map(w => [w.def.id, w.class, w.mode, w.body.root.position.x.toFixed(1)]), playerSpeed: NF.player.speed.toFixed(2), clips: Object.keys(NF.player.rig.actions)})")
        saved = pg.evaluate("() => { document.querySelector('#saveBtn').click(); document.querySelector('#saveBtn').click(); return [!!localStorage.getItem('neofaille.v1'), !!localStorage.getItem('neofaille.v1.bak'), JSON.parse(localStorage.getItem('neofaille.v1')||'{}').dirt ? Object.keys(JSON.parse(localStorage.getItem('neofaille.v1')).dirt).length : 0]; }")
        over = {}
        for w in (360, 320):
            pg.set_viewport_size({"width": w, "height": 740}); pg.wait_for_timeout(400)
            over[w] = pg.evaluate("w => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return e.id !== 'view' && getComputedStyle(e).opacity !== '0' && !e.hidden && (r.right > w + 0.5 || r.left < -0.5) && r.width > 0; }).map(e => e.id || e.tagName)", w)
        b.close()
finally:
    srv.terminate()
print(json.dumps({"info": info, "walk": walk, "save": saved, "overflow": over, "external_requests": external, "images_2d": images, "loaded_MB": round(total["bytes"] / 1e6, 2), "console_errors": errs}, ensure_ascii=False, indent=1))
