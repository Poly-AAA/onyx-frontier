**Proposition d’Architecture Gameplay – Mission M1 (RPG Tactique Mobile Offline)**

**1. États de Quête et Contrats de Données**
Le flux de la mission M1 repose sur une machine à états séquentielle stockée dans le `localStorage`. 

*   **États de quête (`quest_m1_status`)** :
    *   `M1_INIT` : Exploration du hub quadrillé, 3 PNJ interactifs (Clinique, Soigneur, Portail).
    *   `M1_CINEMATIC_PLAYED` : Cinématique « Le Général a abattu un ange » lue (déclencheur unique).
    *   `M1_COMBAT_WON` : Victoire dans le moteur tactique, loot de l'équipement étrange en attente de récupération.
    *   `M1_CORRUPTED_RETURN` : Hub mis à jour, avatar affichant la corruption corporelle, cliniques bloquées.
    *   `M1_OCCULT_CLEANED` : Soin occulte effectué, mission validée.

*   **Contrat de Données Persistantes (`localStorage` Schema)** :
    *   `player_profile` : Contient l’ID, l'inventaire (tableau d'identifiants d'objets), et la jauge `corruptionLevel` (entier 0-100).
    *   `quest_flags` : Dictionnaire de booléens de contrôle (ex: `m1_angel_seen`, `m1_combat_cleared`, `m1_reward_claimed`, `clinic_refused`).

**2. Invariants Anti-Double Récompense**
Pour garantir l'intégrité économique et de progression en mode hors-ligne sur mobile :
*   **Atomicité de la Victoire** : Dès la fin du combat, le moteur transmet un rapport validé. Le système bascule immédiatement le drapeau `m1_combat_cleared` à `true` et génère le loot dans l'inventaire en une seule écriture synchrone dans le `localStorage`.
*   **Verrouillage du Butin** : Le nœud de combat vérifie l’invariant `m1_reward_claimed === false`. Si le joueur force un rechargement du jeu pour exploiter une faille après la victoire, le combat apparaît comme déjà résolu et aucun équipement étrange supplémentaire n'est attribué.
*   **Exclusivité des PNJ** : Les états de la clinique et du soigneur occulte sont mutuellement exclusifs via une règle d'état séquentiel. Le refus de la clinique est un état définitif pour cette étape, empêchant de solliciter à nouveau un soin conventionnel tant que le soin occulte n'a pas réinitialisé le niveau de corruption.

**3. Tests d’Acceptation**
*   **Test A1 (Immersion & Narration)** : 
    *   *Action* : Interagir avec le portail depuis le hub.
    *   *Résultat attendu* : La cinématique se lance une seule fois. À la fermeture, le state passe à `M1_CINEMATIC_PLAYED` et le portail déverrouille l'accès au combat.
*   **Test A2 (Combat et Non-duplication)** : 
    *   *Action* : Terminer le combat, récupérer l'équipement étrange, puis tuer l'application et la relancer (simulation offline).
    *   *Résultat attendu* : L'équipement est présent une seule fois dans l'inventaire ; le nœud de combat ne peut pas être relancé.
*   **Test A3 (Corruption et Itinérance des PNJ)** : 
    *   *Action* : Retourner au hub après le combat. Constatez la corruption visible sur l'avatar. Tenter d'interagir avec la clinique.
    *   *Résultat attendu* : La clinique refuse de soigner (dialogue spécifique, corruption inchangée). Interagir ensuite avec le soigneur occulte.
    *   *Résultat attendu* : La corruption diminue, l'avatar reprend un aspect normal, et la quête passe à `M1_OCCULT_CLEANED`.
*   **Test A4 (Persistance Offline)** : 
    *   *Action* : Couper la connexion/fermer l'application à n'importe quelle étape intermédiaire.
    *   *Résultat attendu* : Au redémarrage, la position sur la grille du hub, les dialogues vus et l'état de corruption sont restaurés à l'identique, sans perte de données.