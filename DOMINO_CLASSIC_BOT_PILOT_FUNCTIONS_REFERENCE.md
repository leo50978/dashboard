## References pilotage bots Domino classique V2

### Route snapshot

- chemin : `/api/dashboard/domino-classic-bot-pilot/snapshot`
- fichier route : `D:\kobposhv2\vercel-api\routes\dashboard\domino-classic-bot-pilot\snapshot.js`
- role :
  - lire l'etat courant du pilotage Domino classique
  - renvoyer le niveau applique
  - renvoyer la fenetre analytics et le mix de niveaux

### Route control

- chemin : `/api/dashboard/domino-classic-bot-pilot/control`
- fichier route : `D:\kobposhv2\vercel-api\routes\dashboard\domino-classic-bot-pilot\control.js`
- role :
  - enregistrer le mode `manual` ou `auto`
  - enregistrer le niveau manuel choisi
  - recalculer le niveau auto si le pilotage est en mode automatique

### Coeur metier

- fichier : `D:\kobposhv2\vercel-api\lib\domino-classic.js`

Fonctions importantes :

- `normalizeBotDifficulty(value)`
  - normalise les niveaux acceptes
  - au `13 mai 2026`, reconnait :
    - `userpro`
    - `dominov1`
    - `ultra`
- `getConfiguredDominoClassicBotDifficulty()`
  - donne au jeu le niveau bot actif suivant la configuration admin
- `computeDominoClassicBotPilotSnapshot(options)`
  - calcule la marge, le profit, les victoires et le mix par niveau
- `setDominoClassicBotPilotControl(payload)`
  - persiste le choix manuel ou auto dans `settings/dpayment_admin_bootstrap`
- `getDominoClassicBotPilotSnapshot(payload)`
  - sert la vue complete au dashboard

### Regle produit

- `dominov1` est disponible en manuel seulement
- le mode auto continue de choisir seulement entre `userpro` et `ultra`
