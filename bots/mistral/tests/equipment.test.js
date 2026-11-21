const fs = require('node:fs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

module.exports = async function() {
    const results = [];
    const target = '/workspace/game/bots/openrouter/equipment.js';

    if (!fs.existsSync(target)) return [{name:'equipment',status:'SKIP',detail:'module absent'}];
    try {
        const loaded = await import(pathToFileURL(target).href);
        const Equipment = loaded.default?.Equipment || loaded.Equipment || loaded.default;
        if (typeof Equipment !== 'function') {
            results.push({name: 'equipment', status: 'SKIP', detail: 'module absent'});
            return results;
        }

        // Test 1: Basic stats and equipment
        try {
            const eq = new Equipment({storage: null});
            const armor = {id: 'armor', name: 'Armor', folder: 'test/chest', slot: 'chest', stats: {defense: 5, hp: 10}};
            eq.addItem(armor);
            assert.strictEqual((eq.getStats().defense ?? 0), 0, 'initial defense should be 0');
            eq.equip('armor');
            assert.strictEqual(eq.getStats().defense, 5, 'defense should be 5 after equipping');
            assert.strictEqual(eq.getStats().hp, 10, 'hp should be 10 after equipping');
            assert.strictEqual(eq.snapshot().inventory.length, 0, 'inventory should be empty');
            assert.strictEqual(eq.snapshot().equipped.chest.id, 'armor', 'chest slot should have armor');
            eq.unequip('chest');
            assert.strictEqual((eq.getStats().defense ?? 0), 0, 'defense should be 0 after unequipping');
            assert.strictEqual((eq.getStats().hp ?? 0), 0, 'hp should be 0 after unequipping');
            assert.ok(eq.snapshot().inventory.some(i => i.id === 'armor'), 'armor should be in inventory');
            assert.strictEqual(eq.snapshot().equipped.chest, undefined, 'chest slot should be undefined');
            results.push({name: 'equipment/stats', status: 'PASS'});
        } catch (e) {
            results.push({name: 'equipment/stats', status: 'FAIL', detail: e.message});
        }

        // Test 2: Replacement equipment
        try {
            const eq = new Equipment({storage: null});
            const armor = {id: 'armor', name: 'Armor', folder: 'test/chest', slot: 'chest', stats: {defense: 5}};
            const armor2 = {id: 'armor2', name: 'Armor2', folder: 'test/chest', slot: 'chest', stats: {defense: 7}};
            eq.addItem(armor);
            eq.addItem(armor2);
            eq.equip('armor');
            eq.equip('armor2');
            assert.strictEqual(eq.getStats().defense, 7, 'defense should be 7 after equipping armor2');
            assert.ok(eq.snapshot().inventory.some(i => i.id === 'armor'), 'armor should be in inventory');
            eq.unequip('chest');
            assert.strictEqual((eq.getStats().defense ?? 0), 0, 'defense should be 0 after unequipping');
            results.push({name: 'equipment/replacement', status: 'PASS'});
        } catch (e) {
            results.push({name: 'equipment/replacement', status: 'FAIL', detail: e.message});
        }

        // Test 3: Synthetic body compatibility matrix
        try {
            const morphologies = ['standard', 'slim', 'muscular', 'heavy', 'petite', 'tall'];
            const sexes = ['feminin', 'masculin'];

            for (const morphology of morphologies) {
                for (const sex of sexes) {
                    const eq = new Equipment({storage: null});
                    eq.setBody({morphology, sex});
                    const armor = {id: 'armor', name: 'Armor', folder: 'test/chest', slot: 'chest', stats: {defense: 5}};
                    eq.addItem(armor);
                    eq.equip('armor');
                    for (let row=0; row<8; row++) {     const layers = eq.getLayers(row);
    assert.ok(layers.some(layer => layer.item.id === 'armor')); }
                    const snapshot = eq.snapshot();
                    assert.strictEqual(snapshot.body.morphology, morphology, `morphology should match input`);
                    assert.strictEqual(snapshot.body.sex, sex, `sex should match input`);
                    assert.strictEqual(eq.getStats().defense, 5, 'defense should be 5');
                    assert.ok(snapshot.equipped.chest.id === 'armor', 'armor should be equipped');
                    eq.unequip('chest');
                    assert.strictEqual((eq.getStats().defense ?? 0), 0, 'defense should be 0 after unequipping');
                    assert.ok(eq.snapshot().inventory.some(i => i.id === 'armor'), 'armor should be in inventory');
                }
            }
            results.push({name: 'equipment/synthetic-body-matrix', status: 'PASS', detail: 'synthetic fixtures only'});
        } catch (e) {
            results.push({name: 'equipment/synthetic-body-matrix', status: 'FAIL', detail: e.message});
        }

        // Skip real morphologies test
        results.push({
            name: 'equipment/all-real-morphologies',
            status: 'SKIP',
            detail: 'Catalogue exhaustif des morphologies et ajustement visuel non disponibles: compatibilite complete non prouvee'
        });

    } catch (e) {
        results.push({
            name: 'equipment',
            status: 'FAIL',
            detail: `import error: ${e.message}`
        });
    }

    return results;
}
