/** Rapier (wasm local, aucune requête externe) : sol, bâtiments, contrôleur de personnage. */
import RAPIER from "@dimforge/rapier3d-compat";

export async function createPhysics(gravity) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
  const fixed = (desc, pos, rot) => { const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...pos)); if (rot) b.setRotation(rot, true); return world.createCollider(desc, b); };
  return {
    RAPIER, world,
    trimesh(geo, offset, matrix) {
      const p = geo.attributes.position, v = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (matrix) { const e = matrix.elements, X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; x = X; y = Y; z = Z; }
        v[i * 3] = x; v[i * 3 + 1] = y; v[i * 3 + 2] = z;
      }
      const idx = geo.index ? new Uint32Array(geo.index.array) : Uint32Array.from({ length: p.count }, (_, i) => i);
      return fixed(RAPIER.ColliderDesc.trimesh(v, idx), offset || [0, 0, 0]);
    },
    /** Boîte fixe ; rotX en radians (rampes). */
    box(center, half, rotX = 0) {
      const q = rotX ? { x: Math.sin(rotX / 2), y: 0, z: 0, w: Math.cos(rotX / 2) } : null;
      return fixed(RAPIER.ColliderDesc.cuboid(...half), center, q);
    },
    remove(c) { world.removeCollider(c, true); },
    character(pos, radius, half) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...pos));
      const col = world.createCollider(RAPIER.ColliderDesc.capsule(half, radius), body);
      const ctl = world.createCharacterController(0.05);
      ctl.enableAutostep(0.6, 0.3, true); ctl.enableSnapToGround(0.6); ctl.setMaxSlopeClimbAngle(50 * Math.PI / 180); ctl.setApplyImpulsesToDynamicBodies(true);
      return { body, col, ctl };
    },
    step(dt) { world.timestep = Math.min(dt, 1 / 30); world.step(); },
  };
}
