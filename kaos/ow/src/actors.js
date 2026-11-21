/** Joueur et PNJ : modèles GLB PSX (manifeste), AnimationMixer, routines inertes/scriptées. */
import { walkSpeed } from "./core/gen.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

const cache = new Map();
export function loadCached(eng, url) {
  if (!cache.has(url)) cache.set(url, eng.loadGLB(url));
  return cache.get(url);
}

const CLIP = {
  walk: ["Walk_Loop", "Walk", "walk"],
  idle: ["Idle_Loop", "Idle", "A_TPose"],
  sit: ["Sitting_Idle_Loop", "Sit", "Sitting_Idle", "SitDown"],
  interact: ["Interact", "Talk", "Idle_Talking_Loop", "Wave"],
  pickup: ["PickUp_Table", "PickUp"],
  punch: ["Punch_Jab", "Punch_Cross", "Punch", "Sword_Attack"],
};

function clipOf(anims, names) {
  for (const n of names) {
    const hit = anims.find((a) => a.name === n) || anims.find((a) => a.name.toLowerCase() === n.toLowerCase());
    if (hit) return hit;
  }
  for (const n of names) {
    const hit = anims.find((a) => a.name.toLowerCase().includes(n.toLowerCase()));
    if (hit) return hit;
  }
  return null;
}

/** Monte un GLB (cloné, PSX, 1,80 m) sur root et renvoie play/animate via AnimationMixer. */
export function attachModel(eng, root, gltf, height = 1.8) {
  root.clear();
  const model = SkeletonUtils.clone(gltf.scene);
  eng.psxify(model);
  const { THREE } = eng;
  model.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity, bones = 0;
  model.traverse((o) => { if (o.isBone) { o.getWorldPosition(v); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); bones++; } });
  let h, minBase;
  if (bones > 2 && maxY - minY > 0.01) { h = maxY - minY; minBase = minY; }
  else { const box = new THREE.Box3().setFromObject(model); h = box.max.y - box.min.y || 1; minBase = box.min.y; }
  model.scale.multiplyScalar(height / h);
  model.position.y -= minBase * height / h;
  root.add(model);
  const mixer = new eng.THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, names] of Object.entries(CLIP)) {
    const c = clipOf(gltf.animations || [], names);
    if (c) actions[k] = mixer.clipAction(c);
  }
  let current = null;
  const play = (name, fade = 0.18) => {
    const next = actions[name]; if (!next) return false;
    if (next === current) { next.paused = false; return true; }
    if (current) current.fadeOut(fade);
    next.reset().fadeIn(fade).play(); current = next; return true;
  };
  if (!play("idle")) play(Object.keys(actions)[0]);
  return {
    model, mixer, actions, play,
    animate(dt, speed, want) {
      if (want) play(want);
      else if (speed > 0.25) play("walk");
      else play("idle");
      mixer.update(dt);
    },
  };
}

/** Capsule de secours si un modèle manque. */
export function buildBody(eng, colors = {}, scale = [1, 1, 1]) {
  const { THREE } = eng, root = new THREE.Group();
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 3, 8), eng.material({ color: colors.torso || "#9a9aa0" }));
  capsule.position.y = 0.9; root.add(capsule);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 8), eng.material({ color: "#000000", transparent: true, opacity: 0.45, unlit: true }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; root.add(blob);
  root.scale.set(...scale);
  return { root, animate(dt, speed) { capsule.position.y = 0.9 + (speed > 0.05 ? Math.abs(Math.sin(Date.now() / 200)) * 0.05 : 0); } };
}

function assetOf(manifest, id) {
  return (manifest.assets || []).find((a) => a.id === id && a.status === "present");
}

export function createPlayer(eng, phys, cfg, data, save, opt = {}) {
  const P = data.player, man = data["assets.manifest"];
  const body = buildBody(eng, opt.colors || { torso: "#b0aca4" });
  body.root.userData.dirt = "character"; body.root.userData.dirtId = opt.dirtId || "player";
  eng.scene.add(body.root);
  const spawn = opt.spawn || (save && save.player) || cfg.player.spawn;
  const ch = phys.character(spawn, 0.35, 0.55);
  const st = { pm: (save && save.pm) ?? P.stats.pm, target: null, key: null, vy: 0, speed: 0, body, ch, def: P, rig: null };
  const aid = opt.asset || P.asset || "csaf_patrol";
  const a = assetOf(man, aid);
  st.ready = a
    ? loadCached(eng, a.url).then((g) => { st.rig = attachModel(eng, body.root, g, 1.8); body.animate = (dt, sp, w) => st.rig.animate(dt, sp, w); })
    : Promise.resolve();
  st.update = (dt) => {
    const t = ch.body.translation();
    let dx = 0, dz = 0;
    if (st.key && (st.key.x || st.key.z)) { st.target = null; const d = Math.hypot(st.key.x, st.key.z); dx = st.key.x / d; dz = st.key.z / d; }
    else if (st.target) { dx = st.target.x - t.x; dz = st.target.z - t.z; const d = Math.hypot(dx, dz); if (d < 0.3) { st.target = null; dx = dz = 0; } else { dx /= d; dz /= d; } }
    const v = walkSpeed(cfg.player.walk, st.pm);
    st.vy = ch.ctl.computedGrounded() ? -0.5 : st.vy + cfg.player.gravity * dt;
    ch.ctl.computeColliderMovement(ch.col, { x: dx * v * dt, y: st.vy * dt, z: dz * v * dt });
    const mv = ch.ctl.computedMovement();
    ch.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    st.speed = Math.hypot(mv.x, mv.z) / Math.max(dt, 1e-4);
    if (st.target && st.speed < 0.05 && Math.hypot(dx, dz) > 0) st.stuck = (st.stuck || 0) + dt; else st.stuck = 0;
    if (st.stuck > 1) st.target = null;
    if (dx || dz) body.root.rotation.y = Math.atan2(dx, dz);
    body.root.position.set(t.x, t.y - 0.9, t.z);
    body.animate(dt, st.speed);
  };
  st.pos = () => ch.body.translation();
  return st;
}

/** PNJ classe « inert » (figurant) ou « scripted » (trajet, pause, interaction, jour/nuit). */
export function createNpc(eng, def, manifest) {
  const body = buildBody(eng, def.colors || {});
  body.root.userData.dirt = "character"; body.root.userData.dirtId = "npc:" + def.id;
  eng.scene.add(body.root);
  const p = body.root.position;
  const start = def.spawn || (def.waypoints && def.waypoints[0]) || [0, 0, 0];
  p.set(...start);
  if (def.yaw) body.root.rotation.y = def.yaw;
  const st = { def, body, class: def.class || "scripted", rig: null, wait: 0, mode: "idle", k: 0 };
  const a = assetOf(manifest, def.asset);
  st.ready = a
    ? loadCached(eng, a.url).then((g) => { st.rig = attachModel(eng, body.root, g, 1.8); body.animate = (dt, sp, w) => st.rig.animate(dt, sp, w); if (st.class === "inert") body.animate(0, 0, def.pose || "idle"); })
    : Promise.resolve();

  const goToward = (dt, target, speed) => {
    const dx = target[0] - p.x, dy = (target[1] || 0) - p.y, dz = target[2] - p.z;
    const d = Math.hypot(dx, dy, dz), s = speed * dt;
    if (d <= s) { p.set(target[0], target[1] || 0, target[2]); return true; }
    p.x += dx / d * s; p.y += dy / d * s; p.z += dz / d * s;
    body.root.rotation.y = Math.atan2(dx, dz);
    return false;
  };

  st.update = (dt, hour = 12) => {
    if (st.class === "inert") { body.animate(dt, 0, def.pose || "idle"); return; }
    const hours = def.workHours || [7, 20];
    const night = hour < hours[0] || hour >= hours[1];
    if (st.wait > 0) {
      st.wait -= dt;
      body.animate(dt, 0, st.mode);
      if (st.wait <= 0) { st.k = (st.k + 1) % Math.max(1, (def.waypoints || []).length); st.mode = "walk"; }
      return;
    }
    if (night && def.home) {
      if (goToward(dt, def.home, def.speed || 1.2)) { st.mode = def.night || "sit"; st.wait = 4; body.animate(dt, 0, st.mode); }
      else body.animate(dt, def.speed || 1.2);
      return;
    }
    const wps = def.waypoints || [start];
    const w = wps[(st.k + 1) % wps.length];
    if (goToward(dt, w, def.speed || 1.2)) {
      st.mode = def.interact || "idle";
      st.wait = def.pause ?? 2.5;
      body.animate(dt, 0, st.mode);
    } else body.animate(dt, def.speed || 1.2);
  };
  return st;
}

/** Alias pour l'ancien nom. */
export const createWalker = createNpc;

export function createCamera(eng, cfg) {
  const C = cfg.camera, cam = eng.camera;
  cam.fov = C.fov; cam.updateProjectionMatrix();
  const st = { dist: C.distance, yaw: C.isoYaw * Math.PI / 180 };
  st.zoom = (k) => { st.dist = Math.min(C.max, Math.max(C.min, st.dist * k)); };
  st.rotate = (a) => { st.yaw += a; };
  st.toWorld = (fwd, right) => { const y = st.yaw; return { x: -Math.sin(y) * fwd + Math.cos(y) * right, z: -Math.cos(y) * fwd - Math.sin(y) * right }; };
  st.update = (target) => {
    const yaw = st.yaw, pitch = C.isoPitch * Math.PI / 180;
    cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * st.dist, target.y + Math.sin(pitch) * st.dist, target.z + Math.cos(yaw) * Math.cos(pitch) * st.dist);
    cam.lookAt(target.x, target.y + 1, target.z);
  };
  return st;
}
