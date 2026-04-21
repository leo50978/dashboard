# Cadrage - Championnat Mopyon

## Objectif

Remplacer le bouton / flux actuel de "tournois" par un vrai championnat de Mopyon, avec:
- une page publique de championnat,
- une modale "contacter un agent" reliée au flux WhatsApp / modales existant,
- un dashboard agent pour inscrire les joueurs payants,
- un dashboard championnats pour gérer les participants et les matchs,
- une vue public qui affiche l'avancement, le classement et les matchs à venir.

Règles de cadrage technique:
- ne pas casser les pages qui fonctionnent déjà;
- conserver le design global du site;
- privilégier une implémentation simple, lisible et séquentielle;
- éviter toute écriture côté spectateur;
- garder le "live" léger, lisible et peu coûteux.

## Point de départ dans le code actuel

Fichiers déjà utiles:
- `Dmorpion.html` et `Dmorpion.js`: analytics Morpion côté dashboard.
- `pilotagebot-morpion.html` et `pilotagebot-morpion.js`: file d'attente / pilotage Morpion.
- `Dagents.html` et `Dagents.js`: gestion des agents.
- `Dagentdeposit.html` et `Dagentdeposit.js`: flux agent avec recherche utilisateur + modal de crédit.
- `Dwhatsapp.html` et `Dwhatsapp.js`: configuration des numéros WhatsApp des modales, y compris le contact dédié championnat.
- `secure-functions.js`: couche des callable Firebase sécurisés.

Conclusion provisoire:
- le championnat Mopyon ne doit pas réutiliser le vieux "tournois domino";
- on peut partir du style et des patterns existants pour éviter de reconstruire une logique de modales de zéro.

## Vision produit

### Côté utilisateur

Quand l'utilisateur clique sur le bouton "Championnat Mopyon":
- il voit une barre de progression d'inscription,
- la jauge cible est de `64` participants,
- il voit un bouton "S'inscrire au championnat",
- en cliquant, une modale lui demande de contacter un agent,
- la modale doit être branchée sur le flux de contact agent existant,
- une fois inscrit, il doit voir sa position dans le classement et les matchs à venir,
- il doit voir les matchs en direct si son match est en cours ou si un spectateur consulte la page.

### Côté agent

L'agent reçoit le contact, prend le paiement de `150 HTG`, puis:
- ouvre le dashboard championnat,
- cherche le user payé via une barre de recherche,
- ajoute ce user dans la liste du championnat,
- voit en temps réel le compteur / la liste des inscrits.

### Côté admin

L'admin peut gérer le championnat depuis un dashboard dédié:
- voir les `64` inscrits,
- lancer manuellement le tirage au sort,
- sélectionner des duels manuels `user vs user`,
- publier les matchs à venir,
- suivre l'état des participants qualifiés,
- afficher dans le site public les matchs planifiés et les boutons "jouer" quand un joueur est concerné.

## Règlement Officiel

### 1. Présentation

- Le championnat Mopyon est une compétition de Tic Tac Toe 5, avec alignement de 5 symboles.
- Nombre de participants: `64` joueurs.
- Format: élimination directe.
- Plateforme: tous les matchs se jouent sur le site officiel.
- Durée: le championnat commence dès que les 64 joueurs sont inscrits et se termine dans la même journée.

### 2. Frais et récompenses

- Frais d'inscription: `150 gourdes` par joueur.
- Frais de match: `500 DOES` par joueur pour entrer dans un match.
- Ce montant est un frais de jeu obligatoire, pas une mise ni un pari.
- Récompenses:
  - `1er`: `5000 gourdes`
  - `2e`: `2000 gourdes`
  - `3e`: `1000 gourdes`

### 3. Format des matchs

- Chaque match se joue en `Best of 3`.
- Le premier joueur à gagner `2 parties` remporte le match.
- Défaite = élimination directe.
- Victoire = qualification pour le tour suivant + gain de points.
- Un joueur doit gagner `6 matchs` pour devenir champion.
- Le paiement de `500 DOES` est requis pour qu'un joueur qualifié puisse entrer dans son match.
- Le mot `live` signifie ici une vue publique en lecture seule de l'état du match, pas un flux vidéo.
- Les spectateurs ne doivent jamais écrire en base.
- Le statut public du match doit se limiter à des mises à jour événementielles: démarrage, score, manche gagnée, fin de match.
- La vue publique doit s'appuyer sur un seul état central par match, pas sur une cascade de documents.

### 4. Déroulement du tournoi

- À chaque tour, le tirage au sort est aléatoire.
- Le tournoi reste en élimination directe.
- Tours:
  - `64 -> 32`
  - `32 -> 16`
  - `16 -> 8`
  - `8 -> 4`
  - `4 -> 2`
  - finale -> champion
- Les tours `32e`, `16e` et `8e` de finale sont saisis manuellement par le staff, puis intégrés au championnat.
- À partir des quarts de finale, puis des demi-finales et de la finale, le championnat suit la progression normale du bracket selon les vainqueurs réels.
- Le dashboard doit distinguer clairement:
  - mode manuel pour les premiers tours saisis par le staff,
  - mode automatique pour les quarts, demi-finales et finale.

### 5. Visibilité des matchs

- Tous les matchs sont joués en ligne sur le site.
- Les matchs sont accessibles au public.
- Les spectateurs peuvent suivre les parties via une vue publique légère.
- Cette vue doit reposer sur un seul état de match central, mis à jour uniquement quand un événement important arrive.
- Les spectateurs consultent en lecture seule, sans écrire en base.
- La vue publique doit rester raisonnable en coût Firebase même avec beaucoup de spectateurs.

### 6. Déroulement et discipline

- L'heure officielle de début est fixée par le staff.
- Tout joueur en retard est automatiquement disqualifié.
- Si un joueur quitte la partie, peu importe la raison, il est considéré comme perdant.
- Seuls les bugs du système peuvent être pris en compte.
- Les cas de bug sont analysés et décidés par le staff.

### 7. Règles générales

- Chaque joueur doit être prêt et disponible pour jouer.
- Aucun comportement frauduleux ou antisportif ne sera toléré.
- Les décisions du staff sont finales et sans appel.

### 7bis. Cycle de statut participant

- `contact_pending`: le joueur a cliqué sur s'inscrire et doit contacter l'agent.
- `payment_pending`: l'agent a été contacté mais le paiement n'est pas encore validé.
- `registered`: le paiement de `150 gourdes` est confirmé et le joueur est inscrit.
- `qualified`: le joueur a gagné son match et passe au tour suivant.
- `in_match`: le joueur est actuellement dans une salle de championnat.
- `eliminated`: le joueur a perdu un match à élimination directe.
- `late_disqualified`: le joueur est absent au début officiel.
- `forfeit`: le joueur a quitté la partie ou abandonné.
- `staff_review`: le cas est bloqué pour bug système ou arbitrage.

### 8. Règles du jeu

- Le but est d'aligner `5 symboles consécutifs`.
- L'alignement peut être:
  - horizontal
  - vertical
  - diagonal
- Le premier joueur à réaliser cet alignement gagne la partie.

### 8bis. Texte public de la modale règles

- Le championnat Mopyon est une compétition de Tic Tac Toe 5 organisée en ligne.
- Il y a `64` joueurs.
- Le format est une élimination directe.
- Tous les matchs se jouent sur le site officiel.
- Le championnat démarre dès que les `64` joueurs sont inscrits et se termine dans la même journée.
- L'inscription coûte `150 gourdes` par joueur.
- Pour jouer un match, chaque joueur paie `500 DOES`.
- Les `500 DOES` sont un frais de jeu, pas une mise.
- Les récompenses sont:
  - `5000 gourdes` pour la 1re place
  - `2000 gourdes` pour la 2e place
  - `1000 gourdes` pour la 3e place
- Chaque match se joue en `Best of 3`.
- Le premier joueur à gagner `2 parties` remporte le match.
- Défaite = élimination directe.
- Victoire = qualification pour le tour suivant et gain de points.
- Un joueur doit gagner `6 matchs` pour devenir champion.
- Les tours `32e`, `16e` et `8e` sont saisis manuellement par le staff.
- Les quarts, demi-finales et la finale suivent ensuite le bracket normal.
- Tout retard, abandon ou déconnexion vaut défaite, sauf bug système validé par le staff.
- Les matchs sont visibles au public en lecture seule.
- La vue publique doit rester légère pour ne pas surcharger la base de données.

## Flux fonctionnels

### 1. Inscription

1. L'utilisateur clique sur "Championnat Mopyon".
2. Il voit le progrès global: `n / 64`.
3. Il clique sur "S'inscrire".
4. Une modale lui dit de contacter un agent.
5. Le contact part vers le bon canal WhatsApp / modal agent.
6. L'agent confirme le paiement de `150 HTG`.
7. L'agent ajoute le joueur dans le championnat.

### 2. Progression

- La barre de progression s'actualise selon le nombre de participants validés.
- Quand `64 / 64` est atteint, le championnat passe à l'état "prêt".
- La page publique doit montrer clairement que le championnat peut démarrer.
- Le statut global du championnat doit suivre cet ordre:
  - `collecting`
  - `ready`
  - `running`
  - `finished`

### 3. Classement / liste

- Un bouton "Classement" permet d'ouvrir la liste complète des inscrits.
- Cette liste montre au minimum:
  - le rang / ordre,
  - le nom ou identifiant,
  - le statut,
  - l'état de qualification si applicable.

### 4. Matchs

- Les matchs sont préparés manuellement côté admin.
- Le dashboard admin permet de choisir `user A` contre `user B`.
- Les tours `32e`, `16e` et `8e` de finale sont saisis manuellement par le staff.
- Les quarts, demi-finales et finale suivent ensuite le bracket normal à partir des vainqueurs réels.
- Le site public affiche les matchs à venir.
- Si un joueur est qualifié et que son match arrive, il voit un bouton "Jouer".
- Ce bouton ouvre la salle du match uniquement pour le joueur concerné.
- Les spectateurs disposent d'une page publique séparée en lecture seule.

## Pages à prévoir

### Public

- `championnat.html` comme page publique de référence, ou un équivalent strictement équivalent.
- `championnat-salle.html` comme salle légère d'attente ou de match pour le joueur concerné.
- Contenu attendu:
  - titre du championnat,
  - barre de progression,
  - CTA "S'inscrire",
  - bouton "Classement",
  - section "matchs à venir",
  - section "mon match" ou "jouer" si le user est qualifié,
  - section vue publique légère pour les matchs en cours.

### Agent

- Une modale dédiée au contact agent pour championnat.
- Elle doit être reliée au flux des modales agent déjà existant.

### Dashboard championnat

- `Dchampionnat.html` comme dashboard de référence, ou un équivalent strictement équivalent.
- Elle doit permettre:
  - recherche utilisateur,
  - ajout d'un participant payé,
  - visualisation des inscrits,
  - gestion des matchs,
  - vue d'avancement générale,
  - saisie des premiers tours en manuel,
  - publication du bracket public,
  - mise à jour de l'état live.

## Architecture prudente

1. Créer une page publique dédiée au championnat.
2. Créer un dashboard championnat séparé de l'analytics Morpion.
3. Réutiliser les styles globaux du site pour garder une cohérence visuelle.
4. Brancher la modale de contact sur le flux WhatsApp déjà existant.
5. Garder le spectateur en lecture seule.
6. Centraliser l'état de chaque match dans un seul document logique.
7. Éviter les sous-collections ou listeners multiples côté public tant que ce n'est pas indispensable.
8. Prévoir un chemin de secours si un appel Firebase échoue.
9. Utiliser un état local partagé temporaire pour le développement tant que le backend championnat n'est pas branché.
10. Ne toucher aux pages existantes que si c'est nécessaire pour ajouter les nouveaux liens.

## Plan de mise en œuvre recommandé

### Phase 1 - cadrage et sécurité
- valider les règles métier;
- figer les statuts;
- figer le modèle de données;
- éviter les changements destructifs.

### Phase 2 - page publique championnat
- remplacer le bouton / accès "tournois";
- afficher le compteur `0 / 64`;
- afficher les matchs à venir;
- ouvrir la modale "contacter un agent";
- brancher le bouton classement.

### Phase 3 - dashboard agent
- ajouter la recherche utilisateur;
- gérer la confirmation de paiement `150 HTG`;
- inscrire le participant validé;
- voir la progression globale.

### Phase 4 - dashboard championnat
- créer les participants;
- saisir les premiers tours manuels;
- publier les quarts, demis et finale;
- suivre les matchs et les qualifiés.

### Phase 5 - finition
- harmoniser le design avec le site;
- brancher les boutons, les modales et les états réels;
- vérifier les règles de cache;
- valider les cas d'erreur;
- vérifier que rien d'existant n'a cassé.

## Données à manipuler

### Inscription

- `userId`
- `displayName`
- `paymentAmount = 150 HTG`
- `paymentStatus`
- `registeredAt`
- `registeredByAgent`

### Championnat

- `totalSlots = 64`
- `registeredCount`
- `status`:
  - `collecting`
  - `ready`
  - `running`
  - `finished`
- `tournamentType = "elimination_directe"`
- `gameType = "mopyon_5"`
- `entryFeeHtg = 150`
- `matchFeeDoes = 500`
- `matchFeeNature = "frais_de_jeu"`
- `prizes`:
  - `first = 5000 HTG`
  - `second = 2000 HTG`
  - `third = 1000 HTG`
- `participants`
- `matches`
- `qualifications`
- `championnat_mopyon` pour le numéro WhatsApp de contact agent dédié.

### Match

- `matchId`
- `round`
- `playerA`
- `playerB`
- `status`
- `winner`
- `scheduledAt`
- `roomId` ou équivalent
- `format = "bo3"`
- `firstToWin = 2`
- `publicLiveView = true`
- `abandonMeansLoss = true`
- `lateMeansForfeit = true`

## Comportement attendu de la barre de progression

- Elle affiche `registeredCount / 64`.
- Elle doit être visuellement prioritaire sur la page.
- Elle passe à l'état "prêt" lorsque les `64` places sont remplies.
- Le texte doit être explicite pour éviter toute ambiguïté.

## Réutilisations possibles

- Le style modale peut s'inspirer de `Dagentdeposit.html`.
- La logique de recherche utilisateur peut s'inspirer de `Dagents.html`.
- La configuration WhatsApp peut s'appuyer sur `Dwhatsapp.html`.
- Les sécurisations Firebase doivent passer par `secure-functions.js`.
- Le travail doit rester non régressif: aucune fonctionnalité existante du site ne doit être cassée pendant l'intégration.

## Plan d'implémentation

### Phase 1

- Créer la page publique championnat.
- Afficher le compteur `n / 64`, le bouton d'inscription et la liste des inscrits.
- Ajouter la modale "contacter un agent".

### Phase 2

- Créer le dashboard agent championnat.
- Ajouter la recherche utilisateur et l'inscription manuelle après paiement.

### Phase 3

- Créer le dashboard admin championnat.
- Gérer les tours manuels `32e`, `16e`, `8e`.
- Générer ensuite les quarts, demi-finales et finale.

### Phase 4

- Créer la vue publique légère des matchs.
- Rendre le bouton "Jouer" accessible uniquement au bon joueur.
- Vérifier que le live ne fait écrire aucun spectateur en base.

### Phase 5

- Brancher les callable Firebase nécessaires.
- Vérifier les indexes et le cache des nouvelles pages.
- Réaliser une passe de non-régression sur les pages existantes.

## Hypothèses retenues pour la première version

- Nom public: `Championnat Mopyon`.
- Nom technique interne: on peut garder `Morpion` dans certains fichiers existants si nécessaire, mais l'interface visible doit afficher `Mopyon`.
- Modale de contact: on réutilise le flux agent existant avec un mode championnat.
- Stockage championnat: prévoir une structure dédiée côté backend quand il sera branché.
- Classement public: visible dès qu'il y a des participants validés.
- Bouton `Jouer`: ouvre une salle liée au match du joueur qualifié.

## Découpage recommandé

### Phase 1

- Remplacer le bouton / point d'entrée "tournois" par le championnat Mopyon.
- Ajouter la page publique avec barre de progression et CTA inscription.

### Phase 2

- Brancher la modale contact agent.
- Ajouter le dashboard agent du championnat.

### Phase 3

- Ajouter le dashboard admin championnat.
- Gérer les `64` participants et la génération manuelle des matchs.

### Phase 4

- Ajouter le classement public.
- Ajouter la navigation "Jouer" vers la salle de match.
- Ajouter la visibilité live des matchs pour les spectateurs.

## Règle de travail

Avant toute implémentation, valider ce document pour éviter de mélanger:
- le vieux flux tournoi,
- le flux agent,
- le flux championnat,
- et le flux de match.

## Checklist de validation

- [ ] Le championnat est nommé correctement dans le public et dans le dashboard.
- [ ] Le compteur d'inscription cible bien `64` joueurs.
- [ ] L'inscription affiche clairement le coût de `150 gourdes`.
- [ ] Le coût de match `500 DOES` est visible là où c'est nécessaire.
- [ ] Le coût de match `500 DOES` est présenté comme un frais de jeu, pas comme une mise.
- [ ] La modale "contacter un agent" est reliée au flux WhatsApp / modales existant.
- [ ] Le dashboard agent permet de rechercher un user et de l'ajouter après paiement.
- [ ] Le dashboard admin permet de gérer les participants et les matchs.
- [ ] Le championnat démarre automatiquement quand les `64` participants sont inscrits.
- [ ] Le format `Best of 3` est respecté.
- [ ] Les tours `32e`, `16e` et `8e` sont ajoutés manuellement par le staff.
- [ ] Les quarts, demi-finales et finale suivent ensuite la progression normale du championnat.
- [ ] Une déconnexion / un abandon compte comme défaite, sauf bug système validé par le staff.
- [ ] Les matchs sont visibles au public en direct.
- [ ] Les récompenses finales sont affichées correctement.
- [ ] Le bouton "Jouer" mène bien à la salle de match ou d'attente.
- [ ] Aucune fonctionnalité existante du site n'a été cassée pendant l'intégration.
