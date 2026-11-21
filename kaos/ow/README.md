# Néo-Faille — open world 3D (V1 light)

Moteur de test : three.js **WebGPURenderer** (repli WebGL2 automatique), **Rapier** en WASM local, relief **Perlin** en morceaux de 500 m (3×3 streamés, carte ≈ 59×59 morceaux pour 870 km², même graine = même monde), sol à texture procédurale, ville verticale dans le morceau central (18 tours, rue aérienne au-dessus des bas-fonds, pont, néons, fumée, chantier, parcelle de fleurs au vent), rendu toon (matériaux toon + contour par coque inversée + postérisation), jour/nuit en 24 min, 2 persos en primitives contrôlables + 2 PNJ scriptés qui marchent. Aucun serveur ni CDN : des fichiers statiques.

## Lancer
```bash
cd /workspace/game/kaos/ow
npm run build      # -> dist/ (JS minifié) + assets/rapier.wasm
npm run serve      # python3 -m http.server 8798 (statique) -> http://localhost:8798
npm test           # morceaux, déterminisme, vitesse PM, sauvegarde
npm run shots      # Playwright 393×873, réseau externe coupé -> screenshots/
```
Commandes : toucher = aller là ; 2 doigts = zoom (pinch) + rotation ; molette = zoom, Maj+molette = rotation ; ZQSD/WASD/flèches ; A/E = tourner ; Tab ou « Perso » = changer de perso. Boutons texte : Caméra ±, Tourner ±, PM ± (vitesse = base × (1 + 0,05 × (PM − 4))), Mode (marcher/détruire : fissure puis chantier), Sauver (`neofaille.v1` + `neofaille.v1.bak`).

## Données (rien en dur)
`data/config.json` (+ `files`, `mods` à importer sans recompiler), `biomes.json`, `city.json`, `npcs.json`, `player.json`, `benceaki.manifest.json` (12 emplacements), `assets.manifest.json` (GLB attendus ; un asset `present` remplace le provisoire), `terrain.json` (morceaux pré-générés prioritaires), `layers.json` + `schemas/` (C3 à C8 : stubs dans `src/layers.js`, non codés).

## Rendu PS1 (config.json → `psx`)
`res` résolution interne (≈ 240×426, upscale nearest), `snap` jitter des sommets (px, 0 = off), `affine` UV sans correction de perspective, `dither` Bayer 4×4, `colorLevels` 31 = RGB555, `fog` (near/far au-delà de la cible caméra), `sky`, `light`, `subdivide` (m par segment). Textures pixel art procédurales 32–128 px (`src/psxtex.js`). Persos : capsules neutres provisoires ; modèles GLB/FBX des packs via `eng.loadModel` + `eng.psxify`.
