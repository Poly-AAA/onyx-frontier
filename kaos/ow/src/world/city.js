/** C2 : ville verticale PSX dans 1 morceau (data/city.json) — immeubles texturés (façades, corniches, toits, citernes),
 * rues en asphalte marqué + trottoirs, rue aérienne (niveau 2) et rampes, pont métallique, enseignes néon, lampadaires,
 * bancs, clôtures, fumée, chantier, parcelle de fleurs au vent. */
import { particles } from "../engine.js";
import { tex, worldUV } from "../psxtex.js";

export function createCity(eng, phys, data, rnd) {
  const { THREE, scene } = eng, C = data.city, M = eng.material;
  const grp = new THREE.Group(); scene.add(grp);
  const buildings = [], pickables = [], updaters = [];
  const [cx, cz] = C.center, half = (C.grid * C.block) / 2;
  const mats = {
    asphalt: M({ map: tex.asphalt() }), sidewalk: M({ map: tex.sidewalk() }), concrete: M({ map: tex.concrete() }),
    lane: M({ map: tex.lane(), alphaTest: 0.5, side: THREE.DoubleSide, unlit: true }),
    roof: M({ map: tex.roof() }), rust: M({ map: tex.rust() }), metal: M({ map: tex.metal() }), wood: M({ map: tex.wood() }),
    brick: M({ map: tex.brick() }), grass: M({ map: tex.grass() }), dark: M({ color: "#2a2830" }),
    fence: M({ map: tex.fence(), alphaTest: 0.5, side: THREE.DoubleSide }),
  };
  const facades = [0, 1, 2, 3, 4].map((v) => M({ map: tex.facade(v), emissiveMap: tex.facade(v, true), emissiveIntensity: 1.1 }));
  const cracked = M({ map: tex.facade(0), color: "#8a6a64" });
  /** Boîte texturée en UV monde, subdivisée (le warping affine reste lisible), posée au sol. */
  const box = (w, h, d, mat, x, y, z, tile = 8, segK = 1) => {
    const s = (v) => Math.max(1, Math.min(8, Math.round(v / (eng.subdiv || 12) * segK)));
    const g = new THREE.BoxGeometry(w, h, d, s(w), s(h), s(d)); g.translate(0, h / 2, 0); worldUV(g, tile);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); grp.add(m); return m;
  };
  // sol : asphalte uni (sans marquage) + trottoirs surélevés par îlot
  const S = C.grid * C.block + 60, sub = 24;
  const gg = new THREE.PlaneGeometry(S, S, sub, sub); gg.rotateX(-Math.PI / 2); gg.translate(cx, 0, cz); worldUV(gg, 8);
  const ground = new THREE.Mesh(gg, mats.asphalt); ground.position.y = 0.12; ground.userData.pick = "ground"; ground.userData.dirt = "street"; grp.add(ground); pickables.push(ground);
  const slot = (i, j) => [cx - half + C.block * (i + 0.5), cz - half + C.block * (j + 0.5)];
  const eq = (a, i, j) => a && a[0] === i && a[1] === j;
  const towers = {}, signWords = ["BAR", "HOTEL", "RAMEN", "KAOS", "TAXI", "CLUB", "NEO"];
  for (let j = 0; j < C.grid; j++) for (let i = 0; i < C.grid; i++) {
    const [x, z] = slot(i, j), avenue = Math.abs(z - C.aerialStreet.z) < C.block / 2;
    if (!avenue) { const sw = box(C.block - 12, 0.25, C.block - 12, mats.sidewalk, x, 0.1, z, 4); sw.userData.pick = "ground"; pickables.push(sw); }
    if (eq(C.chantierSlot, i, j)) { chantier(x, z); continue; }
    if (eq(C.parkSlot, i, j)) { flowers(x, z); continue; }
    if ((C.skipSlots || []).some((s) => eq(s, i, j)) || avenue) continue;
    const w = C.towerFoot[0] + rnd() * (C.towerFoot[1] - C.towerFoot[0]), d = C.towerFoot[0] + rnd() * (C.towerFoot[1] - C.towerFoot[0]);
    const h = Math.round((C.towerH[0] + Math.pow(rnd(), 1.6) * (C.towerH[1] - C.towerH[0])) / 4) * 4;
    towers[i + "_" + j] = tower(`t${i}_${j}`, x, z, w, h, d);
  }
  // rue aérienne (niveau 2) : tablier béton, piliers, garde-corps grillagés, rampes
  const A = C.aerialStreet, len = A.x[1] - A.x[0], ax = (A.x[0] + A.x[1]) / 2;
  const deck = box(len, 1, A.width, mats.concrete, ax, A.y - 1, A.z, 6);
  const top = new THREE.Mesh(worldUV(planeY(len, A.width - 1, 30, 2), 8), mats.asphalt); top.position.set(ax, A.y + 0.15, A.z); top.userData.dirt = "street"; grp.add(top);
  deck.userData.pick = "ground"; pickables.push(deck);
  phys.box([ax, A.y - 0.5, A.z], [len / 2, 0.5, A.width / 2]);
  for (let k = 0; k < 8; k++) [-1, 1].forEach((s) => box(1.4, A.y - 1, 1.4, mats.concrete, A.x[0] + 20 + k * (len - 40) / 7, 0, A.z + s * (A.width / 2 - 1.5), 4));
  [-1, 1].forEach((s) => { fence(A.x[0], A.z + s * A.width / 2, A.x[1], A.z + s * A.width / 2, A.y, 1.2); });
  [[A.x[0] - A.ramp / 2, 1], [A.x[1] + A.ramp / 2, -1]].forEach(([rx, dir]) => {
    const L = Math.hypot(A.ramp, A.y), ang = Math.atan2(A.y, A.ramp);
    const g = new THREE.BoxGeometry(L, 1, A.width, 6, 1, 2); worldUV(g, 6);
    const r = new THREE.Mesh(g, mats.concrete); r.position.set(rx, A.y / 2 - 0.5, A.z); r.rotation.z = ang * dir; r.userData.pick = "ground"; grp.add(r); pickables.push(r);
    const q = { x: 0, y: 0, z: Math.sin(ang * dir / 2), w: Math.cos(ang * dir / 2) };
    const b = phys.world.createRigidBody(phys.RAPIER.RigidBodyDesc.fixed().setTranslation(rx, A.y / 2 - 0.5, A.z)); b.setRotation(q, true);
    phys.world.createCollider(phys.RAPIER.ColliderDesc.cuboid(L / 2, 0.5, A.width / 2), b);
  });
  // pont métallique entre deux tours hautes : tablier rouillé, poutres treillis, rambardes
  const tall = Object.values(towers).filter((t) => t.h > C.bridge.y + 10).sort((a, b) => a.x - b.x);
  let bridge = null;
  for (let a = 0; a < tall.length && !bridge; a++) for (let b = a + 1; b < tall.length && !bridge; b++) if (Math.abs(tall[a].z - tall[b].z) < 2 && Math.abs(tall[a].x - tall[b].x) < C.block * 1.5) bridge = [tall[a], tall[b]];
  if (!bridge && tall.length >= 2) bridge = [tall[0], tall[1]];
  if (bridge) {
    const [t1, t2] = bridge, dx = t2.x - t1.x, dz = t2.z - t1.z, L = Math.hypot(dx, dz), W = C.bridge.width;
    const bg = new THREE.Group(); bg.position.set((t1.x + t2.x) / 2, C.bridge.y, (t1.z + t2.z) / 2); bg.rotation.y = -Math.atan2(dz, dx); grp.add(bg);
    const part = (w, h, d, mat, x, y, z, tile = 4) => { const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 6)), 1, 1); worldUV(g, tile); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); bg.add(m); return m; };
    part(L, 0.8, W, mats.rust, 0, 0, 0).userData.isBridge = true;
    [-1, 1].forEach((s) => { part(L, 0.3, 0.3, mats.rust, 0, 2.6, s * W / 2); part(L, 0.3, 0.3, mats.rust, 0, 0.6, s * W / 2); for (let k = 0; k <= Math.floor(L / 3); k++) { const p = part(0.2, 2.4, 0.2, mats.metal, -L / 2 + k * 3, 1.6, s * W / 2); p.rotation.z = k % 2 ? 0.6 : -0.6; } });
    bg.children[0].userData.isBridge = true; bg.userData.isBridge = true;
  }
  // fumée (bas-fonds)
  C.smokeVents.forEach(([x, z]) => { const p = particles(eng, { count: 40, color: "#b8b0c0", size: 5, opacity: 0.3, area: [6, 2, 6], rise: 2.2, drift: [0.6, 0.2], life: 9 }); p.position.set(x, 0, z); grp.add(p); updaters.push(p.userData.update); box(3, 1, 3, mats.metal, x, 0, z, 2); });
  // mobilier
  for (let k = 0; k < C.props.lamp; k++) lamp(A.x[0] + k * len / (C.props.lamp - 1), A.z + A.width / 2 + 5, C.neon[k % C.neon.length]);
  for (let k = 0; k < C.props.bench; k++) bench(cx - half + 20 + k * 28, A.z - A.width / 2 - 7);
  const neons = []; // pas de PointLight (PS1 : éclairage par sommet) ; les enseignes sont émissives
  // Pointillés jaunes : uniquement l'axe central de chaque rue (pas sur places, trottoirs, chantier).
  const x0 = cx - half, x1g = cx + half, z0 = cz - half, z1g = cz + half;
  function laneStripe(ax1, az1, ax2, az2, y) {
    const L = Math.hypot(ax2 - ax1, az2 - az1); if (L < 1) return;
    const g = new THREE.PlaneGeometry(L, 0.32, Math.max(1, Math.round(L / 8)), 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * (L / 2.4));
    const m = new THREE.Mesh(g, mats.lane);
    m.position.set((ax1 + ax2) / 2, y, (az1 + az2) / 2);
    m.rotation.y = -Math.atan2(az2 - az1, ax2 - ax1);
    m.renderOrder = 1; grp.add(m);
  }
  for (let i = 0; i <= C.grid; i++) {
    const x = x0 + C.block * i;
    laneStripe(x, z0, x, z1g, 0.15);
  }
  for (let j = 0; j <= C.grid; j++) {
    const z = z0 + C.block * j;
    laneStripe(x0, z, x1g, z, 0.15);
  }
  laneStripe(A.x[0], A.z, A.x[1], A.z, A.y + 0.17);

  function tower(id, x, z, w, h, d) {
    const v = Math.floor(rnd() * facades.length), base = 4;
    const m = box(w, h - base, d, facades[v], x, base, z, 8);
    const shop = box(w + 0.6, base, d + 0.6, mats.brick, x, 0, z, 4); // rez-de-chaussée en briques
    box(w + 1.6, 1, d + 1.6, mats.concrete, x, base - 0.5, z, 4); // auvent
    box(w + 1.4, 1.2, d + 1.4, mats.concrete, x, h - 0.2, z, 4); // corniche
    box(w - 0.6, 0.3, d - 0.6, mats.roof, x, h + 0.8, z, 8); // toit
    box(w + 1.4, 1, 0.4, mats.concrete, x, h + 1, z - d / 2 - 0.5, 4); box(w + 1.4, 1, 0.4, mats.concrete, x, h + 1, z + d / 2 + 0.5, 4); // acrotères
    // toit : citerne rouillée, climatiseurs, antenne
    const tank = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(2, 2, 3.5, 8, 1), 4), mats.rust); tank.position.set(x + w * 0.2, h + 3.6, z - d * 0.15); grp.add(tank);
    box(0.4, 1.8, 0.4, mats.metal, x + w * 0.2 - 1.2, h + 1, z - d * 0.15, 2); box(0.4, 1.8, 0.4, mats.metal, x + w * 0.2 + 1.2, h + 1, z - d * 0.15, 2);
    for (let k = 0; k < 2; k++) box(2.4, 1.4, 1.6, mats.metal, x - w * 0.25 + k * 3, h + 1, z + d * 0.2, 2);
    box(0.25, 8, 0.25, mats.metal, x - w * 0.3, h + 1, z - d * 0.3, 2);
    // enseigne néon verticale
    const word = signWords[Math.floor(rnd() * signWords.length)], c = C.neon[Math.floor(rnd() * C.neon.length)], st = tex.sign(word, c);
    const sg = new THREE.PlaneGeometry(10, 2.5); const s = new THREE.Mesh(sg, M({ map: st, emissiveMap: st, emissiveIntensity: 1.3, side: THREE.DoubleSide, unlit: true }));
    s.position.set(x + w / 2 + 1.2, 9 + rnd() * 10, z); s.rotation.set(0, Math.PI / 2, Math.PI / 2); grp.add(s);
    box(1.2, 0.2, 0.2, mats.metal, x + w / 2 + 0.6, s.position.y + 4, z, 2);
    m.userData = { id, hp: C.destruction.hp, kind: "building", pick: "building", dirt: "building" }; shop.userData = m.userData;
    pickables.push(m, shop);
    const col = phys.box([x, h / 2, z], [w / 2 + 0.3, h / 2, d / 2 + 0.3]);
    const t = { id, mesh: m, parts: [], col, x, z, w, h, d, v };
    const n0 = grp.children.length; // pour retirer tout l immeuble
    t.parts = grp.children.slice(grp.children.indexOf(m), n0);
    buildings.push(t); return t;
  }
  function chantier(x, z, w = 30) {
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, w * 0.3), M({ map: tex.chantier(), side: THREE.DoubleSide, unlit: true }));
    bb.position.set(x, 6 + w * 0.15, z); bb.userData.chantier = true; grp.add(bb);
    box(0.4, 6, 0.4, mats.metal, x - w * 0.25, 0, z, 2); box(0.4, 6, 0.4, mats.metal, x + w * 0.25, 0, z, 2);
    for (let k = 0; k < 6; k++) box(3, 1, 0.5, M({ map: tex.chantier() }), x - w / 2 + 3 + k * (w - 6) / 5, 0, z + w / 2 - 2, 3);
    const s = w / 2; fence(x - s, z - s, x + s, z - s, 0, 2.2); fence(x - s, z - s, x - s, z + s, 0, 2.2); fence(x + s, z - s, x + s, z + s, 0, 2.2);
    // gravats
    for (let k = 0; k < 8; k++) { const r = box(1 + rnd() * 3, 0.5 + rnd(), 1 + rnd() * 3, mats.concrete, x + (rnd() - 0.5) * w * 0.7, 0, z + (rnd() - 0.5) * w * 0.7, 2); r.rotation.y = rnd() * 3; }
    return bb;
  }
  function flowers(x, z, size = 34) {
    const geo = new THREE.PlaneGeometry(0.35, 0.9, 1, 3); geo.translate(0, 0.45, 0);
    const mat = M({ color: "#ffffff", wind: "up", side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, C.flowers), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), cols = ["#ff7ab8", "#ffd23a", "#c35bff", "#ffffff"];
    for (let i = 0; i < C.flowers; i++) { e.set(0, rnd() * Math.PI, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x + (rnd() - 0.5) * size, 0.3, z + (rnd() - 0.5) * size), q, new THREE.Vector3(1, 0.7 + rnd() * 0.8, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(cols[i % 4])); }
    grp.add(im);
    const lawn = new THREE.Mesh(worldUV(planeY(size + 4, size + 4, 8, 8), 6), mats.grass); lawn.position.set(x, 0.36, z); lawn.userData.pick = "ground"; grp.add(lawn); pickables.push(lawn);
    const s = size / 2 + 2; fence(x - s, z + s, x + s, z + s, 0.3, 1.2); fence(x - s, z - s, x - s, z + s, 0.3, 1.2);
  }
  /** Clôture grillagée (texture alpha) avec poteaux. */
  function fence(x1, z1, x2, z2, y, h) {
    const L = Math.hypot(x2 - x1, z2 - z1), g = new THREE.PlaneGeometry(L, h, Math.max(1, Math.round(L / 8)), 1);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 2, uv.getY(i) * h / 2);
    const m = new THREE.Mesh(g, mats.fence); m.position.set((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); grp.add(m);
    for (let k = 0; k <= Math.floor(L / 4); k++) { const t = Math.min(1, k * 4 / L); box(0.15, h, 0.15, mats.metal, x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t, 2); }
  }
  function lamp(x, z, c) {
    box(0.3, 6, 0.3, mats.metal, x, 0, z, 2); box(0.6, 0.4, 0.6, mats.dark, x, 0, z, 2);
    box(0.2, 0.2, 1.6, mats.metal, x, 5.9, z - 0.7, 2);
    box(0.7, 0.3, 0.9, M({ emissive: c, emissiveIntensity: 1.2, color: "#202020" }), x, 5.6, z - 1.4, 2);
  }
  function bench(x, z) {
    box(2.2, 0.12, 0.6, mats.wood, x, 0.5, z, 2); box(2.2, 0.5, 0.1, mats.wood, x, 0.62, z - 0.3, 2);
    [-0.95, 0.95].forEach((o) => box(0.1, 0.5, 0.6, mats.metal, x + o, 0, z, 2));
  }
  /** Destruction : 1er coup = façade fissurée, dernier = immeuble retiré + chantier. */
  function damage(mesh) {
    const t = buildings.find((b) => b.mesh === mesh || mesh.userData === b.mesh.userData); if (!t) return null;
    t.mesh.userData.hp -= 1;
    if (t.mesh.userData.hp > 0) { t.mesh.material = cracked; return "fissure"; }
    destroy(t.id); return "detruit";
  }
  function destroy(id) {
    const t = buildings.find((b) => b.id === id); if (!t || t.dead) return;
    t.dead = true; t.parts.forEach((o) => grp.remove(o)); phys.remove(t.col);
    for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData === t.mesh.userData) pickables.splice(i, 1);
    chantier(t.x, t.z, Math.max(t.w, 20));
  }
  return { grp, buildings, pickables, neons, damage, destroy, update: (dt) => updaters.forEach((u) => u(dt)) };

  function planeY(w, d, sx, sz) { const g = new THREE.PlaneGeometry(w, d, sx, sz); g.rotateX(-Math.PI / 2); return g; }
}
