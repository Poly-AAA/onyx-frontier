# Tests Neo-Faille — Mistral

`node /workspace/game/bots/mistral/run-tests.js` — Node 24, sans dépendance.

Cibles : Groq `src/brains-adapter.vN.js` (N maximal numérique), OpenRouter `equipment.js`, Gemini `corruption-v2.js` uniquement. Absence/API inconnue : SKIP ; assertion/import échoué : FAIL et sortie 1.

Six cerveaux, PA/PM et grille ; corruption seuil exporté ou repli 60 et halo durable ; équipement matrice synthétique seulement, pas de preuve exhaustive des assets. Voir REPORT.md et execution.txt.

.watch-snapshot : chemins triés + mtimes nanosecondes Unix de groq/openrouter/gemini.
