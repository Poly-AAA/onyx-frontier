const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const assert = require('assert');

module.exports = async function() {
  const target = '/workspace/game/bots/gemini/corruption-v2.js';
  if (!fs.existsSync(target)) {
    return [{ name: 'corruption', status: 'SKIP', detail: 'Module absent: ' + target }];
  }

  try {
    const loaded = await import(pathToFileURL(target).href);
    const exports = { ...loaded.default, ...loaded };
    const clampFunctions = ['clampCorruption', 'clamp'].filter(fn => typeof exports[fn] === 'function');

    if (clampFunctions.length === 0) {
      return [{ name: 'corruption', status: 'SKIP', detail: 'API de bornage absente. Ce test couvre uniquement clampCorruption/clamp. Seuls les seuils exportés sont listés (pas de vérification contractuelle).' }];
    }

    const testValues = [-50, 0, 1, 99, 100, 150];
    const exportedThresholds = clampFunctions.map(fn => exports[fn].threshold || 'non défini').join(', ');

    for (const fn of clampFunctions) {
      for (const x of testValues) {
        const result = await exports[fn](x);
        assert.strictEqual(result, Math.max(0, Math.min(100, x)));
      }
    }

    return [
      { name: 'corruption/seuils', status: 'SKIP', detail: 'Seuils clinique/occulte: contrat exact et adaptateur requis' },
      { name: 'corruption', status: 'PASS', detail: 'bornes vérifiées (' + clampFunctions.join(', ') + '). Seuls les seuils exportés sont listés: ' + exportedThresholds + '. Ce test est PARTIEL: pas de vérification des seuils cliniques/occultes (contrat exact requis).' }
    ];
  } catch (err) {
    throw new Error(`Import failed: ${err.message}`);
  }
}