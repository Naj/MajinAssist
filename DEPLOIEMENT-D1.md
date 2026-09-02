# MAJIN v40 — mise en service de la base D1

Trois étapes, une seule fois. Ensuite chaque machine se lie en dix secondes
depuis Paramètres.

## 1. Créer la base

Dans le tableau de bord Cloudflare : **Workers & Pages → D1 → Create database**.
Nommez-la `majin`.

Ou en ligne de commande :

```bash
npx wrangler d1 create majin
```

Puis chargez le schéma :

```bash
npx wrangler d1 execute majin --remote --file=./schema.sql
```

## 2. Brancher la base au projet Pages

Toujours dans le tableau de bord, sur votre projet Pages :
**Settings → Bindings → Add → D1 database**

| Champ | Valeur |
|---|---|
| Variable name | `DB` |
| D1 database | `majin` |

Le nom `DB` n'est pas décoratif : c'est celui que la fonction attend
(`env.DB`). Ajoutez le binding pour **Production** et pour **Preview**.

## 3. Définir la clé de synchronisation

**Settings → Variables and Secrets → Add → Secret**

| Champ | Valeur |
|---|---|
| Variable name | `MAJIN_SYNC_KEY` |
| Value | une phrase longue, générée aléatoirement |

C'est le seul rempart devant l'API : sans elle, l'URL publique de vos réglages
serait ouverte à qui la devine. Prenez une vraie phrase de passe et rangez-la
dans votre gestionnaire de mots de passe — vous la retaperez sur chaque machine.

```bash
# Génération d'une clé solide
openssl rand -base64 32
```

## 4. Lier chaque machine

Déployez, ouvrez MAJIN, puis **Paramètres → Synchronisation entre machines**.
Collez la clé, cliquez sur *Lier cette machine*.

- **Première machine** : la base est vide, MAJIN y envoie vos réglages actuels.
- **Machines suivantes** : la base est garnie, MAJIN récupère et recharge.

L'ordre compte. Commencez par la machine dont les réglages font référence,
sinon vous écraserez le bon état avec un état neuf.

## Vérifier que ça tourne

```bash
curl -H "X-Majin-Key: VOTRE_CLE" https://votre-projet.pages.dev/api/sync/status
```

Réponse attendue :

```json
{"ok":true,"ns":"prefs","rev":42,"keys":38,"devices":[...]}
```

| Réponse | Cause |
|---|---|
| `401` | La clé envoyée ne correspond pas au secret Cloudflare |
| `500` binding absent | Le binding D1 n'est pas nommé `DB`, ou pas activé sur cet environnement |
| `500` MAJIN_SYNC_KEY absent | Le secret n'existe pas sur cet environnement |

## Ce qui se synchronise

Tout ce que contient `PREF_KEYS` dans `index.html` : vignettes, catégories,
dispositions, notes, rappels, villes, agenda, thème, voix, veille.

Sont volontairement exclues : `majin_api_key`, `majin_brave_key` (clés d'API,
qui n'ont pas à transiter) et `majin_local_launcher_configured` (propre à
chaque PC — l'importer ailleurs donnerait un faux positif).

Pour ajouter une clé au périmètre, il suffit de l'ajouter à `PREF_KEYS` :
l'export JSON et la synchro partagent la même liste.

## Coût

D1 offre 5 Go de stockage et 5 millions de lectures par jour sur le plan
gratuit. MAJIN écrit quelques dizaines de kilo-octets et interroge la base
toutes les 25 secondes par onglet ouvert. Vous resterez dans l'offre gratuite.

## Revenir en arrière

Le module ne s'active que si `majin_sync_enabled` vaut `1`. *Délier cette
machine* dans Paramètres suffit à retrouver le comportement d'avant : les
réglages restent dans le navigateur, ils cessent simplement d'être partagés.
