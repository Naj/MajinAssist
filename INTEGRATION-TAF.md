# TAF dans MAJIN — mise en service

## Le point qui coince, et pourquoi

TAF appelle son backend sur `/api/sync`. MAJIN expose désormais **sa propre**
`/api/sync` pour la base D1 des réglages. Servir les deux à la racine du même
domaine, c'est une collision frontale : le premier appel de TAF tomberait sur la
fonction de MAJIN et repartirait avec un 401.

La solution retenue déplace TAF **et son backend** dans un sous-dossier. Rien
n'est réécrit dans son code applicatif : la base d'API est devenue une donnée du
document.

## Arborescence cible du dépôt

```
/
├── index.html              ← MAJIN v40
├── sw.js
├── manifest.json
├── _headers
├── _redirects
├── schema.sql
├── functions/
│   └── api/
│       └── sync/
│           └── [[path]].js ← synchro D1 de MAJIN
└── taf/
    ├── index.html          ← TAF (patché)
    ├── app.js              ← TAF (patché)
    ├── styles.css          ← TAF (patché)
    ├── intro.js            ← inchangé
    ├── manifest.webmanifest
    ├── sw.js               ← le vôtre, inchangé
    ├── favicon.svg
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable-512.png
```

Et **le point qui demande votre main** : le dossier `functions/` actuel de TAF
(celui qui sert `/api/sync`, `/api/share`, `/api/push`) doit être déplacé vers :

```
functions/taf/api/…
```

Un simple `git mv` du dossier suffit — le code des fonctions n'a pas à changer,
seule leur adresse bouge. Elles répondront alors sur `/taf/api/sync`,
`/taf/api/share/:token`, `/taf/api/push/vapid`, etc.

Puis, dans `taf/index.html`, pointez la balise vers cette nouvelle base :

```html
<meta name="taf-api" content="/taf/api">
```

Elle est livrée à `/api` par défaut, pour que TAF continue de tourner tel quel
si vous préférez le laisser sur son projet Cloudflare actuel.

Le binding D1 de TAF et ses secrets VAPID doivent être ajoutés au projet MAJIN,
puisque les fonctions y déménagent.

## Ce qui a changé dans TAF

**`index.html`** — une balise `taf-api` pour la base d'API, un bouton `⤢` dans
l'en-tête, masqué hors mode embarqué.

**`styles.css`** — un bloc `html.is-embed` en fin de fichier. Il retire le grand
en-tête, le bloc « by Majin » et la ligne d'aide clavier, mais **garde le point
de synchro et l'engrenage** : sans eux, les réglages de TAF deviendraient
inaccessibles depuis MAJIN.

**`app.js`** — quatre ajouts, tous conditionnés par `EMBED` :

- détection du mode embarqué (`?host=majin`, ou `window.self !== window.top` en
  garde-fou si le paramètre saute) ;
- remontée du compteur vers MAJIN à chaque `refreshCounters()` ;
- l'ouverture animée de dix secondes est sautée en vignette — superbe au
  lancement de l'application, insupportable vingt fois par jour ;
- l'enregistrement du service worker est sauté aussi : son rechargement
  automatique sur `controllerchange` relancerait l'iframe sous vos doigts.

## Le canal MAJIN → TAF

MAJIN et TAF partagent la même origine, donc le même `localStorage`. MAJIN
*pourrait* écrire directement dans `pic-majin:v1`. Il ne le fait pas : toute
évolution de votre modèle de tâche casserait alors MAJIN en silence. Les
échanges passent par `postMessage`, TAF reste seul maître de son format.

| Message | Effet |
|---|---|
| `majin:add-task` | Crée une tâche (`sujet`, `echeance`, `collaboration`) |
| `majin:add-note` | Crée une note en attente |
| `majin:import-legacy` | Reprise des anciennes notes et rappels |
| `majin:mode` | Prévient du passage vignette ↔ plein écran |

Et en retour : `taf:stats` (compteur), `taf:expand` / `taf:collapse`, `taf:ack`.

## L'assistant crée des tâches

Quand vous dites à MAJIN « rappelle-moi de relancer Beedeez vendredi », il
répondait par `[REMINDER:titre|date]` et remplissait une vignette qui n'existe
plus. Il envoie maintenant un `majin:add-task` à TAF : la demande devient une
tâche datée, dans le tableau où vous travaillez.

Le magasin `majin_reminders` continue d'être alimenté en second rideau, le temps
que la reprise soit passée sur toutes vos machines. Vous pourrez retirer cette
ligne plus tard.

## La reprise des anciennes données

Au premier chargement où TAF répond, MAJIN lui envoie vos notes non cochées et
vos rappels. Les notes deviennent des « Notes en attente », les rappels des
tâches datées. Les anniversaires arrivent en tâche avec une mention en
commentaire : TAF n'a pas de récurrence annuelle, ils ne se répéteront plus.

TAF déduplique via `legacyId` : rejouer la reprise ne crée pas de doublon. Le
drapeau `majin_taf_legacy_migrated` n'est écrit qu'**après** l'accusé de
réception, et il ne rejoint pas `PREF_KEYS` — le partager ferait sauter l'étape
sur les machines qui ne l'ont pas encore faite.

## Vérifications après déploiement

1. `https://votre-domaine/taf/` → TAF s'ouvre normalement, avec son intro.
2. Onglet Accueil de MAJIN → la vignette TAF affiche le tableau, le compteur
   d'en-tête se remplit.
3. Bouton *Agrandir* → plein écran, `Échap` pour réduire. Une saisie en cours
   survit au changement : l'iframe est déplacée, jamais recréée.
4. Réglages de TAF (⚙ dans la vignette) → *Synchroniser maintenant* réussit.
   S'il échoue, la balise `taf-api` ne pointe pas au bon endroit.
5. Demandez un rappel à l'assistant → la tâche apparaît dans TAF.

## Deux réserves à connaître

**Deux synchronisations coexistent.** MAJIN synchronise ses réglages par clé D1,
TAF ses tâches par code d'espace. C'est volontaire pour l'instant : fusionner
les deux demanderait de réécrire votre backend TAF. Le schéma D1 de MAJIN
réserve déjà l'espace de noms `taf` pour le jour où vous voudrez le faire.

**L'impression depuis la vignette.** `window.print()` dans une iframe imprime
l'iframe seule. Passez en plein écran avant d'imprimer, ou ouvrez `/taf/`
directement.
