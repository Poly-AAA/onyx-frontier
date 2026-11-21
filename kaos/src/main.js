/** Point d'entrée navigateur : canvas, entrée tactile (tap-to-move / tap PNJ), boucle. */
import * as G from "./game.js";
import { render, loadSheets } from "./render/iso.js";
import { toTile, toScreen } from "./world/city.js";
import { probeRemote } from "./ai/dialogue.js";
import { mountUi, openDialogue } from "./ui.js";

const cv = document.getElementById("view");
const ctx = cv.getContext("2d");
const params = new URLSearchParams(location.search);
const g = G.createGame(+(params.get("seed") || 435235616));
window.KAOS = { g, G, openDialogue: (id) => openDialogue(g, G.npc(g, id)) }; // crochets de test

function resize() {
  g.dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * g.dpr; cv.height = innerHeight * g.dpr;
  cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px";
  g.cam.zoom = innerWidth < 500 ? 1.25 : 1.4;
  ctx.imageSmoothingEnabled = false;
}
addEventListener("resize", resize); resize();

let down = null;
cv.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
cv.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; }
  down = null;
  const z = g.cam.zoom, c = toScreen(g.cam.x, g.cam.y);
  const wx = (e.clientX - innerWidth / 2) / z + c.sx, wy = (e.clientY - innerHeight / 2) / z + c.sy;
  // PNJ touché ? (zone du corps au-dessus des pieds)
  let hit = null, bd = 26;
  g.npcs.forEach((n) => { if (!n.alive) return; const p = toScreen(n.x, n.y); const d = Math.hypot(p.sx - wx, p.sy - 30 - wy); if (d < bd) { bd = d; hit = n; } });
  if (hit && !g.brawl) {
    if (Math.hypot(hit.x - g.player.x, hit.y - g.player.y) < 2) return openDialogue(g, hit);
    G.movePlayerTo(g, hit.x, hit.y); g.pendingTalk = hit.id; return;
  }
  const t = toTile(wx, wy);
  G.movePlayerTo(g, Math.round(t.x), Math.round(t.y)); g.pendingTalk = null;
});
addEventListener("keydown", (e) => {
  const d = { ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1], z: [-1, -1], s: [1, 1], q: [-1, 1], d: [1, -1] }[e.key];
  if (d) G.movePlayerTo(g, Math.round(g.player.x) + d[0], Math.round(g.player.y) + d[1]);
});

const fresh = params.has("new") || !G.load(g);
loadSheets(["player", "rico", "nova", "doc", "brute", "ghost", "vendor", "cop", "thug"]).then(() => {
  mountUi(g);
  probeRemote().then((s) => s && G.toast(g, `IA des PNJ connectée (${s.provider})`));
  if (fresh || g.phase === "ligue") G.startLeagueFight(g);
  let last = performance.now();
  (function loop(now) {
    const dt = (now - last) / 1000; last = now;
    if (!g.paused) G.update(g, dt);
    if (g.pendingTalk) { const n = G.npc(g, g.pendingTalk); if (n && Math.hypot(n.x - g.player.x, n.y - g.player.y) < 1.8) { g.pendingTalk = null; g.player.path = []; openDialogue(g, n); } }
    render(ctx, g, innerWidth, innerHeight);
    requestAnimationFrame(loop);
  })(last);
});
