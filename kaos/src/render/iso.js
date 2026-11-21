/** Rendu canvas isométrique : sol, bâtiments extrudés, mobilier cyberpunk, sprites Fantasy Creator, cercle de baston. */
import { T, ISO, toScreen } from "../world/city.js";

const DIR_ROW = [2, 3, 4, 5, 6, 7, 0, 1]; // fantasy-cc dir-row.json (Idle/Walk)
const sheets = {};
export function loadSheets(looks, base = "assets/chars/") {
  const ps = [];
  looks.forEach((l) => ["Idle", "Walk"].forEach((a) => {
    const im = new Image(); im.src = `${base}${l}_${a}.png`;
    sheets[`${l}_${a}`] = im;
    ps.push(new Promise((r) => { im.onload = r; im.onerror = r; }));
  }));
  return Promise.all(ps);
}

const GROUND = { [T.GRASS]: ["#2b3a2c", "#304130"], [T.ROAD]: ["#26262e", "#2a2a33"], [T.WALK]: ["#5d5a66", "#646170"], [T.PLAZA]: ["#6e5f74", "#776880"], [T.PARK]: ["#35502e", "#3a5733"], [T.WATER]: ["#1d3440", "#21394a"], [T.BUILD]: ["#35323a", "#35323a"] };

function diamond(ctx, sx, sy, w = ISO.TW, h = ISO.TH) {
  ctx.beginPath(); ctx.moveTo(sx, sy - h / 2); ctx.lineTo(sx + w / 2, sy); ctx.lineTo(sx, sy + h / 2); ctx.lineTo(sx - w / 2, sy); ctx.closePath();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function render(ctx, g, W, H) {
  const { city, cam } = g;
  const z = cam.zoom;
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.fillStyle = "#14121a"; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z);
  const c = toScreen(cam.x, cam.y); ctx.translate(-c.sx, -c.sy);
  const span = Math.ceil((Math.max(W, H) / z) / ISO.TH) + 4;
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const vis = (x, y) => { const p = toScreen(x, y); return Math.abs(p.sx - c.sx) < W / z / 2 + 80 && Math.abs(p.sy - c.sy) < H / z / 2 + 160; };
  // sol
  for (let y = Math.max(0, cy - span); y < Math.min(city.H, cy + span); y++) for (let x = Math.max(0, cx - span); x < Math.min(city.W, cx + span); x++) {
    if (!vis(x, y)) continue;
    const t = city.get(x, y), p = toScreen(x, y);
    const pal = GROUND[t];
    diamond(ctx, p.sx, p.sy); ctx.fillStyle = pal[(x + y) & 1]; ctx.fill();
    if (t === T.ROAD && ((x % 9 === 0 && y % 9 > 1 && y % 2) || (y % 9 === 0 && x % 9 > 1 && x % 2))) { // marquage
      ctx.fillStyle = "#c9a23a"; diamond(ctx, p.sx, p.sy, 10, 5); ctx.fill();
    }
    if (t === T.WALK) { ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1; diamond(ctx, p.sx, p.sy); ctx.stroke(); }
    if (t === T.WATER) { ctx.fillStyle = `rgba(255,80,160,${0.08 + 0.06 * Math.sin(g.time * 0.05 + x + y)})`; diamond(ctx, p.sx, p.sy); ctx.fill(); }
  }
  // cercle rouge de baston (au sol, suit le joueur)
  if (g.brawl && !g.brawl.over) {
    const p = toScreen(g.player.x, g.player.y);
    const r = g.brawlR * ISO.TW / 2 * Math.SQRT2;
    const pulse = 1 + 0.03 * Math.sin(g.real * 8);
    ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(pulse, pulse * 0.5);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(220,30,40,.13)"; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,40,50,.9)"; ctx.setLineDash([14, 8]); ctx.lineDashOffset = -g.real * 30; ctx.stroke();
    ctx.restore();
  }
  // objets triés par profondeur
  const objs = [];
  for (let y = Math.max(0, cy - span); y < Math.min(city.H, cy + span); y++) for (let x = Math.max(0, cx - span); x < Math.min(city.W, cx + span); x++) {
    const i = city.idx(x, y);
    if (city.tiles[i] === T.BUILD && city.height[i] > 0 && vis(x, y)) objs.push({ d: x + y, k: "b", x, y, i });
  }
  city.decor.forEach((o) => { if (vis(o.x, o.y)) objs.push({ d: o.x + o.y + 0.1, k: "d", o }); });
  g.npcs.forEach((n) => { if (n.alive && vis(n.x, n.y)) objs.push({ d: n.x + n.y + 0.2, k: "c", e: n }); });
  objs.push({ d: g.player.x + g.player.y + 0.2, k: "c", e: g.player, me: true });
  objs.sort((a, b) => a.d - b.d);
  objs.forEach((o) => { if (o.k === "b") drawBuilding(ctx, g, o); else if (o.k === "d") drawDecor(ctx, g, o.o); else drawChar(ctx, g, o.e, o.me); });
  // pétales (cerisiers) — particules légères
  g.petals.forEach((pt) => { const p = toScreen(pt.x, pt.y); ctx.fillStyle = pt.holo ? "rgba(255,120,220,.8)" : "#f7b6cf"; ctx.fillRect(p.sx, p.sy - pt.h, 2, 2); });
  // enseignes POI
  ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
  city.pois.forEach((p) => {
    if (!vis(p.door.x, p.door.y)) return;
    const s = toScreen(p.door.x, p.door.y - 0.6), hh = (p.h || 0) * ISO.LEVEL + 18;
    const w = ctx.measureText(p.name).width + 10;
    ctx.fillStyle = "rgba(20,10,25,.8)"; ctx.fillRect(s.sx - w / 2, s.sy - hh - 12, w, 15);
    ctx.fillStyle = p.roof || "#ff5fa8"; ctx.fillText(p.name, s.sx, s.sy - hh);
  });
  ctx.restore();
  // nuit : voile chaud (pas de glow bleu)
  const h = g.hour + g.minute / 60;
  const night = h < 6 ? 0.45 : h < 8 ? 0.45 * (8 - h) / 2 : h > 20 ? Math.min(0.45, (h - 20) * 0.15) : 0;
  if (night > 0) { ctx.fillStyle = `rgba(30,10,40,${night})`; ctx.fillRect(0, 0, W, H); }
}

function drawBuilding(ctx, g, o) {
  const { city } = g; const { x, y, i } = o;
  const hh = city.height[i] * ISO.LEVEL, col = city.color[i];
  const p = toScreen(x, y), w = ISO.TW / 2, h = ISO.TH / 2;
  const nh = (xx, yy) => (city.get(xx, yy) === T.BUILD ? city.height[city.idx(xx, yy)] : 0) * ISO.LEVEL;
  if (nh(x, y + 1) < hh) { // face gauche (vers +y)
    ctx.beginPath(); ctx.moveTo(p.sx - w, p.sy); ctx.lineTo(p.sx, p.sy + h); ctx.lineTo(p.sx, p.sy + h - hh); ctx.lineTo(p.sx - w, p.sy - hh); ctx.closePath();
    ctx.fillStyle = shade(col.wall, 0.75); ctx.fill();
    windows(ctx, g, p.sx - w, p.sy, -1, hh, x * 7 + y);
  }
  if (nh(x + 1, y) < hh) { // face droite (vers +x)
    ctx.beginPath(); ctx.moveTo(p.sx, p.sy + h); ctx.lineTo(p.sx + w, p.sy); ctx.lineTo(p.sx + w, p.sy - hh); ctx.lineTo(p.sx, p.sy + h - hh); ctx.closePath();
    ctx.fillStyle = shade(col.wall, 1); ctx.fill();
    windows(ctx, g, p.sx, p.sy + h, 1, hh, x + y * 5);
  }
  diamond(ctx, p.sx, p.sy - hh); ctx.fillStyle = col.roof; ctx.fill();
}
function windows(ctx, g, x0, y0, side, hh, seed) {
  const floors = Math.floor(hh / ISO.LEVEL);
  for (let f = 0; f < floors; f++) {
    const lit = ((seed * 31 + f * 17) % 5) > 1;
    ctx.fillStyle = lit ? (((seed + f) % 3) ? "#ffcf6a" : "#ff6fb4") : "#2a2430";
    const yy = y0 - f * ISO.LEVEL - 14;
    const dx = 16, k = side < 0 ? 0.5 : -0.5;
    ctx.beginPath(); ctx.moveTo(x0 + 10, yy + k * 10 * (side < 0 ? 1 : 1)); ctx.lineTo(x0 + 10 + dx - 4, yy + (side < 0 ? 0.5 : -0.5) * (dx - 4) + k * 10); ctx.lineTo(x0 + 10 + dx - 4, yy + (side < 0 ? 0.5 : -0.5) * (dx - 4) + k * 10 + 7); ctx.lineTo(x0 + 10, yy + k * 10 + 7); ctx.closePath(); ctx.fill();
  }
}

function drawDecor(ctx, g, o) {
  const p = toScreen(o.x, o.y);
  const t = g.real;
  switch (o.kind) {
    case "lamp": {
      ctx.fillStyle = "#1c1a22"; ctx.fillRect(p.sx - 1.5, p.sy - 46, 3, 46);
      ctx.fillStyle = o.hue; ctx.fillRect(p.sx - 7, p.sy - 49, 14, 4);
      ctx.fillStyle = o.hue + "22"; diamond(ctx, p.sx, p.sy, 46, 23); ctx.fill();
      break;
    }
    case "sakura": case "sakura_holo": {
      const holo = o.kind === "sakura_holo", s = o.small ? 0.7 : 1;
      ctx.fillStyle = holo ? "rgba(120,60,90,.9)" : "#4a2f26"; ctx.fillRect(p.sx - 2 * s, p.sy - 26 * s, 4 * s, 26 * s);
      const blob = (dx, dy, r, c) => { ctx.beginPath(); ctx.arc(p.sx + dx * s, p.sy + dy * s, r * s, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
      const a = holo ? 0.55 + 0.15 * Math.sin(t * 2 + o.x) : 1;
      blob(-9, -32, 12, holo ? `rgba(255,90,200,${a})` : "#e98fb0"); blob(9, -34, 12, holo ? `rgba(255,140,230,${a})` : "#f4a7c3"); blob(0, -44, 13, holo ? `rgba(255,170,240,${a})` : "#ffc2d6");
      if (holo) { ctx.strokeStyle = `rgba(255,200,250,${a * 0.6})`; ctx.beginPath(); ctx.moveTo(p.sx - 16 * s, p.sy - 40 * s + (t * 20 % 24) * s); ctx.lineTo(p.sx + 16 * s, p.sy - 40 * s + (t * 20 % 24) * s); ctx.stroke(); }
      break;
    }
    case "bench": {
      ctx.fillStyle = "#2b2a33"; ctx.fillRect(p.sx - 12, p.sy - 8, 24, 5);
      ctx.fillStyle = "#ffb000"; ctx.fillRect(p.sx - 12, p.sy - 10, 24, 2);
      ctx.fillStyle = "#1a1920"; ctx.fillRect(p.sx - 10, p.sy - 3, 2, 4); ctx.fillRect(p.sx + 8, p.sy - 3, 2, 4);
      break;
    }
    case "fence": {
      ctx.strokeStyle = "#3a3742"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.sx - 16, p.sy - 8 + (o.side === "n" ? -8 : 8)); ctx.lineTo(p.sx + 16, p.sy + 8 + (o.side === "n" ? -8 : 8)); ctx.stroke();
      ctx.strokeStyle = "rgba(255,63,164,.7)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.sx - 16, p.sy - 14 + (o.side === "n" ? -8 : 8)); ctx.lineTo(p.sx + 16, p.sy + 2 + (o.side === "n" ? -8 : 8)); ctx.stroke();
      break;
    }
    case "vending": {
      ctx.fillStyle = "#3a1830"; ctx.fillRect(p.sx - 8, p.sy - 34, 16, 34);
      ctx.fillStyle = "#ff3fa4"; ctx.fillRect(p.sx - 6, p.sy - 31, 12, 12);
      ctx.fillStyle = "#ffcf6a"; ctx.fillRect(p.sx - 6, p.sy - 16, 12, 3);
      break;
    }
    case "holo": { // statue holographique de lutteur au centre de la place
      ctx.fillStyle = "#2a2430"; diamond(ctx, p.sx, p.sy, 40, 20); ctx.fill();
      const a = 0.5 + 0.2 * Math.sin(t * 3);
      ctx.fillStyle = `rgba(255,110,200,${a})`; ctx.beginPath(); ctx.ellipse(p.sx, p.sy - 34, 10, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,190,90,${a})`; ctx.fillRect(p.sx - 14, p.sy - 44, 28, 3);
      break;
    }
  }
}

function drawChar(ctx, g, e, me) {
  const p = toScreen(e.x, e.y);
  const anim = e.moving ? "Walk" : "Idle";
  const im = sheets[`${e.look}_${anim}`];
  const s = (me ? 1.25 : 1) * (e.ko ? 0.9 : 1); // joueur massif (sumo tanky)
  if (im && im.complete && im.naturalWidth) {
    const fr = Math.floor(g.real * (e.moving ? 12 : 8) + (e.phase || 0)) % 15;
    const row = DIR_ROW[e.dir | 0];
    ctx.save(); ctx.translate(p.sx, p.sy);
    if (e.ko) { ctx.rotate(-Math.PI / 2.4); ctx.globalAlpha = 0.7; }
    ctx.drawImage(im, fr * 128, row * 128, 128, 128, -64 * s, -90 * s, 128 * s, 128 * s);
    ctx.restore();
  }
  // flash dégâts
  const hits = g.brawl && g.brawl.lastHits ? g.brawl.lastHits.filter((h) => h.id === (me ? "player" : e.id)) : [];
  hits.forEach((h) => { const k = (g.brawl.t - h.t) / 0.8; ctx.fillStyle = `rgba(255,${me ? 60 : 220},60,${1 - k})`; ctx.font = "bold 13px system-ui"; ctx.textAlign = "center"; ctx.fillText("-" + h.v, p.sx + 10, p.sy - 60 * s - k * 20); });
  if (me) return;
  ctx.font = "10px system-ui"; ctx.textAlign = "center";
  ctx.fillStyle = e.hostile || e.fighting ? "#ff5a5a" : "#e9e3f0"; ctx.fillText(e.name, p.sx, p.sy - 58);
  if (e.fighting && e.brawlRef) { const f = e.brawlRef; ctx.fillStyle = "#300"; ctx.fillRect(p.sx - 15, p.sy - 70, 30, 4); ctx.fillStyle = "#f44"; ctx.fillRect(p.sx - 15, p.sy - 70, 30 * f.pv / f.pvMax, 4); }
  if (e.missionOffer && !e.fighting) { ctx.fillStyle = "#ffcf3a"; ctx.font = "bold 16px system-ui"; ctx.fillText("!", p.sx, p.sy - 72 - 3 * Math.sin(g.real * 4)); }
  if (e.bark && g.time < e.barkUntil) {
    ctx.font = "11px system-ui"; const w = Math.min(160, ctx.measureText(e.bark).width + 12);
    ctx.fillStyle = "rgba(255,250,240,.95)"; ctx.fillRect(p.sx - w / 2, p.sy - 96, w, 18);
    ctx.fillStyle = "#222"; ctx.fillText(e.bark.length > 26 ? e.bark.slice(0, 25) + "…" : e.bark, p.sx, p.sy - 83);
  }
}
