/**
 * corruption.js - Module de gestion de la corruption pour Neo-Faille
 * Wrapper UMD (Navigateur window.Corruption & Node module.exports)
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Corruption = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Constantes globales du module
    const OUTLINE = '#1C154D';
    const CLINIC_REFUSAL_THRESHOLD = 60;

    // Paliers de corruption
    const TIERS = [
        { id: 'sain', label: 'Sain', min: 0 },
        { id: 'effleure', label: 'Effleuré', min: 20 },
        { id: 'marque', label: 'Marqué', min: 40 },
        { id: 'ronge', label: 'Rongé', min: 60 },
        { id: 'perdu', label: 'Au bord de la Faille', min: 80 }
    ];

    // Données des marques corporelles (Palette violet/magenta/ambre stricte, zéro bleu)
    const MARK_DATA = {
        veines_violettes: { id: 'veines_violettes', label: 'Veines violettes', zone: 'bras', color: '#8B008B', opacity: 0.8 },
        oeil_fissure: { id: 'oeil_fissure', label: 'Œil fissuré', zone: 'visage', color: '#9932CC', opacity: 0.9 },
        peau_glitch: { id: 'peau_glitch', label: 'Peau glitch', zone: 'peau', color: '#C71585', opacity: 0.7 },
        halo_faille: { id: 'halo_faille', label: 'Halo de faille', zone: 'aura', color: '#FF8C00', opacity: 0.85 }
    };

    // Rectangles des zones corporelles pour spritesheet 128x128
    const BODY_ZONES_128 = {
        tete: { x: 48, y: 16, w: 32, h: 32 },
        torse: { x: 40, y: 48, w: 48, h: 40 },
        bras: { x: 24, y: 48, w: 80, h: 40 },
        jambes: { x: 32, y: 88, w: 64, h: 36 }
    };

    // Configuration des overlays de marques pour rendu 128px
    const MARK_OVERLAY_CONFIG = {
        veines_violettes: { bodyZone: 'bras', pattern: 'veines' },
        oeil_fissure: { bodyZone: 'tete', pattern: 'fissure' },
        peau_glitch: { bodyZone: 'torse', pattern: 'glitch' },
        halo_faille: { bodyZone: 'jambes', pattern: 'halo' }
    };

    // Correspondance indices de paliers >= 'effleure' et marques associées
    const TIER_MARK_MAP = [
        null,
        'veines_violettes',
        'oeil_fissure',
        'peau_glitch',
        'halo_faille'
    ];

    // Tables de pondération des réactions des PNJ par type et par palier
    const NPC_REACTION_WEIGHTS = {
        civil: {
            sain: { ignorer: 85, commenter: 15 },
            effleure: { ignorer: 55, commenter: 40, mefiance: 5 },
            marque: { commenter: 50, mefiance: 35, fuir: 15 },
            ronge: { mefiance: 30, fuir: 70 },
            perdu: { fuir: 90, mefiance: 10 }
        },
        garde: {
            sain: { ignorer: 90, commenter: 10 },
            effleure: { ignorer: 60, commenter: 30, mefiance: 10 },
            marque: { mefiance: 70, commenter: 30 },
            ronge: { mefiance: 100 },
            perdu: { mefiance: 100 }
        },
        marchand: {
            sain: { ignorer: 85, commenter: 15 },
            effleure: { ignorer: 55, commenter: 40, mefiance: 5 },
            marque: { commenter: 40, mefiance: 45, fuir: 15 },
            ronge: { mefiance: 60, fuir: 40 },
            perdu: { mefiance: 80, fuir: 20 }
        }
    };

    /**
     * Limite une valeur entre un min et un max.
     */
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    /**
     * Crée un PRNG déterministe (mulberry32) retournant une fonction () -> [0, 1).
     * Si la graine est absente, utilise Math.random.
     */
    function createRng(seed) {
        if (seed === undefined || seed === null) {
            return Math.random;
        }
        let s = Number(seed) || 0;
        return function () {
            s |= 0; s = s + 0x6D2B79F5 | 0;
            let t = Math.imul(s ^ s >>> 15, 1 | s);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    /**
     * Calcule la corruption brute due aux objets équipés.
     */
    function getEquipCorruption(state) {
        if (!state || !state.equipped) return 0;
        return state.equipped.reduce((sum, item) => sum + (Number(item.corruption) || 0), 0);
    }

    /**
     * Retourne la jauge totale de corruption [0, 100].
     */
    function getGauge(state) {
        const equip = getEquipCorruption(state);
        return clamp(equip + (state.residual || 0), 0, 100);
    }

    /**
     * Retourne l'indice du palier actuel selon la jauge.
     */
    function getTierIndex(gauge) {
        for (let i = TIERS.length - 1; i >= 0; i--) {
            if (gauge >= TIERS[i].min) {
                return i;
            }
        }
        return 0;
    }

    /**
     * Retourne l'objet palier actuel {id, label, min}.
     */
    function getTier(state) {
        const gauge = getGauge(state);
        return TIERS[getTierIndex(gauge)];
    }

    /**
     * Émet un événement vers les écouteurs enregistrés.
     */
    function emit(state, event, data) {
        if (state && state.listeners && state.listeners[event]) {
            state.listeners[event].forEach(cb => {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`Erreur dans l'écouteur d'événement [${event}]:`, err);
                }
            });
        }
    }

    /**
     * Vérifie les changements de jauge, de palier et l'obtention de nouvelles marques.
     */
    function evaluateThresholds(state, oldGauge, oldTierId) {
        const newGauge = getGauge(state);
        const newTier = getTier(state);

        // Événement changement de jauge
        if (newGauge !== oldGauge) {
            emit(state, 'gaugeChange', { oldGauge, newGauge });
        }

        // Événement changement de palier
        if (newTier.id !== oldTierId) {
            emit(state, 'tierChange', { oldTierId, newTierId: newTier.id });
        }

        // Vérification des marques à débloquer pour la première fois (palier >= 'effleure' -> index >= 1)
        const currentTierIdx = getTierIndex(newGauge);
        for (let i = 1; i <= currentTierIdx; i++) {
            const markId = TIER_MARK_MAP[i];
            if (markId && !state.marks.includes(markId)) {
                state.marks.push(markId);
                emit(state, 'markGained', { markId });
            }
        }
    }

    /**
     * Crée ou restaure l'état de corruption.
     */
    function createCorruptionState(saved) {
        const state = {
            equipped: [],
            residual: 0,
            marks: [],
            npcMood: {},
            lastLines: {},
            listeners: {
                tierChange: [],
                markGained: [],
                gaugeChange: []
            }
        };

        if (saved) {
            if (Array.isArray(saved.equipped)) {
                state.equipped = saved.equipped.map(item => ({ ...item }));
            }
            if (typeof saved.residual === 'number') {
                state.residual = Math.max(0, saved.residual);
            }
            if (Array.isArray(saved.marks)) {
                state.marks = [...saved.marks];
            }
            if (saved.npcMood && typeof saved.npcMood === 'object') {
                state.npcMood = { ...saved.npcMood };
            }
            if (saved.lastLines && typeof saved.lastLines === 'object') {
                state.lastLines = { ...saved.lastLines };
            }
        }

        // S'assure que les marques correspondent au niveau actuel en cas de chargement
        const gauge = getGauge(state);
        const tierIdx = getTierIndex(gauge);
        for (let i = 1; i <= tierIdx; i++) {
            const markId = TIER_MARK_MAP[i];
            if (markId && !state.marks.includes(markId)) {
                state.marks.push(markId);
            }
        }

        return state;
    }

    /**
     * Équipe un objet étrange (item = {id, name, corruption: Number 0-40}).
     */
    function equip(state, item) {
        if (!item || !item.id) return;
        const oldGauge = getGauge(state);
        const oldTier = getTier(state);

        // Remplace l'objet s'il est déjà équipé, sinon l'ajoute
        state.equipped = state.equipped.filter(i => i.id !== item.id);
        state.equipped.push({
            id: item.id,
            name: item.name || 'Objet inconnu',
            corruption: clamp(Number(item.corruption) || 0, 0, 40)
        });

        evaluateThresholds(state, oldGauge, oldTier.id);
    }

    /**
     * Déséquipe un objet par son ID.
     */
    function unequip(state, itemId) {
        const oldGauge = getGauge(state);
        const oldTier = getTier(state);

        state.equipped = state.equipped.filter(i => i.id !== itemId);

        evaluateThresholds(state, oldGauge, oldTier.id);
    }

    /**
     * Fait progresser le temps (chaque minute portée au palier >= 'marque' ajoute 0.05 de résiduel).
     */
    function tick(state, minutesWorn) {
        if (!minutesWorn || minutesWorn <= 0) return;
        const tierIdx = getTierIndex(getGauge(state));

        // Palier >= 'marque' (index 2) avec objets équipés
        if (state.equipped.length > 0 && tierIdx >= 2) {
            const oldGauge = getGauge(state);
            const oldTier = getTier(state);

            state.residual += minutesWorn * 0.05;

            evaluateThresholds(state, oldGauge, oldTier.id);
        }
    }

    /**
     * Retourne la liste des marques corporelles actives pour l'avatar.
     */
    function getAvatarMarks(state) {
        if (!state || !state.marks) return [];
        return state.marks.map(id => MARK_DATA[id]).filter(Boolean);
    }

    /**
     * Retourne les descripteurs d'overlay pour peindre les marques sur des spritesheets pixel 128px.
     */
    function getMarkOverlays(state) {
        if (!state || !state.marks) return [];
        return state.marks.map(id => {
            const data = MARK_DATA[id];
            const config = MARK_OVERLAY_CONFIG[id];
            if (!data || !config) return null;
            return {
                id: data.id,
                label: data.label,
                bodyZone: config.bodyZone,
                color: data.color,
                opacity: data.opacity,
                outline: OUTLINE,
                pattern: config.pattern
            };
        }).filter(Boolean);
    }

    /**
     * Ajuste l'humeur d'un PNJ (entre -1 et 1).
     */
    function adjustMood(state, npcId, delta) {
        if (!state) return 0;
        if (!state.npcMood) state.npcMood = {};
        const current = state.npcMood[npcId] || 0;
        const updated = clamp(current + (Number(delta) || 0), -1, 1);
        state.npcMood[npcId] = updated;
        return updated;
    }

    /**
     * Effectue un tirage pondéré parmi les poids fournis, modulé par l'humeur et le PRNG.
     */
    function weightedChoice(weights, mood, rng) {
        const getRng = rng || Math.random;
        const adjusted = {};
        let total = 0;

        for (const [action, w] of Object.entries(weights)) {
            let factor = 1.0;
            if (mood !== undefined && mood !== 0) {
                const isPositive = ['ignorer', 'commenter', 'accepter'].includes(action);
                const isNegative = ['mefiance', 'fuir', 'refuser'].includes(action);
                if (isPositive) {
                    factor += 0.3 * mood;
                } else if (isNegative) {
                    factor -= 0.3 * mood;
                }
            }
            const finalW = Math.max(0, w * Math.max(0, factor));
            adjusted[action] = finalW;
            total += finalW;
        }

        if (total <= 0) {
            const actions = Object.keys(weights);
            return { action: actions[0] || 'ignorer', roll: 0 };
        }

        const roll = getRng();
        let target = roll * total;
        let current = 0;
        for (const [action, w] of Object.entries(adjusted)) {
            current += w;
            if (target <= current) {
                return { action, roll };
            }
        }
        const lastAction = Object.keys(weights)[Object.keys(weights).length - 1];
        return { action: lastAction, roll };
    }

    /**
     * Calcule la réaction d'un PNJ selon son type, la corruption, l'humeur et un PRNG optionnel.
     */
    function npcReaction(state, npcType, rngOrId, idOrRng) {
        let rng = undefined;
        let npcId = undefined;

        if (typeof rngOrId === 'function') {
            rng = rngOrId;
            npcId = idOrRng;
        } else if (typeof rngOrId === 'string') {
            npcId = rngOrId;
            rng = typeof idOrRng === 'function' ? idOrRng : undefined;
        } else {
            rng = rngOrId;
            npcId = idOrRng;
        }

        const tier = getTier(state);
        const gauge = getGauge(state);
        const hasHalo = state.marks.includes('halo_faille');

        // Règles dures non aléatoires
        if (npcType === 'clinique') {
            const action = (gauge >= CLINIC_REFUSAL_THRESHOLD || hasHalo) ? 'refuser' : 'accepter';
            return { action, tierId: tier.id, roll: 0 };
        }
        if (npcType === 'guerisseur' || npcType === 'occulte') {
            return { action: 'accepter', tierId: tier.id, roll: 0 };
        }

        const weightsTable = NPC_REACTION_WEIGHTS[npcType] || NPC_REACTION_WEIGHTS.civil;
        const tierKey = tier.id;
        const weights = weightsTable[tierKey] || { ignorer: 100 };

        const mood = (npcId && state && state.npcMood) ? state.npcMood[npcId] : undefined;
        const result = weightedChoice(weights, mood, rng);

        return {
            action: result.action,
            tierId: tier.id,
            roll: result.roll
        };
    }

    /**
     * Choisit une réplique aléatoire sans répéter la dernière dite par ce PNJ.
     */
    function pickLine(state, npcId, lines, rng) {
        if (!Array.isArray(lines) || lines.length === 0) return '';
        if (lines.length === 1) return lines[0];

        if (!state) state = {};
        if (!state.lastLines) state.lastLines = {};

        const last = state.lastLines[npcId];
        let available = lines.filter(l => l !== last);
        if (available.length === 0) {
            available = lines;
        }

        const getRng = rng || Math.random;
        const index = Math.floor(getRng() * available.length);
        const chosen = available[clamp(index, 0, available.length - 1)];

        state.lastLines[npcId] = chosen;
        return chosen;
    }

    /**
     * Traitement en clinique : réduit le résiduel de 10 (min 0) si accepté.
     */
    function clinicTreat(state) {
        const gauge = getGauge(state);
        const hasHalo = state.marks.includes('halo_faille');

        if (gauge >= CLINIC_REFUSAL_THRESHOLD || hasHalo) {
            return {
                ok: false,
                reason: "Refusé par la clinique : jauge de corruption trop élevée ou présence de halo instable."
            };
        }

        const oldGauge = gauge;
        const oldTier = getTier(state);

        state.residual = Math.max(0, state.residual - 10);

        evaluateThresholds(state, oldGauge, oldTier.id);

        return { ok: true };
    }

    /**
     * Purge par le guérisseur : réduit le résiduel de 25 et retire la marque la plus récente (sauf 'halo_faille').
     */
    function healerPurge(state, cost) {
        const oldGauge = getGauge(state);
        const oldTier = getTier(state);

        state.residual = Math.max(0, state.residual - 25);

        let removedMark = null;
        for (let i = state.marks.length - 1; i >= 0; i--) {
            const mId = state.marks[i];
            if (mId !== 'halo_faille') {
                removedMark = mId;
                state.marks.splice(i, 1);
                break;
            }
        }

        evaluateThresholds(state, oldGauge, oldTier.id);

        return { ok: true, removedMark };
    }

    /**
     * Calcule le prix au marché occulte avec remise selon le palier (0%, 5%, 10%, 20%, 30%).
     */
    function occultShopPrice(state, basePrice) {
        const tierIdx = getTierIndex(getGauge(state));
        const discounts = [0.0, 0.05, 0.10, 0.20, 0.30];
        const discount = discounts[tierIdx] || 0;
        return Math.round(basePrice * (1 - discount));
    }

    /**
     * Enregistre un écouteur d'événements ('tierChange', 'markGained', 'gaugeChange').
     */
    function on(state, event, cb) {
        if (state && state.listeners && state.listeners[event] && typeof cb === 'function') {
            state.listeners[event].push(cb);
        }
    }

    /**
     * Sérialise l'état en objet JSON pur.
     */
    function serialize(state) {
        return {
            equipped: state.equipped.map(item => ({ ...item })),
            residual: state.residual,
            marks: [...state.marks],
            npcMood: state.npcMood ? { ...state.npcMood } : {},
            lastLines: state.lastLines ? { ...state.lastLines } : {}
        };
    }

    return {
        OUTLINE,
        CLINIC_REFUSAL_THRESHOLD,
        BODY_ZONES_128,
        NPC_REACTION_WEIGHTS,
        createRng,
        createCorruptionState,
        equip,
        unequip,
        getGauge,
        getTier,
        tick,
        getAvatarMarks,
        getMarkOverlays,
        npcReaction,
        adjustMood,
        pickLine,
        clinicTreat,
        healerPurge,
        occultShopPrice,
        on,
        serialize
    };
}));
