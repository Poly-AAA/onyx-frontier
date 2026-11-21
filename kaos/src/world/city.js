/**
 * Ville open world isométrique (pure, sans DOM). Grille de tuiles générée par graine.
 * Tuiles : GRASS, ROAD, WALK (trottoir), BUILD (bloquant), PLAZA, PARK, WATER (bloquant).
 */
import { mulberry32 } from "../core/spell-lab.js";

export const T = { GRASS: 0, ROAD: 1, WALK: 2, BUILD: 3, PLAZA: 4, PARK: 5, WATER: 6 };
export const BLOCK = 9; // pas des rues : 2 de route + 1 trottoir de chaque côté + 5 d'îlot

/** Points d'intérêt : un îlot chacun (bx, by en coordonnées d'îlot). */
export const POI_DEFS = [
  { id: "clinique", name: "Clinique Néon", kind: "soin", bx: 1, by: 1, color: "#e8eef2", roof: "#d34b5a", h: 3 },
  { id: "bar", name: "Bar La Faille", kind: "nourriture", bx: 2, by: 1, color: "#6b3f6e", roof: "#f2a541", h: 2 },
  { id: "marche", name: "Marché couvert", kind: "nourriture", bx: 1, by: 2, color: "#c98b3a", roof: "#8a4b2a", h: 1 },
  { id: "garage", name: "Garage de Rico", kind: "travail", bx: 3, by: 2, color: "#5a636e", roof: "#2fae8e", h: 2 },
  { id: "commissariat", name: "Commissariat", kind: "travail", bx: 3, by: 1, color: "#2f4a7a", roof: "#c9d3e6", h: 3 },
  { id: "place", name: "Place de la Faille", kind: "social", bx: 2, by: 2, plaza: true },
  { id: "parc", name: "Parc des Cendres", kind: "social", bx: 2, by: 3, park: true },
  { id: "hlm_n", name: "Tours Nord", kind: "maison", bx: 1, by: 3, color: "#8c7b6b", roof: "#4d4038", h: 5 },
  { id: "hlm_s", name: "Tours Sud", kind: "maison", bx: 3, by: 3, color: "#7b8c86", roof: "#38504d", h: 5 },
  { id: "entrepot", name: "Entrepôt abandonné", kind: "danger", bx: 0, by: 3, color: "#4a4440", roof: "#2a2624", h: 2 },
];

export function createCity(seed = 435235616, blocks = 4) {
  const W = blocks * BLOCK + 2;
  const H = W;
  const rng = mulberry32(seed >>> 0);
  const tiles = new Uint8Array(W * H);
  const height = new Uint8Array(W * H); // hauteur de bâtiment (étages)
  const color = new Array(W * H).fill(null);
  const owner = new Array(W * H).fill(null); // id POI propriétaire de la tuile
  const idx = (x, y) => y * W + x;
  const isRoadLine = (v) => v % BLOCK === 0 || v % BLOCK === 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let t = T.GRASS;
      if (isRoadLine(x) || isRoadLine(y)) t = T.ROAD;
      else if (x % BLOCK === 2 || x % BLOCK === BLOCK - 1 || y % BLOCK === 2 || y % BLOCK === BLOCK - 1) t = T.WALK;
      tiles[idx(x, y)] = t;
    }
  }
  // canal au bord ouest (décor, bloquant) avec deux ponts
  for (let y = 0; y < H; y++) {
    if (!isRoadLine(y)) { tiles[idx(0, y)] = T.WATER; }
  }
  const pois = [];
  const decor = []; // mobilier urbain cyberpunk : lampadaires néon, cerisiers, bancs, clôtures, distributeurs, holo
  const nb = Math.floor((W - 2) / BLOCK);
  for (let by = 0; by < nb; by++) {
    for (let bx = 0; bx < nb; bx++) {
      const x0 = bx * BLOCK + 3, y0 = by * BLOCK + 3; // intérieur 5x5
      const def = POI_DEFS.find((p) => p.bx === bx && p.by === by);
      if (def && (def.plaza || def.park)) {
        for (let y = y0 - 1; y < y0 + 6; y++) for (let x = x0 - 1; x < x0 + 6; x++) {
          if (tiles[idx(x, y)] !== T.ROAD) { tiles[idx(x, y)] = def.plaza ? T.PLAZA : T.PARK; owner[idx(x, y)] = def.id; }
        }
        if (def.park) { // parc : cerisiers (réels + holo), bancs, clôture néon sur le pourtour
          [[x0, y0], [x0 + 4, y0 + 1], [x0 + 1, y0 + 4], [x0 + 4, y0 + 4], [x0 + 2, y0]].forEach(([x, y], i) => {
            tiles[idx(x, y)] = T.BUILD; height[idx(x, y)] = 0;
            decor.push({ kind: i % 2 ? "sakura_holo" : "sakura", x, y });
          });
          decor.push({ kind: "bench", x: x0 + 2, y: y0 + 2, rot: 0 }, { kind: "bench", x: x0 + 1, y: y0 + 2, rot: 0 }, { kind: "bench", x: x0 + 3, y: y0 + 4, rot: 1 });
          for (let k = x0 - 1; k <= x0 + 5; k++) { if (k !== x0 + 2) { decor.push({ kind: "fence", x: k, y: y0 - 1, side: "n" }); decor.push({ kind: "fence", x: k, y: y0 + 5, side: "s" }); } }
        }
        if (def.plaza) {
          decor.push({ kind: "holo", x: x0 + 2, y: y0 + 2 });
          [[x0, y0], [x0 + 4, y0], [x0, y0 + 4], [x0 + 4, y0 + 4]].forEach(([x, y]) => decor.push({ kind: "sakura_holo", x, y, small: true }));
          decor.push({ kind: "bench", x: x0 + 1, y: y0 + 3, rot: 0 }, { kind: "bench", x: x0 + 3, y: y0 + 1, rot: 1 }, { kind: "vending", x: x0 + 4, y: y0 + 2 });
        }
        pois.push({ ...def, x0, y0, door: { x: x0 + 2, y: y0 + 2 }, area: { x0: x0 - 1, y0: y0 - 1, x1: x0 + 5, y1: y0 + 5 } });
        continue;
      }
      const c = def || { color: pick(rng, ["#7a6a5a", "#5e6b73", "#806060", "#6a7a5e", "#757070"]), roof: pick(rng, ["#3a3330", "#2d3a40", "#4a3030"]), h: 1 + Math.floor(rng() * 4) };
      for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) {
        tiles[idx(x, y)] = T.BUILD; height[idx(x, y)] = c.h; color[idx(x, y)] = { wall: c.color, roof: c.roof };
        if (def) owner[idx(x, y)] = def.id;
      }
      if (def) {
        // porte au sud de l'îlot : la tuile de trottoir devant l'entrée
        const door = { x: x0 + 2, y: y0 + 5 };
        pois.push({ ...def, x0, y0, door, area: { x0: door.x - 1, y0: door.y, x1: door.x + 1, y1: door.y } });
      }
    }
  }
  // lampadaires néon aux coins de trottoir + cerisiers d'alignement le long des trottoirs
  for (let by = 0; by < nb; by++) for (let bx = 0; bx < nb; bx++) {
    const a = bx * BLOCK + 2, b = by * BLOCK + 2, e = a + BLOCK - 3, f = b + BLOCK - 3;
    [[a, b], [e, b], [a, f], [e, f]].forEach(([x, y], i) => decor.push({ kind: "lamp", x, y, hue: ["#ff3fa4", "#ffb000", "#ff5a3c", "#c86bff"][(i + bx + by) % 4] }));
    const owner0 = POI_DEFS.find((p) => p.bx === bx && p.by === by);
    if (!owner0 || !(owner0.plaza || owner0.park)) {
      if (rng() < 0.7) decor.push({ kind: "sakura", x: a, y: b + 3, small: true });
      if (rng() < 0.5) decor.push({ kind: "sakura_holo", x: a + 4, y: b, small: true });
      if (rng() < 0.4) decor.push({ kind: "bench", x: a + 2, y: f, rot: 0 });
    }
  }
  return {
    W, H, tiles, decor, height, color, owner, pois, seed,
    idx,
    get(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? T.WATER : tiles[idx(x, y)]; },
    walkable(x, y) { const t = this.get(x, y); return t !== T.BUILD && t !== T.WATER; },
    poi(id) { return pois.find((p) => p.id === id) || null; },
    poiAt(x, y) { return pois.find((p) => x >= p.area.x0 && x <= p.area.x1 && y >= p.area.y0 && y <= p.area.y1) || null; },
  };
}

function pick(rng, a) { return a[Math.floor(rng() * a.length)]; }

/** Projection isométrique 2:1. */
export const ISO = { TW: 64, TH: 32, LEVEL: 22 };
export function toScreen(x, y) { return { sx: (x - y) * ISO.TW / 2, sy: (x + y) * ISO.TH / 2 }; }
export function toTile(sx, sy) {
  const a = sx / (ISO.TW / 2), b = sy / (ISO.TH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
