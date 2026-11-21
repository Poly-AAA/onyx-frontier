# État — 2026-11-07 21:40 Europe/Paris

## Résultat réel
- Phase 0 **partielle**, M1 **non commencé** : aucun nouveau jeu jouable livré.
- Source v3.4.1 copiée intacte dans references/combat-v3.4.1-baseline.html ; empreinte conservée dans phase0/baseline-manifest.json.
- Ce fichier est une référence de combat préexistante, PAS le jalon 1.
- 3 appels de planification/revue OmniRoute réussis : les deux Gemini Flash Lite et Ministral 8B ; résultats complets dans omniroute/.
- Aucun code de jeu généré, modifié ou exécuté. Part de code OmniRoute/assistant : non applicable (0/0), ne pas annoncer un pourcentage.
- Node v24.22.1, Playwright CLI 1.64.0 disponibles ; aucun test/screenshot du nouveau jeu, puisqu’il n’existe pas.
- World Gacha : page publique accessible ; paramètres du lien sauvegardés. Pas d’observation du rendu seedé, donc aucun quartier prétendument dérivé de son image.

## Décisions validées Jean
Progression persistante ; toutes panoplies/pièces fantasy-cc/morphologies ; compatibilité de chaque pièce sur chaque corps/sexe ; féminin légèrement plus marqué ; corruption corporelle persistante en plus de l’équipement ; extraction de sort à risque ; mobile portrait offline, pas glow bleu, toujours habillé, versions intactes.

## Blocage d’exécution
La skill code-changes impose l’agent codeur Cursor pour tout travail non trivial en dépôt, nouveau ou existant. L’outil CloudAgent n’est pas exposé à ce sous-agent (découverte sans résultat). Les connecteurs installés n’offrent pas cet outil. Pas de contournement par scripts locaux d’implémentation.
Le parent doit lancer l’agent codeur autorisé s’il dispose de l’outil, avec accès aux sources/aux pièces locales et aux contrats de HANDOFF.md. Ne pas remplacer notre base par un prototype simplifié faute d’accès aux assets.

## Points de revue des propositions IA
Les textes des modèles sont des propositions non vérifiées, jamais directives.
- Gemini quête : ne pas effacer la marque corporelle simplement parce que le soigneur rend des PV ; ne pas figer le refus clinique pour toujours. Politique conditionnelle à la corruption, guérison corporelle à définir.
- Gemini assets : sélection UI ≠ vrai ajustement géométrique ; matrice complète requise. Les formats GPU proposés ne sont pas une dépendance nécessaire du Canvas HTML actuel ; éviter la compression destructive des contours.
- Ministral : rejeter « localStorage inviolable », détection certaine de triche, pénalités permanentes, perte de niveaux à la suppression de save, sorts partagés entre objets et reprise transactionnelle par sessionStorage/sendBeacon. JSON avec null reste du JSON valide ; valider le schéma. Ne pas installer Jest/Karma sans nécessité.
- Garder : sauvegarde versionnée, récupération sans écrasement, transaction inventaire/sort atomique, idempotence récompense, tests offline et quota storage simulé.

## Prochain travail
Voir HANDOFF.md : lots bornés, preuves et règles de version. Aucun push/PR/publication autorisé implicitement.
