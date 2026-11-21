/** Interface DOM portrait : HUD, minicarte, dialogue PNJ, panneaux (sac, sorts, métiers, missions, clinique), barre de sorts en baston. */
import * as G from "./game.js";
import * as Brawl from "./combat/brawl.js";
import { talk, remoteAvailable } from "./ai/dialogue.js";
import { heal, healPrice, equip, unlockedSpells, xpNeed, SLOTS, SLOT_LABEL, STAT_LABEL } from "./combat/bridge.js";
import { JOBS, jobsAt, work, jobLevel, train, CAREER } from "./life/jobs.js";
import { T } from "./world/city.js";
import { currentStep } from "./ai/missions.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function mountUi(g) {
  g.onUi = (what) => { if (what === "brawl" || what === "brawlEnd") renderSpellbar(g); if (what === "poi") renderContext(g); };
  $("#btnBag").onclick = () => panelBag(g);
  $("#btnSpells").onclick = () => panelSpells(g);
  $("#btnJobs").onclick = () => panelJobs(g);
  $("#btnMissions").onclick = () => panelMissions(g);
  $("#panelClose").onclick = closePanel;
  $("#dlgClose").onclick = () => closeDialogue(g);
  drawMinimapBase(g);
  setInterval(() => hud(g), 200);
}

function hud(g) {
  const h = g.state.hero;
  $("#hpFill").style.width = (100 * h.pv / h.pvMax) + "%";
  $("#hpTxt").textContent = `${Math.round(h.pv)}/${h.pvMax}`;
  $("#lvl").textContent = `Niv ${h.level} · ${h.xp}/${xpNeed(h.level)} XP`;
  $("#gold").textContent = `${h.gold} ¥`;
  $("#clock").textContent = `J${g.day} ${String(g.hour).padStart(2, "0")}:${String(Math.floor(g.minute)).padStart(2, "0")}`;
  $("#fatigue").textContent = `Fatigue ${Math.round(g.career.fatigue)}%`;
  $("#ia").textContent = remoteAvailable() ? "IA en ligne" : "IA hors ligne (script)";
  const m = g.missions.find((x) => x.status === "acceptee");
  $("#track").textContent = m ? `▶ ${m.title} — ${currentStep(m).label}` : (g.phase === "ligue" ? `▶ ${g.career.leagueName} : gagne ton premier combat` : "Libre — parle aux habitants (!)");
  $("#toasts").innerHTML = g.toasts.slice(-3).map((t) => `<div class="toast">${esc(t.text)}</div>`).join("");
  if (g.brawl) {
    $("#paFill").style.width = (100 * g.brawl.pa / h.paMax) + "%";
    document.querySelectorAll(".spell").forEach((b) => { b.disabled = g.brawl.pa < (+b.dataset.cost); });
    $("#brawlInfo").textContent = `${g.brawl.foes.filter((f) => f.engaged && f.pv > 0).length} engagé(s) dans le cercle · ${g.brawl.foes.filter((f) => f.pv > 0).length} debout`;
  }
  drawMinimap(g);
  renderContext(g);
}

function renderSpellbar(g) {
  const bar = $("#spellbar");
  if (!g.brawl) { bar.hidden = true; return; }
  bar.hidden = false;
  $("#spells").innerHTML = g.brawl.spells.map((s, i) => `<button class="spell el-${s.element}" data-i="${i}" data-cost="${s.cost}"><b>${esc(s.name)}</b><small>${s.cost} PA · ${s.dmg ? s.dmg.join("-") : ""} ${s.element}${s.aoe ? " · zone" : ""}</small></button>`).join("");
  document.querySelectorAll(".spell").forEach((b) => b.onclick = () => { const r = Brawl.cast(g.brawl, g.state, +b.dataset.i, g.player); if (!r.ok) G.toast(g, r.reason === "PA" ? "Pas assez de PA" : "Personne dans le cercle", 1200); });
}

function nearNpc(g) {
  let best = null, bd = 1.9;
  g.npcs.forEach((n) => { if (!n.alive || n.ko || n.fighting) return; const d = Math.hypot(n.x - g.player.x, n.y - g.player.y); if (d < bd) { bd = d; best = n; } });
  return best;
}

function renderContext(g) {
  const box = $("#context");
  if (g.brawl || $("#dialogue").classList.contains("open")) { box.innerHTML = ""; return; }
  const n = nearNpc(g);
  const poi = g.city.poiAt(Math.round(g.player.x), Math.round(g.player.y));
  const key = (n ? n.id : "") + "|" + (poi ? poi.id : "");
  if (box.dataset.k === key) return;
  box.dataset.k = key;
  const btns = [];
  if (n) btns.push(`<button data-a="talk">💬 Parler à ${esc(n.name)}</button>`);
  if (poi && poi.id === "clinique") btns.push(`<button data-a="clinic">✚ Clinique</button>`);
  if (poi && jobsAt(poi.id).length) btns.push(`<button data-a="work">⚒ Travailler ici</button>`);
  if (poi && poi.id === "place") btns.push(`<button data-a="train">🏋 S'entraîner</button>`);
  box.innerHTML = btns.join("");
  box.querySelectorAll("button").forEach((b) => b.onclick = () => {
    const a = b.dataset.a;
    if (a === "talk") openDialogue(g, nearNpc(g)); else if (a === "clinic") panelClinic(g); else if (a === "work") panelJobs(g, poi.id); else panelTrain(g);
    box.dataset.k = "";
  });
}

/* ---------- dialogue ---------- */
let dlgNpc = null;
export function openDialogue(g, n) {
  if (!n) return;
  dlgNpc = n; n.talking = true; n.path = []; n.chat = n.chat || [];
  n.dir = (g.player.dir + 4) % 8;
  G.missionEvent(g, { kind: "talk", npc: n.id });
  $("#dialogue").classList.add("open");
  $("#dlgName").textContent = `${n.name} — ${n.role}`;
  $("#dlgLog").innerHTML = "";
  $("#dlgMission").innerHTML = "";
  dlgMeta(n);
  const choices = [["greet", "👋 Salut"], ["job", "💼 Du boulot ?"], ["rumor", "🗣 Quoi de neuf ?"], ["threat", "😠 Menacer"], ["fight", "🥊 Baston"], ["bye", "Au revoir"]];
  $("#dlgChoices").innerHTML = choices.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join("");
  $("#dlgChoices").querySelectorAll("button").forEach((b) => b.onclick = () => say(g, n, b.dataset.k, b.textContent.replace(/^\S+\s/, "")));
  $("#dlgForm").onsubmit = (e) => { e.preventDefault(); const v = $("#dlgInput").value.trim(); if (v) { $("#dlgInput").value = ""; say(g, n, "free", v); } };
  say(g, n, "greet", "Salut.");
}
function dlgMeta(n) { $("#dlgMeta").textContent = `humeur : ${n.mood} · opinion ${Math.round(n.opinion)} · faim ${Math.round(n.needs.faim)} énergie ${Math.round(n.needs.energie)} social ${Math.round(n.needs.social)} argent ${Math.round(n.needs.argent)}`; }
function addLine(who, text, src) { const d = document.createElement("div"); d.className = "line " + (who === "me" ? "me" : "npc"); d.innerHTML = `${esc(text)}${src ? ` <i>${esc(src)}</i>` : ""}`; $("#dlgLog").appendChild(d); $("#dlgLog").scrollTop = 1e6; }

async function say(g, n, intent, text) {
  if (intent === "bye") { addLine("me", text); setTimeout(() => closeDialogue(g), 400); return; }
  if (intent === "fight") { closeDialogue(g); G.startBrawl(g, [n]); return; }
  addLine("me", text);
  const intentMap = { greet: "greet", job: "job", rumor: "rumor", threat: "threat", free: /boulot|travail|mission|job|service/i.test(text) ? "job" : /menace|frappe|tue|dégage/i.test(text) ? "threat" : "greet" };
  const rep = await talk(n, { clock: G.clock(g), placeName: (g.city.poiAt(Math.round(n.x), Math.round(n.y)) || { name: "la rue" }).name, time: g.time }, text, intentMap[intent], g.rng);
  if (dlgNpc !== n) return;
  n.chat.push({ role: "user", content: text }, { role: "assistant", content: rep.say });
  n.chat = n.chat.slice(-8);
  n.opinion = Math.max(-100, Math.min(100, n.opinion + rep.opinionDelta));
  if (rep.mood) n.mood = rep.mood;
  addLine("npc", rep.say, rep.source === "script" ? "script" : "IA · " + rep.source);
  if (intent === "threat") n.memory.push({ t: g.time, kind: "menace", text: "le nouveau m'a menacé", weight: 2 });
  dlgMeta(n);
  if ((rep.action === "offer_mission" || intent === "job") && n.missionOffer) showOffer(g, n);
  if (rep.action === "attack") { setTimeout(() => { closeDialogue(g); n.hostile = true; G.startBrawl(g, [n]); }, 700); }
  if (rep.action === "flee") { n.fear = 80; setTimeout(() => closeDialogue(g), 700); }
}
function showOffer(g, n) {
  const m = n.missionOffer;
  $("#dlgMission").innerHTML = `<div class="mcard"><b>${esc(m.title)}</b><p>${esc(m.desc)}</p><small>Récompense : ${m.reward.gold} ¥ · ${m.reward.xp} XP</small><div><button id="mOk">Accepter</button><button id="mNo">Refuser</button></div></div>`;
  $("#mOk").onclick = () => { G.acceptMission(g, n); $("#dlgMission").innerHTML = ""; addLine("npc", "Marché conclu.", "jeu"); };
  $("#mNo").onclick = () => { $("#dlgMission").innerHTML = ""; n.opinion -= 2; };
}
function closeDialogue(g) { if (dlgNpc) dlgNpc.talking = false; dlgNpc = null; $("#dialogue").classList.remove("open"); G.save(g); }

/* ---------- panneaux ---------- */
function openPanel(title, html) { $("#panelTitle").textContent = title; $("#panelBody").innerHTML = html; $("#panel").classList.add("open"); }
function closePanel() { $("#panel").classList.remove("open"); }

function panelBag(g) {
  const h = g.state.hero, e = h.eff || {};
  const line = (it) => (it.lines || []).map((l) => `${l.value > 0 ? "+" : ""}${l.value} ${STAT_LABEL[l.stat] || l.stat}`).join(", ");
  const eq = SLOTS.map((s) => `<tr><td>${SLOT_LABEL[s]}</td><td>${h.equipped[s] ? esc(h.equipped[s].name) + `<small> ${line(h.equipped[s])}</small>` : "—"}</td></tr>`).join("");
  const inv = h.inventory.map((it) => `<li><button data-id="${it.id}">Équiper</button> ${esc(it.name)} <small>(${SLOT_LABEL[it.slot] || it.slot}) ${line(it)}</small></li>`).join("") || "<li>Sac vide</li>";
  openPanel(`${h.name} — ${h.geneLabel || ""}`, `<p>Vie ${h.pv}/${h.pvMax} · PA ${h.paMax} · PM ${h.pmMax} · Éléments : ${h.elements.join(", ")}</p>
  <p class="stats">${["vit", "force", "intel", "chance", "agi", "sage", "ini"].map((k) => `${STAT_LABEL[k]} <b>${e[k]}</b>`).join(" · ")}</p>
  <h4>Équipement</h4><table>${eq}</table><h4>Sac</h4><ul class="inv">${inv}</ul>`);
  document.querySelectorAll(".inv button").forEach((b) => b.onclick = () => { equip(h, b.dataset.id); panelBag(g); });
}
function panelSpells(g) {
  const all = g.state.hero.spells;
  openPanel("Sorts", `<ul>${all.map((s) => `<li class="el-${s.element}"><b>${esc(s.name)}</b> — ${s.cost} PA, portée ${s.range}, ${s.dmg ? s.dmg.join("-") : ""} ${s.element} ${s.unlock > g.state.hero.level ? `<small>(niv ${s.unlock})</small>` : ""}<br><small>${esc(s.desc || "")}</small></li>`).join("")}</ul>
  <p><small>En baston : tout ennemi dans le cercle rouge est engagé ; le sort touche le plus proche (ou tous si zone). Pas de ciblage libre.</small></p>`);
}
function panelJobs(g, poiId) {
  const list = poiId ? jobsAt(poiId) : JOBS;
  const npcs = g.npcs.filter((n) => n.def.job).map((n) => `${esc(n.name)} : ${JOBS.find((j) => j.id === n.def.job).name}${n.activity === "earn" ? " (au travail)" : ""}`).join(" · ");
  openPanel(poiId ? "Travailler ici" : "Métiers", `<ul>${list.map((j) => `<li><b>${j.name}</b> — ${g.city.poi(j.poi).name}, ${j.pay} ¥/h, entraîne ${STAT_LABEL[j.stat]} · niv ${jobLevel(g.career, j.id)} ${poiId ? `<button data-j="${j.id}">1 h</button><button data-j="${j.id}" data-h="4">4 h</button>` : ""}</li>`).join("")}</ul>
  ${poiId ? "" : "<p><small>Va sur le lieu de travail et appuie sur « Travailler ici ».</small></p>"}<h4>Habitants</h4><p><small>${npcs}</small></p>`);
  document.querySelectorAll("[data-j]").forEach((b) => b.onclick = () => {
    const hrs = +(b.dataset.h || 1);
    const r = work(g.state, g.career, b.dataset.j, hrs);
    if (!r.ok) return G.toast(g, r.reason === "épuisé" ? "Trop fatigué : va dormir ou attends." : "Impossible");
    for (let i = 0; i < hrs * 600; i++) G.update(g, 0.1); // le temps passe (1 h de jeu = 600 pas)
    G.toast(g, `${r.job.name} : +${r.gold} ¥ (métier niv ${r.level})${r.statUp ? ` · +1 ${STAT_LABEL[r.statUp]}` : ""}`);
    panelJobs(g, poiId);
  });
}
function panelTrain(g) {
  openPanel("Entraînement (Place)", `<ul>${CAREER.trainings.map((t) => `<li><button data-t="${t.id}">Faire</button> <b>${esc(t.label)}</b> — +1 ${STAT_LABEL[t.stat] || t.stat}, fatigue ${t.fatigue}<br><small>${esc(t.text)}</small></li>`).join("")}</ul>`);
  document.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { const r = train(g.state, g.career, b.dataset.t); G.toast(g, r.ok ? r.t.text : "Trop fatigué."); });
}
function panelMissions(g) {
  const act = g.missions.filter((m) => m.status === "acceptee").map((m) => `<li><b>${esc(m.title)}</b> (${esc(m.giverName)})<br>${m.steps.map((s, i) => `${i < m.stepIndex ? "✔" : i === m.stepIndex ? "▶" : "·"} ${esc(s.label)}`).join("<br>")}</li>`).join("") || "<li>Aucune</li>";
  const done = g.missions.filter((m) => m.status === "payee").map((m) => `<li>✔ ${esc(m.title)}</li>`).join("");
  const offers = g.npcs.filter((n) => n.missionOffer).map((n) => `<li>! ${esc(n.name)} a besoin d'aide</li>`).join("");
  const c = g.career;
  openPanel("Missions & carrière", `<h4>En cours</h4><ul>${act}</ul><h4>Propositions</h4><ul>${offers || "<li>—</li>"}</ul><h4>Terminées</h4><ul>${done || "<li>—</li>"}</ul>
  <h4>Carrière</h4><p>${esc(c.leagueName)} · équipe ${esc(c.team)} · ${c.wins} V / ${c.losses} D${c.contract ? ` · contrat ${esc(c.contract.name)} (${c.contract.days} j)` : ""}</p>`);
}
function panelClinic(g) {
  const tiers = [["mediocre", "Soin rapide"], ["bon", "Soin complet"], ["parfait", "Soin Néon"]];
  openPanel("Clinique Néon", `<p>Vie ${g.state.hero.pv}/${g.state.hero.pvMax}</p>${tiers.map(([t, l]) => `<button data-h="${t}">${l} — ${healPrice(g.state, t)} ¥</button>`).join(" ")}`);
  document.querySelectorAll("[data-h]").forEach((b) => b.onclick = () => { const r = heal(g.state, b.dataset.h, g.time * 13); G.toast(g, r.ok ? `+${r.amount} Vie (−${r.price} ¥)` : r.reason === "plein" ? "Déjà en pleine forme" : "Pas assez de ¥"); panelClinic(g); });
}

/* ---------- minicarte ---------- */
let mmBase = null;
const MM_COL = { [T.GRASS]: "#2b3a2c", [T.ROAD]: "#18181e", [T.WALK]: "#4a4752", [T.BUILD]: "#6a5f72", [T.PLAZA]: "#8a6f8e", [T.PARK]: "#3d6a33", [T.WATER]: "#203a48" };
function drawMinimapBase(g) {
  const c = g.city, cv = document.createElement("canvas"); cv.width = c.W; cv.height = c.H;
  const x = cv.getContext("2d");
  for (let j = 0; j < c.H; j++) for (let i = 0; i < c.W; i++) { x.fillStyle = MM_COL[c.get(i, j)]; x.fillRect(i, j, 1, 1); }
  mmBase = cv;
}
function drawMinimap(g) {
  const cv = $("#minimap"), x = cv.getContext("2d"), s = cv.width / g.city.W;
  x.imageSmoothingEnabled = false;
  x.save(); x.clearRect(0, 0, cv.width, cv.height);
  x.translate(cv.width / 2, cv.height / 2); x.rotate(Math.PI / 4); x.scale(0.7, 0.7); x.translate(-cv.width / 2, -cv.height / 2);
  x.drawImage(mmBase, 0, 0, cv.width, cv.height);
  g.npcs.forEach((n) => { x.fillStyle = n.fighting ? "#f33" : n.missionOffer ? "#ffcf3a" : n.def.gang ? "#c33" : "#ddd"; x.fillRect(n.x * s - 1.5, n.y * s - 1.5, 3, 3); });
  const m = g.missions.find((mm) => mm.status === "acceptee"), st = m && currentStep(m);
  if (st) { const t = st.poi ? g.city.poi(st.poi).door : (st.npc || st.foe) ? G.npc(g, st.npc || st.foe) : null; if (t) { x.strokeStyle = "#ffcf3a"; x.lineWidth = 2; x.strokeRect(t.x * s - 3, t.y * s - 3, 6, 6); } }
  x.fillStyle = "#ffb000"; x.beginPath(); x.arc(g.player.x * s, g.player.y * s, 3, 0, 7); x.fill();
  x.restore();
}
