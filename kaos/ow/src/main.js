/** Néo-Faille OW — V1 light : C0 terrain, C1 moteur, C2 ville, joueur + PNJ scriptés. Tout est piloté par data/*.json. */
import { createEngine } from "./engine.js";
import { createPhysics } from "./phys.js";
import { createWorldGen, mulberry32, chunkOf } from "./core/gen.js";
import { save as saveGame, load as loadGame } from "./core/save.js";
import { createTerrain } from "./world/terrain.js";
import { createCity } from "./world/city.js";
import { placeProps } from "./world/props.js";
import { createPlayer, createNpc, createCamera } from "./actors.js";
import { createDirt } from "./dirt.js";
import { Layers, loadMods } from "./layers.js";

const $ = (s) => document.querySelector(s);
const getJSON = (f) => fetch("data/" + f).then((r) => r.json());

async function boot() {
  const cfg = await getJSON("config.json");
  const data = {};
  await Promise.all(cfg.files.concat([cfg.player.file]).map(async (f) => { data[f.replace(".json", "")] = await getJSON(f); }));
  const saved = loadGame(localStorage);
  const eng = await createEngine(cfg, $("#view"));
  const phys = await createPhysics(cfg.player.gravity);
  const gen = createWorldGen(cfg.seed, data.biomes);
  const terrain = createTerrain(eng, phys, gen, cfg, data);
  const city = createCity(eng, phys, data, mulberry32(cfg.seed));
  (saved && saved.destroyed || []).forEach((id) => city.destroy(id));
  const props = placeProps(eng, (data.props && data.props.items) || []);
  const p1 = createPlayer(eng, phys, cfg, data, saved, { dirtId: "player:0" });
  const s1 = p1.pos();
  const p2 = createPlayer(eng, phys, cfg, data, null, { asset: "csaf_patrol", dirtId: "player:1", spawn: [s1.x + 3, s1.y + 1, s1.z + 2] });
  const party = [p1, p2]; let active = 0;
  let player = p1;
  const walkers = (data.npcs.walkers || []).map((w) => createNpc(eng, w, data["assets.manifest"]));
  const dirt = createDirt(eng, data.dirt, saved && saved.dirt);
  dirt.register(p1.body.root, "player:0", (saved && saved.dirt && saved.dirt["player:0"]) || 0);
  dirt.register(p2.body.root, "player:1", 0);
  walkers.forEach((w) => dirt.register(w.body.root, "npc:" + w.def.id));
  const cam = createCamera(eng, cfg);
  const state = { minutes: (saved && saved.minutes) ?? (cfg.startHour ?? 11) * 60, destroyed: (saved && saved.destroyed) || [], mode: "move", fps: 0, stats: { calls: 0, tris: 0, textures: 0 } };
  const api = { cam: null, eng, phys, data, cfg, city, terrain, props, dirt, get player() { return player; }, party, walkers, Layers, state };
  api.cam = cam;
  api.addDirt = (obj, amount, cause) => dirt.addDirt(obj, amount, cause);
  window.NF = api;
  await Promise.all([p1.ready, p2.ready, ...walkers.map((w) => w.ready), props.ready]);
  props.objects.forEach((o) => dirt.register(o, o.userData.dirtId));
  city.grp.children.forEach((o) => { if (o.userData && o.userData.dirt) dirt.register(o, "city:" + (o.userData.id || o.uuid)); });
  if (saved && saved.dirt) dirt.restore(saved.dirt);
  await loadMods(cfg.mods, api);

  const ray = new eng.THREE.Raycaster(), ndc = new eng.THREE.Vector2();
  const pts = new Map(); let down = null, gesture = null;
  const view = $("#view");
  view.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) down = [e.clientX, e.clientY]; else { down = null; gesture = null; } });
  view.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size !== 2) return;
    const [a, b] = [...pts.values()], d = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (gesture) { cam.zoom(gesture.d / Math.max(d, 1)); cam.rotate(ang - gesture.ang); }
    gesture = { d, ang };
  });
  const up = (e) => {
    pts.delete(e.pointerId); if (pts.size < 2) gesture = null;
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 12) { down = null; return; } down = null;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, eng.camera);
    const hit = ray.intersectObjects(city.pickables.concat(terrain.pickables()), false)[0]; if (!hit) return;
    if (state.mode === "destroy" && hit.object.userData.kind === "building") {
      const r = city.damage(hit.object); if (r === "detruit") state.destroyed.push(hit.object.userData.id);
      toast(r === "detruit" ? "Bâtiment détruit → chantier" : "Fissuré"); return;
    }
    player.target = hit.point.clone();
  };
  view.addEventListener("pointerup", up); view.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); gesture = null; down = null; });
  view.addEventListener("wheel", (e) => { e.preventDefault(); if (e.shiftKey || e.altKey) cam.rotate(e.deltaY * 0.003); else cam.zoom(e.deltaY > 0 ? cfg.camera.step : 1 / cfg.camera.step); }, { passive: false });
  const keys = new Set();
  addEventListener("keydown", (e) => { keys.add(e.key.toLowerCase()); if (e.key === "Tab") { e.preventDefault(); switchPerso(); } });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  const readKeys = () => {
    const k = (...a) => a.some((x) => keys.has(x));
    const f = (k("z", "w", "arrowup") ? 1 : 0) - (k("s", "arrowdown") ? 1 : 0), r = (k("d", "arrowright") ? 1 : 0) - (k("q", "arrowleft") ? 1 : 0);
    if (k("a")) cam.rotate(-0.03); if (k("e")) cam.rotate(0.03);
    player.key = f || r ? cam.toWorld(f, r) : null;
  };
  function switchPerso() { player.key = null; active = (active + 1) % party.length; player = party[active]; $("#persoBtn").textContent = "Perso " + (active + 1); }
  const doSave = () => { const p = player.pos(); return saveGame(localStorage, { player: [p.x, p.y + 0.2, p.z], pm: player.pm, minutes: state.minutes, destroyed: state.destroyed, dirt: dirt.serialize() }); };
  const bind = (id, f) => ($(id).onclick = f);
  bind("#zoomIn", () => cam.zoom(1 / cfg.camera.step)); bind("#zoomOut", () => cam.zoom(cfg.camera.step));
  bind("#pmMinus", () => { player.pm = Math.max(1, player.pm - 1); }); bind("#pmPlus", () => { player.pm = Math.min(12, player.pm + 1); });
  bind("#modeBtn", () => { state.mode = state.mode === "move" ? "destroy" : "move"; $("#modeBtn").textContent = state.mode === "move" ? "Mode : marcher" : "Mode : détruire"; });
  bind("#persoBtn", switchPerso);
  bind("#rotL", () => cam.rotate(-Math.PI / 8)); bind("#rotR", () => cam.rotate(Math.PI / 8));
  bind("#saveBtn", () => toast(doSave() ? "Sauvegardé (neofaille.v1)" : "Échec de sauvegarde"));
  bind("#creditsBtn", () => { const p = $("#credits"); p.hidden = !p.hidden; });
  bind("#creditsClose", () => { $("#credits").hidden = true; });
  setInterval(doSave, 30000);
  function toast(t) { const d = $("#toast"); d.textContent = t; d.style.opacity = 1; clearTimeout(d._t); d._t = setTimeout(() => (d.style.opacity = 0), 1800); }

  let last = performance.now(), frames = 0, acc = 0, lastH = state.minutes / 60;
  eng.renderer.setAnimationLoop(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    frames++; acc += dt; if (acc > 1) { state.fps = Math.round(frames / acc); frames = 0; acc = 0; }
    state.minutes = (state.minutes + dt * 1440 / (cfg.dayMinutes * 60)) % 1440;
    const h = state.minutes / 60, p = player.pos();
    eng.setTime(h);
    readKeys();
    phys.step(dt);
    const biome = gen.biomeAt(p.x, p.z).id;
    party.forEach((pp) => { const sp = pp.speed || 0; pp.update(dt); dirt.walk(pp.body.root, (pp.speed || 0) * dt, biome); });
    walkers.forEach((w) => w.update(dt, h));
    city.update(dt);
    dirt.tick((h - lastH + 24) % 24, props.objects.concat(city.grp.children.filter((o) => o.userData && o.userData.dirt)));
    lastH = h;
    terrain.update(p.x, p.z);
    cam.update(p);
    const fz = cfg.psx.fog, ff = cam.dist + fz.far;
    eng.U.fogNear.value = cam.dist + fz.near; eng.U.fogFar.value = ff;
    if (Math.abs(eng.camera.far - ff * 1.05) > 1) { eng.camera.far = ff * 1.05; eng.camera.updateProjectionMatrix(); }
    eng.render();
    const info = eng.renderer.info;
    if (info && info.render) { state.stats.calls = info.render.calls || 0; state.stats.tris = info.render.triangles || 0; state.stats.textures = (info.memory && info.memory.textures) || 0; }
    const [cx, cz] = chunkOf(p.x, p.z);
    $("#hud").textContent = `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor(state.minutes % 60)).padStart(2, "0")} · morceau ${cx},${cz} · ${biome} · PM ${player.pm} · ${state.fps} i/s · ${eng.backend}`;
  });
  $("#loading").remove();
}
boot().catch((e) => { console.error(e); $("#loading").textContent = "Erreur : " + e.message; });
