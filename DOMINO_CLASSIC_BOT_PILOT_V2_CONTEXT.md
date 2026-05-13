## Pilotage Domino classique V2

### Mise a jour du 13 mai 2026

Nouveau mode ajoute :

- `dominov1`

Intention :

- exposer dans le dashboard V2 un niveau manuel qui recopie le bot fort historique de la V1 du `Domino classique`
- garder en parallele les profils deja utilises en V2 :
  - `userpro`
  - `ultra`

Regle produit :

- le mode auto continue de piloter seulement entre `userpro` et `ultra`
- `dominov1` est un niveau manuel seulement
- il sert maintenant de niveau manuel anti-joueur tres dur, issu de l'heritage V1 mais pousse plus loin

Branchement frontend dashboard :

- `D:\dashboardkobposhv2\pilotagebot-domino-classique.html`
  - ajoute un bouton manuel `DominoV1`
  - explique que `dominov1` recopie le bot V1
- `D:\dashboardkobposhv2\pilotagebot-domino-classique.js`
  - reconnait `dominov1`
  - affiche correctement son libelle
- `D:\dashboardkobposhv2\index.html`
  - mentionne maintenant `dominov1` dans la carte du dashboard

Branchement backend Vercel :

- `D:\kobposhv2\vercel-api\lib\domino-classic.js`
  - reconnait `dominov1` comme difficulte valide
  - l'inclut dans le mix par niveau du snapshot analytics
  - accepte son usage en mode manuel via `setDominoClassicBotPilotControl(...)`

Important :

- aucune nouvelle route Vercel n'a ete necessaire
- le changement repose sur les routes Domino classique et dashboard deja actives

Repere visuel cote jeu :

- dans le mode `dominov1`, le bloc adversaires affiche `advesè yo` au lieu de `3 advesè yo`
- le badge shell `Mode DominoV1` a ete retire ensuite pour garder une interface plus propre

Evolution produit du 13 mai 2026 :

- `dominov1` ne se limite plus a "la plus grosse tuile jouable"
- le moteur local traite maintenant les `3` bots comme une coalition contre le joueur
- le faux allie seat `2` sabote aussi le camp joueur
- la distribution et les fermetures de manches sont poussees pour rendre ce mode beaucoup plus dur a battre
- le mode est ensuite passe en vrai `3 contre 1` :
  - seul le seat `0` peut compter comme victoire humaine
  - les seats `1`, `2`, `3` sont toujours archives comme camp bots

Deploiement production :

- backend Vercel redeploye le `13 mai 2026`
- commande utilisee : `vercel --prod --yes`
- deployment inspect : `https://vercel.com/htmls-projects/vercel-api/A2ZwqsKP79g1pr7GALYmD87mYG5t`
- alias production actif : `https://vercel-api-iota-lime.vercel.app`
