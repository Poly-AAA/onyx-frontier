module.exports = async function() {
    const assert = require('node:assert/strict');
    const { pathToFileURL } = require('node:url');
    const fs = require('node:fs'), path = require('node:path'), dir = '/workspace/game/bots/groq/src', files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
const versions = files.filter(f => /^brains-adapter\.v(\d+)\.js$/.test(f)).map(f => ({ name: f, version: parseInt(f.match(/\d+/)[0]) })).sort((a, b) => b.version - a.version);
if (versions.length === 0) return [{ name: 'brains-adapter', status: 'SKIP', detail: 'aucune version brains-adapter.vN.js' }];
const target = path.join(dir, versions[0].name);

    let api;
    if (!require('node:fs').existsSync(target)) return [{name:'brains-adapter',status:'SKIP',detail:'module absent'}];
    // Initial check for module absence
    try {
        const loaded = await import(pathToFileURL(target).href);
        api = { ...loaded.default, ...loaded };
        if (!api.playTurn) {
            return [{ name: 'brains-adapter', status: 'SKIP', detail: 'missing playTurn method' }];
        }
    } catch (e) {
        throw e;
    }

    // Load required dependencies
    const d = require('/workspace/game/bots/groq/vendor/dofus-touch-ai.from-v3.4.1.js');
    const g = require('/workspace/game/bots/groq/vendor/combat-grid.from-v3.4.1.js');
    const ai = d.BRAIN_PIPELINES ? d : globalThis.DofusTouchAI;
    const grid = g.tackleCost ? g : globalThis.CombatGrid;

    // Check if CombatGrid is properly loaded
    if (!ai || !grid || typeof grid !== 'object' || !grid.tackleCost) {
        return [{ name: 'brains-adapter', status: 'SKIP', detail: 'invalid CombatGrid' }];
    }

    // Brain types to test
    const brains = ['TACTICAL', 'AGGRESSIVE', 'SUPPORT', 'BLOCKING', 'RUNAWAY', 'LUNATIC'];
    const results = [];

    // Test parameters
    const testParams = [
        { pa: 0, pm: 0 },
        { pa: 1, pm: 1 },
        { pa: 6, pm: 3 }
    ];

    // Position variations
    const positions = [0, 6];

    // Helper function to create test scenario
    const createScenario = (pa, pm, pos) => {
        const enemy = {
            id: 'enemy',
            name: 'enemy',
            c: pos,
            r: pos,
            pv: 100,
            pvMax: 100,
            pa,
            pm,
            paMax: pa,
            pmMax: pm,
            alive: true,
            side: 'b',
            stats: { agi: 5 },
            spells: [1],
            shield: 0,
            invis: 0,
            level: 1
        };

        const player = {
            ...enemy,
            id: 'player',
            name: 'player',
            side: 'a',
            c: 3,
            r: 3
        };

        const ally = {
            ...enemy,
            id: 'ally',
            name: 'ally',
            c: 2,
            r: 2,
            pv: 50
        };

        return {
            player,
            enemy,
            roster: [enemy, ally],
            blocks: new Set()
        };
    };

    // Helper function to validate coordinates
    const validateCoords = (obj, prop) => { const check = p => { assert(Number.isInteger(p.c) && Number.isInteger(p.r)); assert(p.c>=0 && p.c<7 && p.r>=0 && p.r<7); }; if(prop===undefined)check(obj); else if(Array.isArray(obj[prop]))obj[prop].forEach(check); else check(obj[prop]); };

    // Test each brain type
    for (const brain of brains) {
        if (!ai.BRAIN_PIPELINES || !ai.BRAIN_PIPELINES[brain]) {
            results.push({
                name: `brains-adapter-${brain}`,
                status: 'SKIP',
                detail: `brain type ${brain} not found`
            });
            continue;
        }

        for (const {pa, pm} of testParams) {
            for (const pos of positions) {
                try {
                    const G = createScenario(pa, pm, pos); const enemy = G.enemy;

                    const opts = {
                        ai,
                        grid,
                        brain,
                        gridSize: 7,
                        seed: 123,
                        maxSteps: 12,
                        maxEvals: 200,
                        spellById: () => ({
                            id: 1,
                            cost: 2,
                            range: 4,
                            minRange: 1,
                            line: false,
                            los: true,
                            aoe: 0,
                            dmg: [1, 2],
                            element: 'terre'
                        })
                    };

                    const result = await api.playTurn(G, enemy, opts);

                    // Validate return structure
                    assert(Array.isArray(result.actions), `Invalid actions structure for ${brain}`);

                    // Check enemy stats haven't changed unexpectedly
                    assert(Number.isFinite(enemy.pa) && enemy.pa >= 0 && enemy.pa <= pa, `Invalid enemy pa value`);
                    assert(Number.isFinite(enemy.pm) && enemy.pm >= 0 && enemy.pm <= pm, `Invalid enemy pm value`);

                    // Validate each action
                    for (const entry of result.actions) {
                        const action = entry.action;
                        assert(entry.legal === undefined || entry.legal.ok === true, `Illegal action detected: ${JSON.stringify(action)}`);

                        // Validate action structure
                        assert(typeof action === 'object', `Action must be object: ${action}`);

                        // Validate coordinates if present
                        if (action.to) validateCoords(action, 'to');
                        if (action.target) validateCoords(action, 'target');
                        if (action.path) validateCoords(action, 'path');
                    }

                    // Validate all units in roster
                    for (const unit of [G.player, ...G.roster]) {
                        validateCoords(unit);
                        
                    }

                    results.push({
                        name: `brains-adapter-${brain}-${pa}-${pm}-${pos}`,
                        status: 'PASS',
                        detail: `Brain ${brain} executed successfully with ${result.actions.length} actions`
                    });

                } catch (error) {
                    results.push({
                        name: `brains-adapter-${brain}-${pa}-${pm}-${pos}`,
                        status: 'FAIL',
                        detail: `Error executing brain ${brain}: ${error.message}`
                    });
                }
            }
        }
    }

    return results;
};
