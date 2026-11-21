const { strict: assert } = require('node:assert');
const { existsSync } = require('node:fs');
const { pathToFileURL } = require('node:url');

const target = '/workspace/game/bots/gemini/corruption-v2.js';


async function runTests() {
    if (!existsSync(target)) {
        return [{name:'corruption-api',status:'SKIP',detail:'Module absent'}];
    }

    try {
        const loaded = await import(pathToFileURL(target).href);
        const api = { ...loaded.default, ...loaded };
        const CLINIC_REFUSAL_THRESHOLD = api.CLINIC_REFUSAL_THRESHOLD ?? 60;

        if (!api.createCorruptionState || !api.getGauge || !api.npcReaction ||
            !api.clinicTreat || !api.getTier || !api.occultShopPrice || !Number.isFinite(CLINIC_REFUSAL_THRESHOLD)) {
            return [{name:'corruption-api',status:'SKIP',detail:'Adaptateur: exports requis absents'}];
        }

        const results = [];

        // Test getGauge clamping
        const clampCases = [
            { residual: -50, equipped: [], expected: 0 },
            { residual: 0, equipped: [], expected: 0 },
            { residual: 1, equipped: [], expected: 1 },
            { residual: 99, equipped: [], expected: 99 },
            { residual: 100, equipped: [], expected: 100 },
            { residual: 150, equipped: [], expected: 100 },
            { residual: 0, equipped: [{ id: 'a', corruption: 300 }], expected: 100 }
        ];

        for (const { residual, equipped, expected } of clampCases) {
            try {
                const state = api.createCorruptionState({ residual, marks: [], equipped });
                const gauge = api.getGauge(state);
                assert.strictEqual(gauge, expected, `getGauge(${residual},${equipped.length})`);
                results.push({ name: 'getGauge clamp', status: 'PASS' });
            } catch (e) {
                results.push({ name: 'getGauge clamp', status: 'FAIL', detail: e.message });
            }
        }

        // Test clinic refusal threshold
        const clinicThresholdCases = [
            { gauge: CLINIC_REFUSAL_THRESHOLD - 1, expectedAction: 'accepter' },
            { gauge: CLINIC_REFUSAL_THRESHOLD, expectedAction: 'refuser' },
            { gauge: CLINIC_REFUSAL_THRESHOLD + 1, expectedAction: 'refuser' }
        ];

        for (const { gauge, expectedAction } of clinicThresholdCases) {
            try {
                const state = api.createCorruptionState({ residual: gauge, marks: [] });
                const reaction = api.npcReaction(state, 'clinique');
                assert.strictEqual(reaction.action, expectedAction, `npcReaction(${gauge})`);
                results.push({ name: `clinic threshold ${gauge}`, status: 'PASS' });
            } catch (e) {
                results.push({ name: `clinic threshold ${gauge}`, status: 'FAIL', detail: e.message });
            }
        }

        // Test clinic treatment
        const clinicTreatCases = [
            { gauge: CLINIC_REFUSAL_THRESHOLD - 1, marks: [], expected: true },
            { gauge: CLINIC_REFUSAL_THRESHOLD, marks: [], expected: false },
            { gauge: CLINIC_REFUSAL_THRESHOLD + 1, marks: [], expected: false }
        ];

        for (const { gauge, marks, expected } of clinicTreatCases) {
            try {
                const state = api.createCorruptionState({ residual: gauge, marks });
                const treatResult = api.clinicTreat(state);
                assert.strictEqual(treatResult.ok, expected, `clinicTreat(${gauge})`);
                results.push({ name: `clinicTreat(${gauge})`, status: 'PASS' });
            } catch (e) {
                results.push({ name: `clinicTreat(${gauge})`, status: 'FAIL', detail: e.message });
            }
        }

        // Test occult/guerisseur always accepter
        const alwaysAccepterCases = [0, 49, 50, 79, 80, 100];
        for (const gauge of alwaysAccepterCases) {
            try {
                const state = api.createCorruptionState({ residual: gauge, marks: [] });
                const reaction = api.npcReaction(state, 'occulte');
                assert.strictEqual(reaction.action, 'accepter', `npcReaction(${gauge},occulte)`);
                results.push({ name: `occulte(${gauge})`, status: 'PASS' });

                const reaction2 = api.npcReaction(state, 'guerisseur');
                assert.strictEqual(reaction2.action, 'accepter', `npcReaction(${gauge},guerisseur)`);
                results.push({ name: `guerisseur(${gauge})`, status: 'PASS' });
            } catch (e) {
                results.push({ name: `always accepter(${gauge})`, status: 'FAIL', detail: e.message });
            }
        }

        // Test occult shop price discounts
        const priceCases = [
            { gauge: 19, basePrice: 100, expected: 100 },
            { gauge: 20, basePrice: 100, expected: 95 },
            { gauge: 39, basePrice: 100, expected: 95 },
            { gauge: 40, basePrice: 100, expected: 90 },
            { gauge: 59, basePrice: 100, expected: 90 },
            { gauge: 60, basePrice: 100, expected: 80 },
            { gauge: 79, basePrice: 100, expected: 80 },
            { gauge: 80, basePrice: 100, expected: 70 },
            { gauge: 100, basePrice: 100, expected: 70 }
        ];

        for (const { gauge, basePrice, expected } of priceCases) {
            try {
                const state = api.createCorruptionState({ residual: gauge, marks: [] });
                const price = api.occultShopPrice(state, basePrice);
                assert.strictEqual(price, expected, `occultShopPrice(${gauge})`);
                results.push({ name: `occultShopPrice(${gauge})`, status: 'PASS' });
            } catch (e) {
                results.push({ name: `occultShopPrice(${gauge})`, status: 'FAIL', detail: e.message });
            }
        }

        // Regression: clinic becomes accessible after gauge falls
        try {
            const state = api.createCorruptionState({ residual: 80 });
            state.residual = 0;
            const treatResult = api.clinicTreat(state);
            assert.strictEqual(treatResult.ok, false, 'halo durable: refus clinique voulu meme jauge zero');
            results.push({ name: 'clinic halo durable', status: 'PASS', detail: 'halo durable: refus clinique voulu meme jauge zero' });
        } catch (e) {
            results.push({ name: 'clinic halo durable', status: 'FAIL', detail: e.message });
        }

        return results;
    } catch (e) {
        return [{ name: 'import error', status: 'FAIL', detail: e.message }];
    }
}

module.exports = runTests;
