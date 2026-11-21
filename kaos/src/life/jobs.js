/**
 * Simulation de vie : métiers (PNJ + joueur) et carrière de ligue.
 * Données de carrière reprises telles quelles de la v3.7.9 (data/career-data.json : ligues, commentaires,
 * entraînements, sponsors/contrats). Les stats/XP viennent de roguelite.js.
 */
import CAREER from "../../data/career-data.json" with { type: "json" };
import * as R from "../core/roguelite.js";

export { CAREER };

/** Métiers : lieu, salaire/heure de jeu, stat travaillée (gain lent), fatigue. */
export const JOBS = [
  { id: "mecano", name: "Mécano", poi: "garage", pay: 6, stat: "force", tired: 10 },
  { id: "medecin", name: "Infirmier·e", poi: "clinique", pay: 7, stat: "sage", tired: 8 },
  { id: "marchand", name: "Marchand·e", poi: "marche", pay: 5, stat: "chance", tired: 6 },
  { id: "barman", name: "Barman", poi: "bar", pay: 5, stat: "agi", tired: 7 },
  { id: "flic", name: "Agent de patrouille", poi: "commissariat", pay: 8, stat: "vit", tired: 12 },
  { id: "docker", name: "Docker", poi: "entrepot", pay: 9, stat: "force", tired: 15 },
  { id: "hacker", name: "Hacker", poi: "bar", pay: 8, stat: "intel", tired: 9 },
  { id: "jardinier", name: "Jardinier holo", poi: "parc", pay: 4, stat: "sage", tired: 5 },
];

export function jobsAt(poiId) { return JOBS.filter((j) => j.poi === poiId); }

export function createCareer(rng) {
  const lg = CAREER.leagues[0];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return {
    league: lg.id, leagueName: lg.name, team: pick(lg.teams), arena: pick(lg.arenas), presenter: pick(lg.presenters),
    wins: 0, losses: 0, fatigue: 0, jobXp: {}, contract: null, day: 1,
  };
}

export function comment(kind, vars, rng) {
  const list = CAREER.commentary[kind] || [];
  let s = list[Math.floor(rng() * list.length)] || "";
  Object.entries(vars).forEach(([k, v]) => { s = s.split("{" + k + "}").join(v); });
  return s.replace(/\{[a-zA-Z]+\}/g, "").trim();
}

/** Le joueur travaille `hours` heures : kamas, XP de métier, +1 stat tous les 4 niveaux de métier, fatigue. */
export function work(state, career, jobId, hours = 1) {
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) return { ok: false, reason: "métier" };
  if (career.fatigue >= 100) return { ok: false, reason: "épuisé" };
  const lvBefore = jobLevel(career, jobId);
  career.jobXp[jobId] = (career.jobXp[jobId] | 0) + 10 * hours;
  const lv = jobLevel(career, jobId);
  const gold = Math.round(job.pay * hours * (1 + lv * 0.1));
  state.hero.gold += gold;
  career.fatigue = Math.min(100, career.fatigue + job.tired * hours);
  let statUp = null;
  if (Math.floor(lv / 4) > Math.floor(lvBefore / 4)) { state.hero.base[job.stat] += 1; statUp = job.stat; R.recomputeVitals(state.hero); }
  return { ok: true, gold, level: lv, statUp, job };
}

export function jobLevel(career, jobId) { return 1 + Math.floor(Math.sqrt((career.jobXp[jobId] | 0) / 10)); }

/** Entraînement (données v3.7.9 `trainings`) : +1 stat ciblée, fatigue. */
export function train(state, career, trainingId) {
  const t = CAREER.trainings.find((x) => x.id === trainingId);
  if (!t) return { ok: false };
  if (career.fatigue + t.fatigue > 100) return { ok: false, reason: "épuisé" };
  if (t.stat && state.hero.base[t.stat] != null) state.hero.base[t.stat] += 1;
  career.fatigue += t.fatigue;
  R.recomputeVitals(state.hero);
  return { ok: true, t };
}

/** Contrat de sponsor (données v3.7.9 `sponsors`) proposé après une victoire de ligue. */
export function offerContract(career, rng) {
  if (career.contract || career.wins < 1) return null;
  const s = CAREER.sponsors[Math.floor(rng() * CAREER.sponsors.length)];
  return { id: s.id, name: s.name, perDay: s.perDay, days: s.days, conditions: s.conditions };
}
