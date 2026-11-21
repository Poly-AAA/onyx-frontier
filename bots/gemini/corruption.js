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
    const CLINIC_REFUSAL_THRESHOLD = 50;

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
        veines_violettes: { id: 'veines_violettes', label: 'Veines violettes', zone: 'bras', color: '#8A2BE2', opacity: 0.8 },
        oeil_fissure: { id: 'oeil_fissure', label: 'Œil fissuré', zone: 'visage', color: '#9932CC', opacity: 0.9 },
        peau_glitch: { id: 'peau_glitch', label: 'Peau glitch', zone: 'peau', color: '#BA55D3', opacity: 0.7 },
        halo_faille: { id: 'halo_faille', label: 'Halo de faille', zone: 'aura', color: '#FF00FF', opacity: 0.85 }
    };

    // Correspondance indices de paliers >= 'effleure' et marques associées
    const TIER_MARK_MAP = [
        null,
        'veines_violettes',
        'oeil_fissure',
        'peau_glitch',
        'halo_faille'
    ];

    /**
     * Limite une valeur entre un min et un max.
     */
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
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
     * Calcule la réaction d'un PNJ selon le type et le niveau de corruption.
     */
    function npcReaction(state, npcType) {
        const tierIdx = getTierIndex(getGauge(state));
        const hasHalo = state.marks.includes('halo_faille');
        const gauge = getGauge(state);
        const tier = getTier(state);

        let action = 'ignorer';

        switch (npcType) {
            case 'civil':
                if (tierIdx === 0) {
                    action = 'ignorer';
                } else if (tierIdx === 1 || tierIdx === 2) {
                    action = 'commenter';
                } else {
                    action = 'fuir';
                }
                break;
            case 'garde':
                if (tierIdx >= 2) { // >= marque
                    action = 'mefiance';
                } else {
                    action = 'ignorer';
                }
                break;
            case 'clinique':
                if (gauge >= CLINIC_REFUSAL_THRESHOLD || hasHalo) {
                    action = 'refuser';
                } else {
                    action = 'accepter';
                }
                break;
            case 'guerisseur':
            case 'occulte':
                action = 'accepter';
                break;
            case 'marchand':
            default:
                action = tierIdx >= 2 ? 'mefiance' : 'accepter';
                break;
        }

        return { action, tierId: tier.id };
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
            marks: [...state.marks]
        };
    }

    return {
        OUTLINE,
        CLINIC_REFUSAL_THRESHOLD,
        createCorruptionState,
        equip,
        unequip,
        getGauge,
        getTier,
        tick,
        getAvatarMarks,
        npcReaction,
        clinicTreat,
        healerPurge,
        occultShopPrice,
        on,
        serialize
    };
}));
