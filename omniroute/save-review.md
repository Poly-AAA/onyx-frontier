Voici **12 invariants/tests** pour valider la robustesse d’un RPG mobile offline en HTML/JS, couvrant persistance, sécurité, UX et intégrité, classés par type (unitaires vs. Playwright/offline). Les contraintes **P2W** et **solo** sont respectées via des mécaniques intrinsèques (ex : corruption aléatoire non exploitable, corruption physique persistante comme marque de jeu).

---

### **Tests Unitaires (logique métier, persistance)**
1. **Persistance `localStorage` inviolable**
   - *Test* : Sauvegarde un inventaire complexe (objets + sorts) avec des données non JSON valides (ex : `{"nom": "Épée", "sorts": [null, {"nom": "Feu"}]}`). Vérifier que le jeu :
     - **Rejette** la charge avec un message clair (ex : *"Fichier corrompu – réinitialisation partielle"*).
     - **Ne supprime pas** les données valides (ex : conserve l’épée mais ignore le `null` dans `sorts`).
     - *Invariant* : Pas de crash silencieux ; sauvegarde redondante (ex : `sessionStorage` pour les métadonnées critiques).

2. **Migration de version sans perte**
   - *Test* : Simuler un changement de version (ex : ajout d’un champ `durabilité` dans les objets). Vérifier que :
     - Les objets sans `durabilité` sont initialisés à `100` (valeur par défaut).
     - Les sorts désassemblables gardent leur formule même si leur structure JSON évolue.
     - *Invariant* : Backward-compatible à 100% ; forward-compatible avec migration explicite (ex : bouton *"Mettre à jour les sauvegardes"*).

3. **Corruption physique persistante**
   - *Test* : Forcer une corruption via `forgemagie` (ex : `localStorage.setItem("inventaire", JSON.stringify({...corrompu...}))`). Vérifier que :
     - L’équipement corrompu affiche une **marque physique unique** (ex : *"Tache de magie noire"*).
     - La corruption est **non réversible** sans action du joueur (ex : utiliser un sort de purification, payant en XP).
     - *Invariant* : La marque persiste même après rechargement ; ne peut pas être supprimée via les menus.

4. **Gestion des doublons (dupes)**
   - *Test* : Sauvegarder deux fois le même objet (ex : deux épées identiques). Vérifier que :
     - Le jeu **fusionne** les objets (ex : `quantité: 2`) ou les **numérote** (`Épée #1`, `Épée #2`).
     - Les sorts liés à ces objets sont **partagés** (ex : un sort de désassemblage fonctionne sur les deux).
     - *Invariant* : Impossible de tricher via `localStorage` (ex : injecter manuellement un objet avec `quantité: 999`).

---

### **Tests Playwright/Offline (UX, crashs, RNG)**
5. **Panne de stockage (localStorage plein)**
   - *Test* : Remplir `localStorage` à 80% avec des données inutiles (ex : 1000 clés vides). Vérifier que :
     - Le jeu **détecte** la panne et propose une **sauvegarde manuelle** (export JSON).
     - Les données critiques (compte, progression) sont **prioritaires** et sauvegardées en premier.
     - *Invariant* : Pas de perte de données ; message : *"Stockage insuffisant – sauvegardez vos données"*.

6. **Mauvais JSON de sauvegarde**
   - *Test* : Corrompre une sauvegarde via `localStorage.setItem("save", "}invalid_json")`). Vérifier que :
     - Le jeu **affiche un écran de récupération** avec options :
       - *"Rétablir une sauvegarde ancienne"* (liste des sauvegardes valides).
       - *"Démarrer une nouvelle partie"* (sans pénalité).
     - *Invariant* : Pas de crash ; historique des sauvegardes accessible via menu.

7. **Rechargement après récompense**
   - *Test* : Recharger le jeu après avoir reçu une récompense (ex : XP, objet rare). Vérifier que :
     - La récompense est **appliquée immédiatement** (pas de délai de synchronisation).
     - Si le jeu crash pendant la réception, la récompense est **stockée en session** et appliquée au prochain lancement.
     - *Invariant* : Pas de perte de récompenses ; journal des actions avec filtre *"récompenses"*.

8. **Crash pendant un transfert (forgemagie)**
   - *Test* : Simuler un crash (via `navigator.sendBeacon` bloqué ou `localStorage` en échec) pendant un transfert de magie. Vérifier que :
     - Le joueur voit un écran de **"Transfert interrompu"** avec :
       - *"Échec partiel : [X]% de la magie transférée"*.
       - Option de **relancer le transfert** (avec pénalité de temps/ressources).
     - *Invariant* : Pas de corruption totale ; journal des transferts avec état.

9. **Manipulation RNG (sans ruiner solo)**
   - *Test* : Forcer un échec de forge via `Math.random()` patché (ex : toujours retourner `false`). Vérifier que :
     - Le jeu **détecte** la manipulation et applique :
       - Une **marque de corruption visible** sur l’équipement.
       - Une **pénalité permanente** (ex : `-10%` aux sorts liés à cet objet).
     - *Invariant* : Le joueur ne peut pas exploiter le RNG pour duper le système ; la marque persiste et affecte le gameplay.

---

### **Tests Transversaux (sécurité, P2W)**
10. **Impossibilité de monétisation P2W**
    - *Test* : Vérifier que :
      - Aucune récompense n’est **verrouillée** derrière un achat (ex : "Achetez 100€ pour débloquer le sort ultime").
      - Les objets rares sont **générés aléatoirement** mais avec une **rareté documentée** (ex : "1% de chance par niveau").
      - *Invariant* : Pas de microtransactions pour contourner la progression ; tous les contenus sont accessibles via le jeu.

11. **PNJ clinique vs soigneur occulte**
    - *Test* : Interagir avec les deux types de PNJ après avoir corrompu un objet. Vérifier que :
      - Le **soigneur occulte** accepte la corruption (ex : *"Cette arme porte une malédiction… Je peux l’utiliser"*).
      - La **clinique** refuse et propose une alternative (ex : *"Cette arme est dangereuse – utilisez celle-ci à la place"*).
      - *Invariant* : Les choix du joueur affectent le récit, mais pas la persistance (ex : la corruption reste même si on refuse la clinique).

12. **Réinitialisation forcée (cheat)**
    - *Test* : Supprimer manuellement `localStorage` via DevTools. Vérifier que :
      - Le jeu **détecte** la perte de données et propose :
        - Une **sauvegarde automatique** (si disponible).
        - Un **mode "Démarrage" avec pénalité** (ex : niveau réduit de 5).
      - *Invariant* : Pas de réinitialisation totale sans confirmation ; historique des sauvegardes accessible.

---
### **Priorités d’implémentation**
- **Critique** : Tests 1, 3, 5, 10 (sécurité, persistance, P2W).
- **UX** : Tests 6, 7, 11 (récupération, choix narratifs).
- **Robustesse** : Tests 2, 4, 8 (migration, dupes, crashs).
- **Solo-friendly** : Tests 9, 12 (RNG équitable, réinitialisation).

*Approche* : Combiner **tests unitaires** (Jest/karma) pour la logique et **Playwright** pour les scénarios offline/crashs, avec des **checkpoints de persistance** après chaque action critique.