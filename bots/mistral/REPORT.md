# Rapport — 2026-11-07 22:07 Europe/Paris

**74 PASS, 0 FAIL, 2 SKIP**, code Node 0.

| Module | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Cerveaux (brains-adapter.v5.js) | 36 | 0 | 0 |
| Corruption v2 | 35 | 0 | 1 |
| Équipement | 3 | 0 | 1 |

- Six cerveaux × six scénarios : PA/PM bornés, coordonnées unités/cibles/chemins dans la grille, absence de crash. Sélection automatique du N maximal numérique dans `groq/src/brains-adapter.vN.js` ; SKIP si aucune version.
- `gemini/corruption-v2.js` exclusivement : seuil 60 (59/60/61), refus avec halo durable à jauge zéro, bornes et paliers occultes validés. SKIP du test clamp générique car API différente, bornage réel couvert par l’adaptateur.
- Équipement : bonus/retrait, remplacement et matrice synthétique validés. SKIP catalogue réel exhaustif des morphologies/ajustement visuel : non prouvé.
- Changements générés via deux appels `mistral/ministral-8b-latest` OmniRoute, sans blocage. Une correction locale minimale : remplacer le retour prématuré du chemin cible par garde SKIP puis affectation `target`.
- `.watch-snapshot` actualisé : 77 chemins triés, mtime nanosecondes Unix. Traces dans `execution.txt`. Aucun fichier modifié hors de `bots/mistral/`.
