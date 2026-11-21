/** Saleté légère (Game Boy/PSX) : valeur 0–1, affichée en 4 paliers par échange de texture. */
export function dirtLevel(v, th) { return v >= th[2] ? 3 : v >= th[1] ? 2 : v >= th[0] ? 1 : 0; }

const cache = new Map();

/** Compose la texture de base avec un overlay de crasse (taches procédurales). */
function dirtMap(eng, base, level) {
  if (level <= 0) return base || null;
  const key = (base ? base.uuid : "none") + ":" + level;
  if (cache.has(key)) return cache.get(key);
  const { THREE } = eng, size = 64;
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const g = cv.getContext("2d");
  if (base && (base.image || base.userData.canvas)) {
    try { g.imageSmoothingEnabled = false; g.drawImage(base.image || base.userData.canvas, 0, 0, size, size); }
    catch (e) { g.fillStyle = "#888"; g.fillRect(0, 0, size, size); }
  } else { g.fillStyle = "#888"; g.fillRect(0, 0, size, size); }
  const grim = eng.tex.grime(level);
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = 0.35 + level * 0.2;
  try { g.drawImage(grim.image || grim.userData.canvas, 0, 0, size, size); } catch (e) { /* overlay facultatif */ }
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = cv; cache.set(key, t); return t;
}

export function createDirt(eng, cfg, saved) {
  const th = cfg.thresholds, rec = new Map();
  const idOf = (obj) => obj.userData.dirtId || (obj.userData.dirtId = "d" + rec.size + "_" + Math.random().toString(36).slice(2, 6));

  function apply(r) {
    const lv = dirtLevel(r.v, th);
    if (lv === r.level) return lv;
    r.level = lv;
    if (!eng || !r.obj) return lv;
    const tint = ["#ffffff", "#d8d0c4", "#b8a890", "#8a7860"][lv];
    r.obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!o.userData._cleanMat) o.userData._cleanMat = o.material;
      const clean = o.userData._cleanMat;
      if (lv === 0) { o.material = clean; return; }
      o.userData._dirtMat = o.userData._dirtMat || [];
      if (!o.userData._dirtMat[lv]) {
        const map = dirtMap(eng, clean.map, lv);
        o.userData._dirtMat[lv] = eng.material({ map, color: tint });
      }
      o.material = o.userData._dirtMat[lv];
    });
    return lv;
  }

  function ensure(obj, id) {
    const k = id || idOf(obj);
    if (!rec.has(k)) rec.set(k, { id: k, v: 0, level: -1, obj, kind: (obj && obj.userData.dirt) || "prop" });
    const r = rec.get(k); if (obj) r.obj = obj; return r;
  }

  const api = {
    /** Ajoute de la saleté (0–1). cause = walk|combat|work|time|vehicle|debug. */
    addDirt(obj, amount, cause = "debug") {
      const r = ensure(obj);
      const mul = cause === "time" && r.kind === "under" ? (cfg.districts.under || 1.8) : 1;
      r.v = Math.max(0, Math.min(1, r.v + amount * mul));
      r.cause = cause;
      apply(r);
      return r.v;
    },
    setDirt(obj, v, cause = "debug") { const r = ensure(obj); r.v = Math.max(0, Math.min(1, v)); r.cause = cause; apply(r); return r.v; },
    level: (obj) => { const r = rec.get(obj.userData && obj.userData.dirtId); return r ? r.level : 0; },
    value: (obj) => { const r = rec.get(obj.userData && obj.userData.dirtId); return r ? r.v : 0; },
    /** Nettoyage : pas encore implémenté. */
    clean(_obj) { /* stub */ },
    walk(obj, dist, biome) { const k = (cfg.walk && cfg.walk[biome]) ?? cfg.walk.default ?? 0.01; if (dist > 0 && k) api.addDirt(obj, dist * k, "walk"); },
    vehicle(obj, dist, biome) { const k = (cfg.vehicle && cfg.vehicle[biome]) ?? cfg.vehicle.default ?? 0.01; if (dist > 0 && k) api.addDirt(obj, dist * k, "vehicle"); },
    combat(obj, amount) { api.addDirt(obj, amount ?? cfg.combat ?? 0.15, "combat"); },
    work(obj, amount) { api.addDirt(obj, amount ?? cfg.work ?? 0.05, "work"); },
    /** Saleté des rues/bâtiments selon le temps de jeu et le quartier (bas-fonds plus sales). */
    tick(dtHours, objects) {
      for (const o of objects) {
        const kind = (o.userData && o.userData.dirt) || "building";
        const rate = (cfg.time && cfg.time[kind]) ?? cfg.time.building ?? 0.01;
        let k = rate * dtHours;
        if (kind === "under" || (o.position && o.position.y < 2 && Math.abs((o.position.z || 0) - 250) < 20)) k *= (cfg.districts.under || 1.8);
        if (k) api.addDirt(o, k, "time");
      }
    },
    register(obj, id, v = 0) { const r = ensure(obj, id); r.v = v; apply(r); return r; },
    setAll(v) { rec.forEach((r) => { r.v = Math.max(0, Math.min(1, v)); apply(r); }); },
    serialize() { const o = {}; rec.forEach((r, k) => { o[k] = +r.v.toFixed(4); }); return o; },
    restore(data) { if (!data) return; Object.entries(data).forEach(([k, v]) => { if (!rec.has(k)) rec.set(k, { id: k, v: 0, level: -1, obj: null, kind: "prop" }); rec.get(k).v = v; apply(rec.get(k)); }); },
  };
  if (saved) api.restore(saved);
  return api;
}
