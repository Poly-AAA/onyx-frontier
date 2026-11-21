# Neo-Faille — Kaos (version « Kenshi » open world)

Neo-Faille devient un open world isométrique cyberpunk + magie : on démarre par un **combat de ligue**, puis **balade libre** dans Néo-Faille, simulation de vie (métiers PNJ + joueur), PNJ autonomes qui pensent, parlent (LLM), proposent des missions et réagissent. Mobile portrait, jouable hors ligne.

## Lancer
```bash
cd /workspace/game/kaos
npm run build          # esbuild -> dist/kaos.js (seul outil installé, en devDependency locale)
npm start              # http://localhost:8797  — statique + proxy LLM /api/npc (clés lues dans l'env, jamais envoyées au client)
# hors ligne : ouvrir index.html en file:// -> dialogues scriptés automatiques
npm test               # 9 tests Node (ville, cerveau PNJ, missions, LLM borné, baston, métiers, simulation)
python3 tools/shots.py # captures portrait 393x873 -> screenshots/
```
`?new=1` = nouvelle partie (sinon reprise de la sauvegarde localStorage `kaos.save.v1`, avec copie de secours `.bak`).

## Ce qui est repris de Neo-Faille (copié, sources non modifiées)
| Système | Source | Copie |
|---|---|---|
| Stats ADN, éléments, Vie/PV, XP/niveaux, équipement 12 slots + panoplies, sorts (kit + catalogue), soins, gains/butin (`settleFight`) | `creator-pers0na/js/roguelite.js`, `spell-lab.js`, `data/generated-spells.json` (moteur de règles inliné dans la v3.7.9) | `src/core/`, `data/` |
| Carrière : ligues, équipes, arènes, présentateurs, commentaires, entraînements, sponsors/contrats | `v379work/career-data.json` (données de la v3.7.9, telles quelles) | `data/career-data.json` |
| Sprites joueur + PNJ (Fantasy Creator, 8 directions, Idle/Walk) | `creator-pers0na/assets/packs/fantasy-cc` | `assets/chars/` composés + teintés par `tools/compose_sprites.py` |

Non repris : l'UI de combat tactique et l'écran carrière de la v3.7.9 (HTML monolithique de 8,6 Mo) ; seules leurs règles/données sont réutilisées.

## Architecture
- `src/world/city.js` : ville générée par graine (rues, trottoirs, îlots, 10 POI), mobilier urbain ; `path.js` : A*.
- `src/ai/npc-brain.js` : cerveau à **IA utilitaire** : besoins (faim, énergie, social, argent) + routine horaire → but (manger, dormir, travailler, socialiser, approcher le joueur, fuir, affronter, **regarder une baston**) ; perception (joueur, violence, voisins) ; mémoire courte bornée (10 souvenirs, oubli pondéré) ; humeur/opinion.
- `src/ai/dialogue.js` : prompt (persona + besoins + mémoire + mission) → proxy → JSON **validé et borné** (humeur, opinion ±10, intention). Repli scripté offline. `server.mjs` : groq `openai/gpt-oss-20b` → mistral `ministral-8b` → openrouter.
- `src/ai/missions.js` : missions issues des besoins réels des PNJ (livraison, message, règlement) ; le LLM ne fait que les présenter.
- `src/combat/brawl.js` : baston temps réel ; `bridge.js` : pont vers les règles Neo-Faille.
- `src/life/jobs.js` : 8 métiers (salaire, XP de métier, +stat), entraînements et contrats v3.7.9.
- `src/game.js` (simulation, sauvegarde), `src/render/iso.js` (canvas iso), `src/ui.js` (HUD portrait, minicarte, dialogue, panneaux).

## Référence visuelle delinquents.thegame : ce qui est fait
1. **Cercle rouge dynamique** : anneau pointillé centré sur le joueur, qui le suit. Tout ennemi dans le cercle est engagé (pas de ciblage libre) ; coup de base auto + sorts du kit (PA qui remontent) sur le plus proche, ou sur tous les engagés pour un sort de zone. Sortir du cercle 3 s = fuite.
2. **Sumo tanky** : joueur massif (corps NakedBody2, affiché à ×1,25), uniforme sombre à accents dorés. Les membres d'un gang se liguent : Vex rejoint Kross → 2v1 (réglé : 1v1 souvent gagné, 2v1 souvent perdu, voir les tests).
3. **Spectateurs** : but « spectate » dans le cerveau ; les curieux s'attroupent autour du cercle et crient (« Baston ! »), les peureux fuient.
4. **Ville** : cerisiers réels et holo (pétales), bancs, clôtures néon, lampadaires néon, distributeurs, statue holo, trottoirs. Éclairage chaud la nuit, sans glow bleu.
Personnages : sprites Fantasy Creator conservés, simplement teintés.

## État
Testé : `npm test` 9/9 ; parcours Playwright portrait sans erreur console (ligue → victoire → contrat sponsor → balade → dialogue LLM groq → mission acceptée → baston 2v1 avec spectateurs → métier). Mode file:// hors ligne OK (dialogues scriptés).
Captures : `screenshots/01-combat-ligue.png` … `07-metiers.png`.
Limites : seulement Idle/Walk animés (pas d'animations d'attaque en baston) ; une seule ligue et un seul combat de ligue ; pas de véhicules ; équilibrage sommaire ; sur mobile, le LLM demande que `server.mjs` tourne sur une machine joignable.

## Prochaines étapes
1. Animations Attack/TakeDamage/Die (feuilles fantasy-cc) et VFX de sorts v3.7.9 dans la baston.
2. Calendrier de ligue (journées, classement, contrats et presse de `career-data`) relié à la vie quotidienne.
3. Économie et métiers des PNJ (vrais stocks/prix, relations PNJ↔PNJ, factions, réputation par quartier), plus quartiers et véhicules.
