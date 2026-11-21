/** Décors statiques (props + véhicules) chargés depuis data/props.json, shader PSX via psxify. */
export function placeProps(eng, list) {
  const objects = [];
  const ready = Promise.all((list || []).map(async (it) => {
    try {
      const g = await eng.loadGLB(it.url);
      const o = eng.psxify(g.scene.clone());
      if (it.height) eng.normalize(o, it.height);
      if (it.scale && it.scale !== 1) o.scale.multiplyScalar(it.scale);
      o.position.set(...it.pos);
      if (it.rot) o.rotation.y = it.rot;
      o.userData.dirt = it.dirt || (it.kind === "vehicle" ? "vehicle" : "prop");
      o.userData.dirtId = it.id;
      o.userData.kind = it.kind || "prop";
      eng.scene.add(o);
      objects.push(o);
      return o;
    } catch (e) { console.warn("prop", it.id, e); return null; }
  }));
  return { objects, ready };
}
