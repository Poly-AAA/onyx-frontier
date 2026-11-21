(function(root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = { Equipment: factory() };
  else root.Equipment = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  const SLOT_ALIASES = {tete:'head',coiffe:'head',cape:'backpack',torse:'chest',jambes:'legs',mains:'gloves',arme:'weapon'};
  const CANONICAL_SLOTS = ['mount','shadow','body','shoes','legs','chest','belt','gloves','weapon','offhand','backpack','hair','head','slash','effect'];
  const DANGER_KEYS = ['__proto__','constructor','prototype'];

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function isNonEmptyStr(v) { return typeof v === 'string' && v.length > 0; }
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
  function safeStats(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    for (const k of Object.keys(obj)) {
      if (DANGER_KEYS.includes(k)) return false;
      if (!isFiniteNum(obj[k])) return false;
    }
    return true;
  }
  function validateItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (!isNonEmptyStr(item.id) || !isNonEmptyStr(item.name) || !isNonEmptyStr(item.folder)) return false;
    let slot = SLOT_ALIASES[item.slot] || item.slot;
    if (!CANONICAL_SLOTS.includes(slot)) return false;
    if (!safeStats(item.stats)) return false;
    if (item.color !== undefined && !isNonEmptyStr(item.color)) return false;
    return true;
  }
  function canonicalSlot(slot) { return SLOT_ALIASES[slot] || slot; }

  class Equipment {
    constructor(opts = {}) {
      try { this._storage = opts.storage === null ? null : (opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)); } catch (_) { this._storage = null; }
      this._key = opts.key || 'neo-faille-equipment';
      this._backpackInFrontRows = new Set(opts.backpackInFrontRows || []);
      this._weaponAfterShieldRows = new Set(opts.weaponAfterShieldRows || []);
      this._state = {
        version: 1,
        body: {morphology: 'standard', sex: 'feminin'},
        inventory: [],
        equipped: {}
      };
    }

    snapshot() { return deepClone(this._state); }

    addItem(item) {
      if (!validateItem(item)) throw new Error('invalid item');
      const clone = deepClone(item);
      clone.slot = canonicalSlot(clone.slot);
      const allIds = new Set([...this._state.inventory.map(i=>i.id), ...Object.values(this._state.equipped).map(i=>i.id)]);
      if (allIds.has(clone.id)) throw new Error('duplicate id');
      this._state.inventory.push(clone);
    }

    equip(id) {
      const idx = this._state.inventory.findIndex(i => i.id === id);
      if (idx === -1) throw new Error('not in inventory');
      const item = this._state.inventory.splice(idx, 1)[0];
      const old = this._state.equipped[item.slot] || null;
      this._state.equipped[item.slot] = item;
      if (old) this._state.inventory.push(old);
    }

    unequip(slot) {
      slot = canonicalSlot(slot);
      if (!CANONICAL_SLOTS.includes(slot)) return;
      const item = this._state.equipped[slot];
      if (!item) return;
      delete this._state.equipped[slot];
      this._state.inventory.push(item);
    }

    setBody({morphology, sex}) {
      if (!isNonEmptyStr(morphology) || !isNonEmptyStr(sex)) throw new Error('invalid body');
      this._state.body = {morphology, sex};
    }

    getStats() {
      const sum = Object.create(null);
      for (const item of Object.values(this._state.equipped)) {
        for (const [k, v] of Object.entries(item.stats)) {
          if (!isFiniteNum(v)) continue;
          const nv = (sum[k] || 0) + v;
          if (!isFinite(nv)) throw new Error('stat overflow');
          sum[k] = nv;
        }
      }
      return sum;
    }

    getLayers(row) {
      row = ((row % 8) + 8) % 8;
      const order = ['mount','shadow','capeBehind','body','shoes','legs','chest','belt','gloves','hands','capeFront','hair','head','slash','effect'];
      const res = [];
      const equipped = this._state.equipped;
      const bodyPlaceholder = {id:'body', name:'Body', folder:'body', slot:'body', stats:{}, color:null};
      for (const layer of order) {
        let items = [];
        if (layer === 'capeBehind') {
          if (equipped.backpack && !this._backpackInFrontRows.has(row)) items.push(equipped.backpack);
        } else if (layer === 'capeFront') {
          if (equipped.backpack && this._backpackInFrontRows.has(row)) items.push(equipped.backpack);
        } else if (layer === 'hands') {
          const w = equipped.weapon, o = equipped.offhand;
          if (this._weaponAfterShieldRows.has(row)) { if (o) items.push(o); if (w) items.push(w); }
          else { if (w) items.push(w); if (o) items.push(o); }
        } else if (layer === 'body') {
          items.push(equipped.body || bodyPlaceholder);
        } else if (equipped[layer]) {
          items.push(equipped[layer]);
        }
        for (const it of items) res.push({slot: it.slot, item: deepClone(it), folder: it.folder});
      }
      return res;
    }

    _validateSchema(state) {
      if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
      if (state.version !== 1) return false;
      if (!state.body || !isNonEmptyStr(state.body.morphology) || !isNonEmptyStr(state.body.sex)) return false;
      if (!Array.isArray(state.inventory)) return false;
      if (!state.equipped || typeof state.equipped !== 'object' || Array.isArray(state.equipped)) return false;
      if (Object.keys(state.equipped).some(slot => !CANONICAL_SLOTS.includes(slot))) return false;
      const allIds = new Set();
      for (const item of state.inventory) {
        if (!validateItem(item)) return false;
        if (allIds.has(item.id)) return false;
        allIds.add(item.id);
      }
      for (const slot of CANONICAL_SLOTS) {
        const item = state.equipped[slot];
        if (item === undefined) continue;
        if (!validateItem(item)) return false;
        if (item.slot !== slot) return false;
        if (allIds.has(item.id)) return false;
        allIds.add(item.id);
      }
      return true;
    }

    save() {
      if (!this._storage) return {ok:false, error:'storage unavailable'};
      const snap = this.snapshot();
      if (!this._validateSchema(snap)) return {ok:false, error:'invalid state'};
      try {
        const existing = this._storage.getItem(this._key);
        if (existing) {
          let parsed;
          try { parsed = JSON.parse(existing); } catch { return {ok:false, error:'corrupt existing'}; }
          if (!this._validateSchema(parsed)) return {ok:false, error:'corrupt existing'};
        }
        this._storage.setItem(this._key, JSON.stringify(snap));
        return {ok:true};
      } catch (e) { return {ok:false, error:e.message}; }
    }

    load() {
      if (!this._storage) return {ok:false, error:'storage unavailable'};
      try {
        const raw = this._storage.getItem(this._key);
        if (!raw) return {ok:false, error:'empty'};
        const parsed = JSON.parse(raw);
        if (!this._validateSchema(parsed)) return {ok:false, error:'invalid schema'};
        this._state = parsed;
        return {ok:true};
      } catch (e) { return {ok:false, error:e.message}; }
    }
  }

  return Equipment;
});
