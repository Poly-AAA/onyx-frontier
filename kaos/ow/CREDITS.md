# CREDITS — Néo-Faille open world (kaos/ow)

## Moteur (bundlé en local)
| Auteur | Projet | Lien | Licence | Fichiers |
|---|---|---|---|---|
| mrdoob & contributeurs three.js | three.js r187 (WebGPURenderer, TSL, GLTFLoader, MeshoptDecoder) | https://github.com/mrdoob/three.js | MIT | `dist/ow.js`, `dist/chunk-*.js` |
| Dimforge | Rapier 3D compat 0.21 | https://github.com/dimforge/rapier.js | Apache-2.0 | `dist/ow.js`, `assets/rapier.wasm` |

## Personnages (utilisés en jeu)
| Auteur | Pack | Lien | Licence | Fichiers runtime |
|---|---|---|---|---|
| CSAF — Core Systems Asset Factory | PSX Characters Sampler (nb_patrol, 45 clips + T-pose, squelette Quaternius CC0) | https://csaf.itch.io/psx-characters-sampler | Usage jeu com/non-com, pas d'attribution obligatoire, pas de redistrib en pack. IA. Clips CC0 Quaternius. | `assets/chars/csaf-patrol.glb` |
| Sh4rkDev | Free PSX Townsfolk & Zombie (échantillon) — OfficeWorker, Nurse | https://sh4rkdev.itch.io/everyday-npcs-free-sample | Jeu com/non-com OK. Pas de redistrib ni entraînement IA. Attribution appréciée. | `assets/chars/sh4rk-office.glb`, `sh4rk-nurse.glb` |
| LowPoly Lanka | FREE PSX Villagers — TukTukDriver | https://lowpolylanka.itch.io/psx-villagers-free | Jeu com/non-com OK. Crédit « LowPoly Lanka » apprécié. Pas de redistrib ni IA. | `assets/chars/lanka-driver.glb` |
| **Vinrax** | PSX Cop, Casual Male, Secretary | https://vinrax.itch.io/psx-cop-character · https://vinrax.itch.io/psx-casual-male-character · https://vinrax.itch.io/psx-secretary-character | « feel free to use in your projects, just credit me » — **crédit obligatoire : Vinrax** (aussi à l'écran Crédits) | `assets/chars/vinrax-cop.glb`, `vinrax-casual.glb`, `vinrax-secretary.glb` (GLB convertis sans retouche, originaux FBX conservés hors runtime) |

## Décors et véhicules (utilisés en jeu)
| Auteur | Pack | Lien | Licence | Fichiers runtime |
|---|---|---|---|---|
| valsekamerplant | PSX style urban stacked pack — cône, poubelle, benne, sac, gaine | https://valsekamerplant.itch.io/psx-style-urban-stacked-pack | CC0 | `assets/props/prop-cone.glb`, `prop-trashcan.glb`, `prop-dumpster.glb`, `prop-trashbag.glb`, `prop-duct.glb` |
| **godgoldfear** | PSX Industrial Environment Asset Pack | https://godgoldfear.itch.io/psx-industrial-environment-asset-pack | **CC-BY 4.0** — crédit obligatoire (aussi à l'écran Crédits) | `assets/props/prop-industrial.glb` |
| Elegant Crow | Retro PSX Nature Pack — arbre, buisson | https://elegantcrow.itch.io/retro-psx-nature-pack | CC0 (crédit apprécié) | `assets/props/prop-tree.glb`, `prop-bush.glb` |
| reodesuxz | Low Poly Vehicles Pack — taxi, police, moto | https://reodesuxz.itch.io/low-poly-vehicles-pack | Gratuit com/non-com, attribution non requise, pas de redistrib | `assets/vehicles/veh-taxi.glb`, `veh-police.glb`, `veh-motorbike.glb` |
| MBDesigns | Hover Car — Retro Low Poly PSX Style | https://mbdesigns.itch.io/hover-car-retro-low-poly-psx-style | CC0 | `assets/vehicles/veh-hover.glb` |

Les GLB runtime sont compressés (meshopt, textures ≤ 128 px). Les fichiers d'origine non utilisés en jeu (Blend, FBX sources, packs trop lourds) sont dans `/workspace/game/kaos/_unused_assets/`.

## Non utilisés en V1 (licence / format / budget)
| Auteur | Pack | Raison |
|---|---|---|
| Imersa Studios | Small Town Buildings — Free Edition | Le zip gratuit ne contient qu'un `.blend` (pas de GLB/FBX). Original dans `_unused_assets/imersa/`. |
| Benceaki, KAG3D, TheReal MikeRoe | packs cités au brief | Payants, abandonnés. |
| Vinrax — Skeleton | PSX Skeleton Character | Écarté (vérification d'âge 18+). |
| CSAF sampler (zip complet), Elbolilloduro Characters PSX | — | Trop lourds pour le budget ; un perso CSAF suffit comme base joueur. |
