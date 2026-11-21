# Outil de vérification (assistant) : ouvre la page en file:// sans réseau, collecte console, résultats, captures.
import json, sys
from playwright.sync_api import sync_playwright
page_path = sys.argv[1]; shot_prefix = sys.argv[2]
out = {"console": [], "pageerrors": [], "requests": []}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--allow-file-access-from-files"])
    for (w, h) in [(393, 873), (360, 800)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, offline=True)
        pg = ctx.new_page()
        pg.on("console", lambda m: out["console"].append(f"{m.type}: {m.text}"))
        pg.on("pageerror", lambda e: out["pageerrors"].append(str(e)))
        pg.on("request", lambda r: out["requests"].append(r.url) if not r.url.startswith("file://") else None)
        pg.goto("file://" + page_path)
        pg.wait_for_function("window.__brainsDone === true", timeout=15000)
        res = pg.evaluate("window.__brainsResults")
        out[f"results_{w}"] = [{k: r.get(k) for k in ("brain", "totalActions", "illegal", "error")} | {"unsupported": sorted({u for t in r.get("turns", []) for u in (t.get("unsupported") or [])}), "finalBoss": r.get("finalBoss")} for r in res]
        pg.screenshot(path=f"{shot_prefix}-{w}x{h}.png", full_page=True)
        ctx.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
