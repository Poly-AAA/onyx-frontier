/** Sauvegarde neofaille.v1 : l'ancienne version passe en .bak avant écriture ; aucune clé n'est jamais effacée. */
export const KEY = "neofaille.v1";
export function save(storage, data) {
  const json = JSON.stringify({ v: 1, at: Date.now(), ...data });
  try {
    const prev = storage.getItem(KEY);
    if (prev) storage.setItem(KEY + ".bak", prev);
    storage.setItem(KEY, json);
    return true;
  } catch (e) { return false; } // quota : rien n'est écrasé
}
export function load(storage) {
  for (const k of [KEY, KEY + ".bak"]) {
    try { const d = JSON.parse(storage.getItem(k) || "null"); if (d && d.v === 1) return d; } catch (e) { /* essaie .bak */ }
  }
  return null;
}
