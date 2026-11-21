/**
 * Missions proposées par les PNJ (pures). Une mission naît d'un besoin réel du PNJ
 * (argent bas -> dette à récupérer, faim -> livraison de repas, social -> message à porter, besoin médical...).
 * Le LLM peut reformuler le pitch, mais la logique (cible, récompense, validation) reste ici.
 */
let SEQ = 1;

export const MISSION_TYPES = ["livraison", "message", "reglement"];

export function generateMission(npc, world, rng, heroLevel = 1) {
  const n = npc.needs;
  const others = world.npcs.filter((o) => o.id !== npc.id && o.alive);
  const lvl = Math.max(1, heroLevel | 0);
  let m;
  if (npc.id === "doc" || (n.faim < 45 && rng() < 0.6)) {
    const src = npc.id === "doc" ? world.city.poi("entrepot") : world.city.poi(rng() < 0.5 ? "marche" : "bar");
    const item = npc.id === "doc" ? "caisse de médicaments" : (src.id === "bar" ? "plat du jour" : "panier de fruits");
    m = {
      type: "livraison", item,
      title: `${cap(item)} pour ${npc.name}`,
      desc: `Va chercher ${art(item)} à ${src.name} et rapporte-le à ${npc.name}.`,
      steps: [{ kind: "reach", poi: src.id, label: `Aller à ${src.name}` }, { kind: "talk", npc: npc.id, label: `Rapporter à ${npc.name}` }],
      reward: { gold: 15 + lvl * 4, xp: 60 + lvl * 20, opinion: 15 },
    };
    if (npc.id === "doc") {
      m.steps.splice(1, 0, { kind: "fight", foe: "brute", label: "Le gang garde la caisse : combattre" });
      m.reward = { gold: 40 + lvl * 6, xp: 140 + lvl * 30, opinion: 25 };
    }
  } else if ((n.argent < 50 || npc.traits.greed > 0.7) && others.some((o) => o.id === "brute") && npc.id !== "brute") {
    m = {
      type: "reglement",
      title: `La dette de ${npc.name}`,
      desc: `Kross rackette ${npc.name}. Trouve-le et règle le problème… à ta façon.`,
      steps: [{ kind: "fight", foe: "brute", label: "Battre Kross" }, { kind: "talk", npc: npc.id, label: `Revenir voir ${npc.name}` }],
      reward: { gold: 30 + lvl * 6, xp: 120 + lvl * 25, opinion: 25 },
    };
  } else {
    const target = others[Math.floor(rng() * others.length)];
    m = {
      type: "message",
      title: `Un mot pour ${target.name}`,
      desc: `${npc.name} veut que tu passes un message discret à ${target.name}.`,
      steps: [{ kind: "talk", npc: target.id, label: `Parler à ${target.name}` }, { kind: "talk", npc: npc.id, label: `Revenir voir ${npc.name}` }],
      reward: { gold: 10 + lvl * 3, xp: 50 + lvl * 15, opinion: 10, opinionTarget: 5 },
      target: target.id,
    };
  }
  return { id: "m" + (SEQ++) + "_" + npc.id, giver: npc.id, giverName: npc.name, status: "offerte", stepIndex: 0, pitch: null, ...m };
}

export function currentStep(m) { return m && m.steps[m.stepIndex] || null; }

/** Avance la mission si l'événement correspond à l'étape courante. Renvoie true si étape validée. */
export function advance(m, ev) {
  if (!m || m.status !== "acceptee") return false;
  const s = currentStep(m);
  if (!s) return false;
  const ok = (s.kind === "reach" && ev.kind === "reach" && ev.poi === s.poi)
    || (s.kind === "talk" && ev.kind === "talk" && ev.npc === s.npc)
    || (s.kind === "fight" && ev.kind === "fightWon" && ev.foe === s.foe);
  if (!ok) return false;
  m.stepIndex += 1;
  if (m.stepIndex >= m.steps.length) m.status = "terminee";
  return true;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function art(s) { return /^[aeiouéè]/i.test(s) ? "l'" + s : (s.startsWith("caisse") ? "la " + s : "le " + s); }
