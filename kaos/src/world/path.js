/** A* 8 directions sur la grille de la ville (pas de coupe de coin). Pur. */
export function findPath(city, sx, sy, tx, ty, maxNodes = 4000) {
  sx = Math.round(sx); sy = Math.round(sy); tx = Math.round(tx); ty = Math.round(ty);
  if (!city.walkable(tx, ty)) {
    const alt = nearestWalkable(city, tx, ty);
    if (!alt) return null;
    tx = alt.x; ty = alt.y;
  }
  if (sx === tx && sy === ty) return [];
  const W = city.W;
  const key = (x, y) => y * W + x;
  const open = [{ x: sx, y: sy, g: 0, f: 0 }];
  const came = new Map();
  const gs = new Map([[key(sx, sy), 0]]);
  const closed = new Set();
  const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === tx && cur.y === ty) {
      const out = [];
      let k = ck;
      while (k !== key(sx, sy)) { out.push({ x: k % W, y: Math.floor(k / W) }); k = came.get(k); }
      return out.reverse();
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!city.walkable(nx, ny)) continue;
      if (dx && dy && (!city.walkable(cur.x + dx, cur.y) || !city.walkable(cur.x, cur.y + dy))) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const g = cur.g + (dx && dy ? 1.41 : 1);
      if (g < (gs.get(nk) ?? Infinity)) {
        gs.set(nk, g); came.set(nk, ck);
        open.push({ x: nx, y: ny, g, f: g + h(nx, ny) });
      }
    }
  }
  return null;
}

export function nearestWalkable(city, x, y, r = 4) {
  for (let d = 1; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    if (city.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return null;
}
