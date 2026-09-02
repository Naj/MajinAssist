# MAJIN v40 — dépôt prêt à charger

Déposez ce contenu à la **racine** de votre dépôt GitHub, en écrasant les
fichiers existants. Trois choses ne sont pas dans l'archive parce que je ne les
ai jamais eues — elles sont listées plus bas et il faut les ajouter à la main.

## Arborescence livrée

```
/
├── index.html                      MAJIN v40 (modifié)
├── sw.js                           modifié — plus de cache, activation immédiate
├── _headers                        modifié — no-cache sur le document et /api
├── _redirects                      inchangé
├── manifest.json                   inchangé
├── schema.sql                      NOUVEAU — schéma D1
├── favicon-16.png                  inchangés
├── favicon-32.png
├── apple-touch-icon.png
├── icon-192.png
├── icon-512.png
├── icon-192-maskable.png
├── icon-512-maskable.png
│
├── functions/
│   └── api/
│       └── sync/
│           └── [[path]].js         NOUVEAU — synchro D1 de MAJIN
│
├── taf/
│   ├── index.html                  modifié — meta taf-api, bouton ⤢
│   ├── app.js                      modifié — mode embarqué, canal MAJIN
│   ├── styles.css                  modifié — bloc html.is-embed en fin
│   ├── intro.js                    inchangé
│   └── manifest.webmanifest        inchangé
│
├── DEPLOIEMENT-D1.md
└── INTEGRATION-TAF.md
```

## À ajouter vous-même — trois éléments

### 1. Les fichiers statiques de TAF

Ils n'ont jamais transité par notre échange. Copiez-les depuis votre projet TAF
actuel vers `taf/` :

```
taf/sw.js
taf/favicon.svg
taf/icon-192.png
taf/icon-512.png
taf/icon-maskable-512.png
```

Le `sw.js` de TAF est inchangé : il gère vos rappels poussés, ne le remplacez
pas par celui de MAJIN. Sa portée sera `/taf/`, donc sans recouvrement avec
celui de MAJIN à la racine.

### 2. Les fonctions Cloudflare de TAF

C'est le déplacement qui règle la collision d'API. Depuis la racine du dépôt :

```bash
git mv functions/api/sync.js       functions/taf/api/sync.js
git mv functions/api/share         functions/taf/api/share
git mv functions/api/push          functions/taf/api/push
```

Adaptez les noms à ce que contient réellement votre dossier — l'idée est que
tout ce qui servait TAF passe sous `functions/taf/api/`. Le code des fonctions
n'a pas à changer, seule leur adresse bouge.

`taf/index.html` pointe déjà sur cette nouvelle base :

```html
<meta name="taf-api" content="/taf/api">
```

Attention à ne pas emporter `functions/api/ics-proxy.js` : celui-là appartient à
MAJIN et reste où il est.

### 3. Les réglages du projet Cloudflare Pages

**Settings → Bindings**

| Type | Variable | Cible |
|---|---|---|
| D1 database | `DB` | base `majin` (nouvelle) |
| D1 database | *nom attendu par vos fonctions TAF* | base TAF existante |

**Settings → Variables and Secrets**

| Nom | Contenu |
|---|---|
| `MAJIN_SYNC_KEY` | une phrase longue et aléatoire |
| clés VAPID de TAF | reprises de votre projet TAF |

Ajoutez le tout sur **Production** *et* **Preview**, sinon les aperçus de
branche tomberont en erreur 500.

Et avant tout : créez la base et chargez le schéma.

```bash
npx wrangler d1 create majin
npx wrangler d1 execute majin --remote --file=./schema.sql
```

Le détail est dans `DEPLOIEMENT-D1.md`.

## Ordre de mise en service

1. Poussez le dépôt, laissez le déploiement se terminer.
2. Ouvrez **`/taf/` seul dans un onglet**. TAF doit s'afficher, avec son
   ouverture animée. Tant que ce n'est pas le cas, la vignette ne marchera pas
   — c'est le test qui isole tout le reste.
3. Dans TAF, ⚙ → *Synchroniser maintenant*. Un échec ici signifie que les
   fonctions ne sont pas à la bonne adresse.
4. Ouvrez MAJIN. La vignette TAF affiche le tableau et le compteur se remplit.
5. **Paramètres → Synchronisation entre machines** : collez `MAJIN_SYNC_KEY`.
   Commencez par la machine dont les réglages font référence — la première
   liée impose son état aux suivantes.
6. Répétez l'étape 5 sur vos autres machines.

## Si la vignette affiche un message d'erreur

Elle diagnostique elle-même et vous dit quoi corriger :

| Message | Cause |
|---|---|
| TAF n'est pas servi sous /taf/ | Le dossier `taf/` n'est pas déployé — `/taf/` renvoie MAJIN |
| TAF est introuvable | Aucune réponse sur `/taf/` |
| TAF ne répond pas | La page se charge mais la balise `taf-api` pointe au mauvais endroit |

## Revenir en arrière

Rien n'est destructeur. Vos données restent dans le navigateur sous
`majin_*` et `pic-majin:v1`. *Délier cette machine* dans Paramètres suffit à
retrouver le comportement d'avant D1. Les anciennes vignettes Notes et Rappels
ont disparu de l'écran, mais leur code et leurs données sont intacts : elles
reviennent en restaurant l'`index.html` précédent.
