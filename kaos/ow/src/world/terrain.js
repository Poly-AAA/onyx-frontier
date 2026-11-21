/** C0 : morceaux de 500 m streamés en 3×3 autour du joueur. Pré-généré (glTF) prioritaire sur la graine.
 * Rendu PSX : textures sable/herbe/roche 64 px mélangées par sommet, teinte de biome par sommet, sapins en croix texturés. */
import { CHUNK, chunkOrigin, chunksAround, chunkHeights } from "../core/gen.js";
import { tex } from "../psxtex.js";

export function createTerrain(eng, phys, gen, cfg, data) {
  const { THREE, scene } = eng, seg = cfg.world.chunkSegments, TILE = 8;
  const live = new Map(), queue = [];
  const mat = eng.material({ blend: [tex.sand(), tex.grass(), tex.rock()], vertexColors: true });
  const cityMat = eng.material({ map: tex.asphalt(false), vertexColors: true });
  // sapin PS1 : 2 plans croisés texturés (alpha) + tronc
  const treeGeo = treeGeometry(THREE), treeMat = eng.material({ map: treeTex(THREE), alphaTest: 0.5, side: THREE.DoubleSide });
  const pre = (data.terrain && data.terrain.pregenerated) || {};
  const W = { desert: [1, 0, 0], forest: [0, 1, 0], montagne: [0, 0.12, 0.88] };
  const tint = new THREE.Color();

  function build(cx, cz) {
    const key = cx + "_" + cz, [ox, oz] = chunkOrigin(cx, cz);
    if (pre[key]) return loadPre(key, ox, oz);
    const h = chunkHeights(gen, cx, cz, seg), city = gen.isCity(cx, cz);
    const geo = new THREE.PlaneGeometry(CHUNK, CHUNK, seg, seg); geo.rotateX(-Math.PI / 2); geo.translate(CHUNK / 2, 0, CHUNK / 2);
    const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3), bw = new Float32Array(n * 3), uv = geo.attributes.uv;
    const C = data.city, cs = C && (C.grid * C.block) / 2 + 40;
    for (let i = 0; i < n; i++) {
      // sous la ville, le terrain passe sous le sol des rues (pas de z-fighting avec l'asphalte)
      if (city && cs && Math.abs(ox + p.getX(i) - C.center[0]) < cs && Math.abs(oz + p.getZ(i) - C.center[1]) < cs) h[i] = Math.min(h[i], -0.3);
      p.setY(i, h[i]);
      uv.setXY(i, (ox + p.getX(i)) / TILE, (oz + p.getZ(i)) / TILE);
    }
    geo.computeVertexNormals();
    const nr = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      const b = gen.biomeAt(ox + p.getX(i), oz + p.getZ(i)), w = (W[b.id] || [0, 1, 0]).slice();
      const steep = 1 - nr.getY(i); // pentes raides = roche
      if (steep > 0.18) { const k = Math.min(1, (steep - 0.18) * 4); w[0] *= 1 - k; w[1] *= 1 - k; w[2] = w[2] * (1 - k) + k; }
      const hk = Math.min(1, h[i] / (b.height || 1));
      tint.set(b.tint || "#ffffff").multiplyScalar(0.85 + hk * 0.25); // pas de blanc délavé en altitude
      if (city) tint.set("#9a96a0");
      col.set([tint.r, tint.g, tint.b], i * 3); bw.set(w, i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("bw", new THREE.BufferAttribute(bw, 3));
    const mesh = new THREE.Mesh(geo, city ? cityMat : mat); mesh.position.set(ox, 0, oz); mesh.userData.pick = "ground";
    const grp = new THREE.Group(); grp.add(mesh);
    const rnd = mulberry(cx * 73856093 ^ cz * 19349663), trees = [];
    for (let i = 0; i < 260; i++) { const x = rnd() * CHUNK, z = rnd() * CHUNK, b = gen.biomeAt(ox + x, oz + z); if (b.trees && rnd() < b.trees / 60) trees.push([x, gen.height(ox + x, oz + z), z, 0.7 + rnd() * 0.7, rnd() * 3]); }
    if (trees.length && !city) {
      const im = new THREE.InstancedMesh(treeGeo, treeMat, trees.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      trees.forEach((t, i) => { q.setFromEuler(e.set(0, t[4], 0)); im.setMatrixAt(i, m4.compose(new THREE.Vector3(t[0], t[1] - 0.3, t[2]), q, new THREE.Vector3(t[3], t[3], t[3]))); });
      im.position.set(ox, 0, oz); grp.add(im);
    }
    scene.add(grp);
    return { grp, colliders: [phys.trimesh(geo, [ox, 0, oz])], mesh };
  }
  function loadPre(key, ox, oz) {
    const grp = new THREE.Group(); scene.add(grp);
    const rec = { grp, colliders: [], mesh: null };
    eng.loadModel(pre[key]).then((g) => {
      eng.psxify(g.scene);
      const box = new THREE.Box3().setFromObject(g.scene), s = CHUNK / Math.max(1e-3, box.max.x - box.min.x);
      g.scene.scale.setScalar(s); g.scene.position.set(ox - box.min.x * s, -box.min.y * s, oz - box.min.z * s); grp.add(g.scene);
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => { if (o.isMesh) { o.userData.pick = "ground"; rec.colliders.push(phys.trimesh(o.geometry, null, o.matrixWorld)); rec.mesh = o; } });
    });
    return rec;
  }
  function update(x, z) {
    const need = chunksAround(x, z, cfg.world.streamRadius), keys = new Set(need.map((c) => c[0] + "_" + c[1]));
    for (const [k, r] of live) if (!keys.has(k)) { scene.remove(r.grp); r.grp.traverse((o) => o.geometry && o.geometry !== treeGeo && o.geometry.dispose()); r.colliders.forEach((c) => phys.remove(c)); live.delete(k); }
    need.forEach((c) => { const k = c[0] + "_" + c[1]; if (!live.has(k) && !queue.includes(k)) queue.push(k); });
    if (queue.length) { const k = queue.shift(); if (keys.has(k) && !live.has(k)) { const [cx, cz] = k.split("_").map(Number); live.set(k, build(cx, cz)); } }
  }
  return { update, live, pickables: () => [...live.values()].map((r) => r.mesh).filter(Boolean), pending: () => queue.length };
}

/** Sapin : 2 plans en croix (12 m) — technique d'arbre classique des jeux PS1. */
function treeGeometry(THREE) {
  const a = new THREE.PlaneGeometry(7, 12); a.translate(0, 6, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const g = new THREE.BufferGeometry(), pos = [], nor = [], uvs = [], idx = [];
  [a, b].forEach((s) => { const o = pos.length / 3; pos.push(...s.attributes.position.array); nor.push(...s.attributes.normal.array); uvs.push(...s.attributes.uv.array); idx.push(...[...s.index.array].map((i) => i + o)); });
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
  return g;
}
function treeTex(THREE) {
  const w = 32, h = 64, cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"), img = g.createImageData(w, h), r = mulberry(77);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = y / h, half = t < 0.85 ? (0.08 + t * 0.48) * w * (0.85 + 0.15 * (((y >> 3) % 2))) : 0, dx = Math.abs(x - w / 2 + 0.5);
    let c = null;
    if (dx < half) { const k = r() * 30 - 15 + (dx > half - 2 ? -20 : 0); c = [34 + k, 78 + k, 44 + k]; }
    else if (t >= 0.85 && dx < 2.5) c = [80, 54, 34];
    img.data.set(c ? [...c, 255] : [0, 0, 0, 0], (y * w + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = true; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
