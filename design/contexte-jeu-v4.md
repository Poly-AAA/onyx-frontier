# Contexte jeu — v4 « Neo-Faille » (brief final de Jean, 21/11/2026, mis à jour avec ses décisions lore, 3D, assets et relief)

Marqueurs : **[DÉCIDÉ]** validé par Jean · **[REPRIS v3]** identique à `contexte-jeu-v3.md` / v2 (font foi pour les chiffres) · **[PROPOSITION]** à valider · **[À CONFIRMER]** conflit ou point ouvert · **[?]** non vérifié.
v1–v3 restent intacts. Kaos code dans `/workspace/game/kaos/`, Archy supervise.

## 1. Pitch & lore [DÉCIDÉ]
- **Un seul jeu, en monde ouvert** façon Kenshi. Le tactique de la v3.7.9 est mis de côté.
- Lore : **futur surpeuplé, PAS d'apocalypse** : une mégalopole verticale (Mega-City : tours, ponts, bas-fonds) et sa campagne (désert façon Mad Max, montagne, forêt).
- Ambiance : cyberpunk + magie Dofus, fleurs animées au vent.
- **[DÉCIDÉ] Créatures apocalyptiques validées.** Le lore s'élargit : magiciens, assassins, créatures stylées… tout est permis si chaque élément a une histoire cohérente avec le monde. Le monde, lui, n'a pas connu d'apocalypse : les créatures ont des origines locales (Faille magique, labos, mutations, cultes), pas une fin du monde.

### Règle de lore [DÉCIDÉ]
Chaque faction, créature, PNJ clé ou objet notable a une **fiche lore** de 3 lignes :
1. **Origine** : d'où il vient (Faille magique, labo corpo, culte, mutation du désert, années 90 survivantes, magie Dofus…).
2. **Lieu** : où il vit dans le monde (quartier de Mega-City, bas-fonds, désert, montagne, forêt).
3. **Rôle** : ce qu'il fait dans l'économie et les combats (métier, menace, marchand, mentor, cible de prime), et son élément (Terre/Feu/Eau/Air/Vie).

Garde-fous de cohérence :
- Rien n'existe sans lieu ni rôle dans l'économie façon Red Dead.
- L'élément d'une créature découle de son origine (ex. une créature de la Faille de feu est de type Feu).
- La technologie et la magie cohabitent ; on évite le « post-apo » : la ville tourne, surpeuplée.
- Une nouveauté ne contredit jamais une fiche existante : on l'étend ou on la remplace explicitement dans le doc.

**Origines multiples [DÉCIDÉ]** : la **Faille principale** (au cœur de Mega-City) et des **failles secondaires locales** (désert, montagne, forêt, bas-fonds). Chaque créature et chaque école de magie a son origine documentée.

Fiche type d'une **école de magie** : nom · faille d'origine · élément(s) · lieu d'enseignement · qui la pratique (faction, métier) · coût social (réputation, police) · sorts emblématiques (catalogue existant) · lien avec une autre école (rivalité, alliance).
Fiche type d'une **créature** : nom · faille ou cause d'origine (mutation, labo, culte) · élément · biome et lieu · comportement (passive, territoriale, chasseuse, invocable) · rôle dans l'économie (butin, prime, monture, ingrédient de craft) · danger (niveau conseillé) · asset 3D utilisé.
- Le ton peut rester décalé (2K, humour à la Chappelle), mais l'origine doit être sérieuse.
- Philosophie Game Boy : destruction par **échange de texture**, **images de chantier** comme bouche-trous assumés, **post-traitement toon** sur éclairage physique.

## 2. Repris de v3 sans changement [REPRIS v3]
Stats sur 300 points, création au d8 · niveau 50, PVmax = 50 + 5×(niv−1) + (Vit−5) · éléments Terre/Feu/Eau/Air/Vie et leurs 3 rôles · XP de sort par lancer pondérée ×0,5–×2 · paliers d'animation en Fibonacci · plafond de bonus +100 %, critique ×1,5 à part · carrière et ligues · contrats, barre d'intérêt, ADN d'équipe · mort « Héritier » **partout, rue comprise** · butin, boutiques en ligne, dark web · régénération 10 %/min, potions, potion de fuite, soignants · machine à sous 3 lancers/jour · 1 jour = 24 min réelles, match lancé quand on veut · toucher pour bouger, glisser pour esquiver · 18 métiers.

## 3. Combat temps réel « Delinquents » [DÉCIDÉ]
| Élément | Règle |
|---|---|
| Tour | 1 tour Dofus = 15 s |
| PA | Barre d'énergie qui se remplit en 15 s ; le coût des sorts reste en PA |
| PM | Esquives : 1 charge par 2 PM (⌈PM/2⌉) · vitesse de marche × (1 + 0,05×(PM−4)) : −10 % à PM 2, +20 % à PM 8, PM 4 = vitesse v3.4.1 |
| PO | Portée en mètres réels (1 case = 1,5 m) |
| Combos | Fenêtre de 1,5 s |
| Cercle | Rayon = (portée max des combattants + 3 m) × 1 (1v1) / 1,3 (3v3) / 1,6 (5v5), borné entre 5 et 16 m, réduit à l'espace libre de la carte |
| Spectateurs | Repoussent dans le cercle avec des dégâts ; bulles de commentaire façon 2K / Chappelle |
| Grille | Visuelle seulement, plus un système |
| Repris | Érosion 10 %, dos +10 % (cône de 135°), ligne de vue −10 %, IA qui recule sous 30 %, double attaque, PV ×4 / dégâts ×0,75 |

## 4. Monde [DÉCIDÉ ; technique PROPOSITION]
- **870 km² de référence** (≈ 29,5 km de côté), découpés en **morceaux de 500 m** chargés à la volée (≈ 59×59 morceaux adressables). Seuls les 3×3 autour du joueur sont chargés.
- Relief **[DÉCIDÉ]** : **Heightmap Level Generator** (m-w-marker, MIT, WebGPU dans le navigateur, export glTF pour three.js).
  - **Hors jeu (pré-généré)** : morceaux de 500 m générés dans l'outil avec des graines fixes, exportés en glTF dans `assets/terrain/`. Seule la zone de départ est livrée en V1 : 3×3 morceaux, dont celui de la ville.
  - **En jeu (repli par graine)** : les ≈ 3 481 morceaux restants sont générés au chargement par un bruit procédural avec la même graine et des paramètres proches. Un morceau pré-généré, s'il existe, a toujours priorité.
  - Bords raccordés entre morceaux (bordures partagées). [?] La capacité de l'outil à exporter des tuiles raccordées reste à vérifier au premier essai.
- Rendu [PROPOSITION] : three.js avec WebGPU et **repli WebGL2 automatique** (le support WebGPU sur Android n'est pas garanti).
- Biomes : désert, montagne, forêt ; Mega-City à plusieurs niveaux (rue, ponts, bas-fonds).

## 5. Personnages, PNJ, IA [DÉCIDÉ]
- **Jeu 100 % 3D PSX : aucun sprite 2D nulle part** (joueur, PNJ, créatures, véhicules). Les sprites 2D Fantasy Creator et l'équipement en pixel **ne sont plus utilisés en jeu**. Leurs données (stats, règles, noms, sorts) restent recyclées.
- **Jouable** : persos **PSX modulaires Benceaki** (3 corps + 21 fringues).
- **PNJ** : packs itch.io déjà faits (KAG3D, Vinrax, MikeRoe), **non modifiés**, en 3 classes :
  1. bots inertes (figurants) ;
  2. métiers scriptés (routine, travail) ;
  3. PNJ clés avec **IA mémoire**.
- IA des PNJ clés : bio courte, **mémoire récursive** (résumés de résumés), contexte (position, météo, événements), **score d'importance** des souvenirs, journaux.
- **Psychologie** liée aux vêtements et au statut : la tenue du joueur change l'accueil, la peur et les prix.
- Véhicules : packs reodesuxz + motos + **véhicules volants**.

## 6. Craft, métiers, économie [DÉCIDÉ]
- Craft adapté de Cataclysm : **implants**, **mods**, atelier libre, **invention** ; progression du bricolage jusqu'aux **robots**.
- **Métiers RP prioritaires**, chacun avec un **arc narratif** ; les 18 métiers de v3 sont gardés.
- **Économie façon Red Dead** : chaque action laisse une trace (témoins, réputation par quartier, primes, prix qui bougent).
- **Téléphone façon GTA : en V2.**

## 6 bis. Assets 3D [DÉCIDÉ]
Aucun pack n'est encore téléchargé : les téléchargements itch.io peuvent demander une étape manuelle (Jean ou une session navigateur). Les licences sont celles indiquées par Jean ; **à vérifier sur chaque page au téléchargement** et à recopier dans `CREDITS.md` (obligatoire : auteur, pack, lien, licence, fichiers utilisés).

| Pack | Lien | Contenu | Formats | Licence / crédit | Usage |
|---|---|---|---|---|---|
| Benceaki — PSX Halloween Characters | https://benceaki.itch.io/psx-halloween-characters | 3 corps partagés + 21 fringues, squelette Mixamo, manifeste JSON | FBX/GLB | à vérifier ; crédit | **Jouable** (corps + équipement visible) |
| KAG3D — Civilian Pack vol.1 | https://kag3d.itch.io/low-poly-psx-style-civilian-pack-vol1 | 4 civils riggés et animés (2 H, 2 F) | GLB/FBX | à vérifier ; crédit | PNJ métiers scriptés, bots |
| KAG3D — collection PSX | https://itch.io/c/5620625/psx-assets-lowpoly | décors et props PSX | variable | par pack | Ville, mobilier |
| Vinrax — Flic | https://vinrax.itch.io/psx-cop-character | 1 perso | FBX/GLB | gratuit, **crédit requis** | Police |
| Vinrax — Squelette | https://vinrax.itch.io/psx-skeleton-character | 1 perso | FBX/GLB | gratuit, **crédit requis** | Créatures, nécromancie |
| Vinrax — Civil homme | https://vinrax.itch.io/psx-casual-male-character | 1 perso | FBX/GLB | gratuit, **crédit requis** | PNJ |
| Vinrax — Secrétaire | https://vinrax.itch.io/psx-secretary-character | 1 perso | FBX/GLB | gratuit, **crédit requis** | PNJ corpo |
| TheReal MikeRoe — 11 persos | https://itch.io/event/30837495 | 11 persos | à vérifier | à vérifier | PNJ clés, assassins, magiciens |
| reodesuxz — Low Poly Vehicles | https://reodesuxz.itch.io/low-poly-vehicles-pack | 26 véhicules dont motos et bateaux | FBX/GLB/OBJ | gratuit ; crédit | Véhicules (V3+) |
| m-w-marker — Heightmap Level Generator | https://m-w-marker.github.io/heightmap-level-generator/ · https://github.com/m-w-marker/heightmap-level-generator | générateur de relief | glTF | MIT | Relief (§4) |
Les PNJ itch.io sont utilisés **non modifiés**. Format runtime : GLB (Draco ou meshopt si la licence le permet), textures ≤ 256 px (style PSX).

### Correspondance 12 emplacements ↔ fringues Benceaki [DÉCIDÉ]
| Emplacement (stats v3.7.9) | Catégorie Benceaki | Règle |
|---|---|---|
| Coiffe | tête | 1 pièce (chapeau, masque, capuche) |
| Cape | cape | 1 pièce, cache le dos selon le manifeste |
| Torse | torse | 1 pièce ; une pièce intégrale (combinaison) prend aussi Jambes |
| Ceinture | accessoires (taille) | pièce visible si elle existe, sinon stats seules |
| Gants | mains | 1 pièce |
| Jambes | jambes | 1 pièce |
| Bottes | pieds | 1 pièce |
| Amulette | accessoires (cou) | petite pièce ou stats seules |
| Anneau G / Anneau D | accessoires (mains) | stats seules (trop petit pour le PSX) |
| Arme / Bouclier | — (hors Benceaki) | props 3D attachés aux os de la main (packs KAG3D ou props simples) |
- Plusieurs des 21 pièces peuvent viser le même emplacement selon le corps choisi. Le **manifeste JSON Benceaki** (parties du corps cachées par chaque pièce) sert à masquer le corps et à résoudre les conflits.
- Les noms exacts des 21 pièces seront relevés dans le manifeste au téléchargement (non inventés ici).

## 7. Changements vs v3 (conflits signalés)
| # | v3 disait | v4 dit | Conséquence |
|---|---|---|---|
| 1 | Sprites 2D pixel (Fantasy Creator), 12 emplacements d'équipement visibles | **[DÉCIDÉ] 100 % 3D PSX, aucun sprite 2D** (joueur, PNJ, créatures) | Les 7,3 Mo de sprites de la v3.7.9 et les panoplies 2D sont abandonnés **en jeu** ; leurs données sont gardées. Il faut faire correspondre 12 emplacements et 21 fringues. Les packs 3D ne sont **pas sur la machine**. |
| 2 | Rendu canvas iso 2D | 3D WebGPU, relief, morceaux de 500 m | Moteur de rendu de Kaos (`iso.js`) à remplacer |
| 3 | 1 quartier | 870 km² en morceaux, biomes, ville verticale | Mise à l'échelle des données (POI, PNJ) |
| 4 | Plan v4.0 : combat de ligue + 3 métiers | **V1 light** : moteur + relief + ville basique + 2 persos qui marchent, sans combat | Le combat passe en V2 |
| 5 | Fichier ≤ 3 Mo | Petit dossier hors-ligne (§9) | Budget revu à cause de la 3D |
| 6 | — | Hors-ligne, **zéro serveur** | Le proxy LLM de Kaos (`server.mjs`) est exclu de la V1 ; IA mémoire locale et scriptée |
| 7 | Cercle × 1 / 1,3 / 1,6 selon le format | Brief : portée max + 3 m (5–16 m) | **[DÉCIDÉ]** Facteur gardé : ×1,3 en 3v3, ×1,6 en 5v5 |
| 8 | Pas d'apocalypse | **[DÉCIDÉ]** Créatures apocalyptiques validées, lore élargi | Résolu par la Règle de lore (§1) : créatures d'origine locale, monde non apocalyptique |

## 8. État Kaos (`/workspace/game/kaos/`, lu le 21/11)
**Existe** : esbuild → `dist/kaos.js` (360 Ko) ; canvas iso 2D ; ville générée par graine (10 POI, A*) ; **combat de ligue** puis balade libre ; **9 PNJ** à IA utilitaire (besoins, routine, mémoire de 10 souvenirs) ; dialogues LLM par proxy avec repli scripté hors-ligne ; **missions** tirées des besoins des PNJ ; **8 métiers** ; **cercle temps réel** (rayon fixe 2,6, ciblage automatique, fuite après 3 s) ; **spectateurs** ; **gang en 2v1** ; règles et données v3.7.9 recopiées (`roguelite.js`, `spell-lab.js`, `career-data.json`) ; sauvegarde `kaos.save.v1` + `.bak` ; **9/9 tests** ; 7 captures.
**Manque** : animations d'attaque, de dégâts et de KO ; calendrier de ligue ; véhicules ; équilibrage.

| Élément Kaos | Pour la V1 light |
|---|---|
| Règles et data (`src/core`, `data/`), sauvegarde, tests Node, build esbuild | **Garder** |
| Cerveau PNJ (besoins, routine, mémoire) | **Garder**, évoluera vers la mémoire récursive |
| Missions, métiers, combat, spectateurs, dialogues | Garder dans le code, **hors V1** (gelés) |
| Rendu `iso.js` 2D, sprites Fantasy Creator (`assets/chars`, `compose_sprites.py`) | **À retirer** : migration complète en 3D PSX, aucun sprite 2D conservé en jeu |
| Ville 2D (`city.js`) | **À refaire** en 3D sur le relief (garder la graine et les POI) |
| `server.mjs` (LLM) | **Exclu de la V1** |
| Rayon du cercle fixe 2,6 | À aligner sur la formule (V2) |

## 9. V1 light — périmètre et critères d'acceptation [DÉCIDÉ : périmètre ; critères PROPOSITION]
**Périmètre** : moteur 3D + relief en morceaux + ville basique + 2 persos qui marchent, hors-ligne, zéro serveur. Pas de combat, de métier ni de LLM.

**Critères (tous testables)**
1. S'ouvre **hors-ligne** (file:// ou dossier local), **0 requête réseau** (vérifié en Playwright, réseau coupé), aucun serveur.
2. **POCO F8 Pro**, Chrome Android, portrait : **≥ 30 fps** en médiane pendant 60 s de marche, 10 min sans plantage.
3. WebGPU s'il est disponible, sinon **repli WebGL2** automatique, même scène ; le moteur utilisé est affiché dans les réglages.
4. Relief : morceaux de 500 m, 3×3 chargés, **pas de saccade > 100 ms** au changement de morceau ; même graine = même monde ; coordonnées valides sur les 870 km².
5. Ville basique dans 1 morceau : **≥ 10 tours**, **1 pont**, **2 niveaux** (rue + bas-fonds), post-traitement toon, au moins 1 image de chantier.
6. **2 persos qui marchent** : le joueur (toucher pour bouger, chemin sur le relief, caméra iso qui suit, vitesse = formule PM avec PM 4 = base) + 1 PNJ sur une boucle scriptée, avec animation de marche.
7. Cycle jour/nuit de **24 min** ; fleurs animées au vent sur au moins 1 parcelle.
8. Sauvegarde position + heure dans `neofaille.v1` (+ `.bak`) ; les anciennes sauvegardes ne sont jamais effacées.
9. UI : aucun débordement à 360 et 320 px, menus en texte, boutons +/−, pas de croix directionnelle.
10. **Taille** : dossier ≤ **12 Mo**, JS minifié ≤ **1,5 Mo** (three.js compris), chargement initial ≤ 8 Mo.
11. Tests Node (adressage des morceaux, déterminisme, vitesse PM, sauvegarde) + captures portrait 393×873.
12. **Aucun sprite 2D** chargé en jeu : joueur Benceaki (1 corps + 3 fringues mappées via le manifeste) et 1 PNJ KAG3D ou Vinrax ; low-poly provisoire si pas encore téléchargés. `CREDITS.md` présent et complet.

## 10. Feuille de route [PROPOSITION]
- **V2** : combat temps réel dans le cercle (formule + spectateurs + bulles), animations attaque/KO, combat de ligue et calendrier, téléphone GTA, 3 métiers RP avec arcs, Héritier.
- **V3** : PNJ en 3 classes avec mémoire récursive et journaux, psychologie liée aux vêtements, économie Red Dead (traces, primes), véhicules au sol.
- **V4** : craft Cataclysm (implants, mods, invention), biomes désert/montagne/forêt, créatures, motos et véhicules volants.
- **V5+** : robots, 18 métiers complets, contrats négociés, dark web, monde de 870 km² rempli.

## 11. Points ouverts
1. Qui télécharge les packs itch.io (étape manuelle possible) : Jean, ou moi dans le navigateur de la machine avec son accord ?
2. Licences Benceaki, KAG3D et MikeRoe : à confirmer sur leurs pages (usage commercial ? modification ?) avant toute diffusion publique.
