/**
 * Couches futures C3–C8 : interfaces seulement (non codées en V1). Chaque couche lit son JSON (data/layers.json + schémas)
 * et peut être remplacée sans recompiler par un module listé dans config.mods (import dynamique : mod.register(api)).
 */
const stub = (name) => () => { throw new Error(`${name} : non implémenté en V1 (stub)`); };
export const Layers = {
  C3_character: { applyBodyState: stub("C3.applyBodyState"), setMorph: stub("C3.setMorph"), loseLimb: stub("C3.loseLimb"), equip: stub("C3.equip") },
  C4_npc: { classes: ["inert", "scripted", "key"], spawn: stub("C4.spawn"), remember: stub("C4.remember"), reactToOutfit: stub("C4.reactToOutfit") },
  C5_vehicle: { build: stub("C5.build"), jump: stub("C5.jump"), setLocalGravity: stub("C5.setLocalGravity") },
  C6_combat: { circleRadius: stub("C6.circleRadius"), start: stub("C6.start") },
  C7_craft: { canCraft: stub("C7.canCraft"), craft: stub("C7.craft"), invent: stub("C7.invent") },
  C8_ai: { loadLocalModel: stub("C8.loadLocalModel"), npcReply: stub("C8.npcReply"), worldTick: stub("C8.worldTick") },
};
export async function loadMods(urls, api) {
  for (const u of urls || []) { try { const m = await import(/* @vite-ignore */ new URL(u, location.href).href); if (m.register) await m.register(api); } catch (e) { console.warn("mod ignoré", u, e.message); } }
}
