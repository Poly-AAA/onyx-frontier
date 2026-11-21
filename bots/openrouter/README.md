# Système d'Équipement

Module `Equipment` pour gestion d'inventaire et équipement (Node/browser).

## API
- `new Equipment({storage, key, backpackInFrontRows, weaponAfterShieldRows})`
- `addItem({id,name,slot,folder,stats,color?})`
- `equip(id)`, `unequip(slot)`, `setBody({morphology,sex})`
- `getStats()` → dictionnaire ; `getLayers(row)` → liste ; `snapshot()` → copie profonde ; `save()`/`load()` → `{ok,error?}`

## Slots (alias FR)
`head` ← `tete`/`coiffe`, `chest` ← `torse`, `backpack` ← `cape`, `legs` ← `jambes`, `gloves` ← `mains`, `weapon` ← `arme`

## Particularités
- Inventaire exclut items équipés
- `equip(id)` remet l’ancien objet dans l’inventaire ; les mutations ne retournent pas de résultat.
- Données morphologie/sexe compatibles uniquement
- SVG prototype (pas d'asset réel, fitting/animations/baseline DEMO)
- Row flags DEMO

## Tests Node
✅ swap/stats/aliases/8rows/storage/corruption/quota
📸 Capture non produite : Chrome headless isolé a expiré après 45 s (journal `headless.log`).
⚠️ Rendu et console navigateur NON validés. Aucun succès visuel annoncé.

## Corrections manuelles
Exports, garde storage, slots inconnus, sécurité prototype, labels layout, typo propriété, ordre assertion inventaire

## Fichiers et attribution
- `equipment.js` : module UMD/CommonJS écrit par Nemotron, puis correctifs ciblés produits par ce modèle et revue manuelle.
- `creator-ui.html` : interface et fonctions correctives Nemotron ; aucun CDN ni asset distant.
- `test-equipment.js` : smoke-test et cas de schéma Nemotron, assertions/harness corrigés manuellement après échecs réels.
- `creator-inline.syntax.js` : extraction automatique du script HTML uniquement pour `node --check`.
- `README.md` : proposition Nemotron rectifiée avec les résultats réels.
Modèle retenu : `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`. Les remplacements proposés par `openrouter/recursive/flint-v1.0:free` ont été rejetés (contrat API non respecté). North non appelé : l’outil MCP n’expose pas `max_tokens`, impossible d’imposer ≥1024 avec cet outil. Plusieurs générations ont expiré ; tous les appels réussis rapportent un coût de 0, sans preuve indépendante de facturation.

## Vérifications réalisées
`node --check equipment.js`, `node --check test-equipment.js`, `node --check creator-inline.syntax.js` : OK.
`node test-equipment.js` : OK — swap, stats, alias, ordre des calques sur 8 rangées, aller-retour stockage, JSON corrompu, quota/absence stockage ; quatre schémas invalides préservent l’état, statistiques non finies rejetées.
Corrections manuelles supplémentaires : export CommonJS, garde du getter storage sans écriture-sonde, whitelist de slots, accumulateur stats sans prototype, noms de slots rendus, typo `sex`, labels/CSS/hauteur aperçu, suppression de récursion seed/load, assertions d’inventaire et harness supplémentaire. Il ne s’agit donc pas de code modèle accepté sans retouches.

## Limites
Prototype autonome non intégré au combat. Compatibilité sexe/morphologie au niveau données uniquement ; largeur schématique, aucun ajustement réel des sprites, animation ni validation des huit vues visuelles. Format de référence : PNG/spritesheets 1920×1024, 15×8 cellules de 128 px ; aucune sheet chargée ici. Ordre directionnel configuré par indices de rangées de démonstration, pas valeurs certifiées de la baseline. Stockage version 1 localStorage : refus d’écraser une sauvegarde corrompue, sans migration/backup multi-version. L’interface n’a pas été testée par interaction navigateur.
