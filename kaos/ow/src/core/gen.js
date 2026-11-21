/** Génération déterministe pure (sans three) : bruit, hauteur, biome, morceaux 500 m sur ~870 km². */
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Bruit de Perlin 2D (gradients) + fBm, graine -> permutation. Valeurs ~[0,1]. */
export function makeNoise(seed) {
  const r = mulberry32(seed >>> 0), p = new Uint16Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => { const g = G[h & 7]; return g[0] * x + g[1] * y; };
  const perlin = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const u = fade(xf), v = fade(yf);
    const n00 = grad(p[p[X] + Y], xf, yf), n10 = grad(p[p[X + 1] + Y], xf - 1, yf), n01 = grad(p[p[X] + Y + 1], xf, yf - 1), n11 = grad(p[p[X + 1] + Y + 1], xf - 1, yf - 1);
    const a = n00 + u * (n10 - n00), b = n01 + u * (n11 - n01);
    return a + v * (b - a); // ~[-1,1]
  };
  return (x, y, oct = 1) => { let f = 1, amp = 1, sum = 0, norm = 0; for (let o = 0; o < oct; o++) { sum += perlin(x * f, y * f) * amp; norm += amp; f *= 2; amp *= 0.5; } return Math.min(1, Math.max(0, 0.5 + 0.75 * sum / norm)); };
}

export const CHUNK = 500;
export const MAP_KM2 = 870;
export const MAP_CHUNKS = Math.round(Math.sqrt(MAP_KM2 * 1e6) / CHUNK); // ≈ 59
export const CITY_CHUNK = [Math.floor(MAP_CHUNKS / 2), Math.floor(MAP_CHUNKS / 2)]; // morceau de la ville (29,29)

/** Monde local : le morceau ville a son coin à (0,0). */
export function chunkOrigin(cx, cz) { return [(cx - CITY_CHUNK[0]) * CHUNK, (cz - CITY_CHUNK[1]) * CHUNK]; }
export function chunkOf(x, z) { return [Math.floor(x / CHUNK) + CITY_CHUNK[0], Math.floor(z / CHUNK) + CITY_CHUNK[1]]; }
export function inMap(cx, cz) { return cx >= 0 && cz >= 0 && cx < MAP_CHUNKS && cz < MAP_CHUNKS; }
/** Morceaux à charger autour d'une position : (2r+1)², r = 1 -> 3×3. */
export function chunksAround(x, z, r = 1) {
  const [cx, cz] = chunkOf(x, z), out = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inMap(cx + dx, cz + dz)) out.push([cx + dx, cz + dz]);
  return out;
}

export function createWorldGen(seed, biomesCfg) {
  const hN = makeNoise(seed), bN = makeNoise(seed ^ 0x9e37), { noise, biomes, cityFlatten } = biomesCfg;
  const cityCx = CHUNK / 2, cityCz = CHUNK / 2;
  const biomeAt = (x, z) => {
    const t = bN(x * noise.biomeScale + 100, z * noise.biomeScale + 100, 3);
    const k = Math.min(0.999, Math.max(0, (t - 0.25) * 2));
    return biomes.find((b) => k >= b.range[0] && k < b.range[1]) || biomes[0];
  };
  const raw = (x, z) => {
    const b = biomeAt(x, z);
    let h = hN(x * noise.scale, z * noise.scale, noise.octaves);
    if (b.ridged) h = 1 - Math.abs(h * 2 - 1);
    return h * b.height;
  };
  const height = (x, z) => {
    const d = Math.hypot(x - cityCx, z - cityCz);
    const h = raw(x, z);
    if (d < cityFlatten.radius) return 0;
    const t = Math.min(1, (d - cityFlatten.radius) / cityFlatten.blend);
    return h * t * t;
  };
  return { height, biomeAt, isCity: (cx, cz) => cx === CITY_CHUNK[0] && cz === CITY_CHUNK[1] };
}

/** Grille de hauteurs d'un morceau ((seg+1)² valeurs). */
export function chunkHeights(gen, cx, cz, seg) {
  const [ox, oz] = chunkOrigin(cx, cz), out = new Float32Array((seg + 1) * (seg + 1)), st = CHUNK / seg;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) out[j * (seg + 1) + i] = gen.height(ox + i * st, oz + j * st);
  return out;
}

/** Vitesse de marche selon les PM (spec V1). */
export function walkSpeed(base, pm) { return base * (1 + 0.05 * (pm - 4)); }
