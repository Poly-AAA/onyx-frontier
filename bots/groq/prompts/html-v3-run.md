CONTEXT: offline demo page for an AI adapter. A.playTurn(G, ent, opts) returns {actions:[{action, stepType, brain, legal:{ok,reason}, result:{ok, effects:[{id, spellId, kind:'damage'|'heal'|'shield', amount, absorbed, killed}]}}], unsupported:[...]}; action = {type:'move', path:[{c,r}...], to:{c,r}} | {type:'cast', spellId, target:{c,r}}.
FIX IN THIS REGION (runAll), bugs found by review:
1. Each recorded entry must also keep `path: a.path || null` and `from: {c, r}` = boss position BEFORE that action (track it: start from per.bossStart, update after each move with a.to), and `effects` must be the ARRAY `(act.result && act.result.effects) || []` (currently stores the whole result object).
2. After the 3 turns store `per.finalUnits` = [G.player, ...G.roster] mapped to {id: u.id || u.name, name: u.name, side: u === G.player ? 'a' : (u.side || 'b'), c, r, pv, pvMax, alive}. Keep finalBoss/heroPv/allyPv.
Keep everything else identical.
