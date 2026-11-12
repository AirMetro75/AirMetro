# AirMétro — site public (gratuit)

Carte interactive de la qualité de l'air sur les quais du métro parisien.
Tout tourne sur **Cloudflare (Workers + fichiers statiques) + base D1** (offres gratuites, sans carte bancaire à l'inscription) :

```
worker.js, wrangler.jsonc   configuration du déploiement
public/            le site (index.html = la carte, contribuer.html = envoi d'un CSV)
functions/api/     l'API (lecture publique, envoi protégé par une clé)
schema.sql         la table de la base de données
test/              serveur de test local (facultatif)
```

## Mise en ligne (≈ 15 minutes, une seule fois)

### 1. Mettre le dossier sur GitHub
1. Créez un compte gratuit sur github.com, puis un dépôt vide (par ex. `airmetro`, public ou privé).
2. Envoyez-y le contenu de ce dossier (bouton **Add file → Upload files**, glissez `public`, `functions`, `schema.sql`, `README.md`).

### 2. Créer la base de données
1. Créez un compte gratuit sur dash.cloudflare.com.
2. **Storage & databases → D1 SQL database → Create** : nom `airmetro`.
3. Ouvrez la base, onglet **Console**, collez le contenu de `schema.sql` et exécutez les 3 instructions **une par une** (la console refuse parfois plusieurs instructions d'un coup).

### 3. Créer le site (projet Workers, déployé depuis GitHub)
1. **Workers & Pages → Create → Import a repository** : choisissez votre dépôt. Les fichiers `wrangler.jsonc` et `worker.js` doivent être **à la racine du dépôt** (sinon, dans les réglages de build, renseignez *Root directory*). Laissez la commande de déploiement `npx wrangler deploy`.
2. Ouvrez la base D1 `airmetro` : copiez son **Database ID**, puis collez-le dans `wrangler.jsonc` à la place de `COLLEZ-ICI-L-ID-DE-LA-BASE` (modifiez le fichier sur GitHub, bouton crayon, puis *Commit*). Le déploiement redémarre tout seul.
3. Une fois déployé : **Settings → Variables and Secrets → Add** : nom **`UPLOAD_KEY`**, type **Secret**, valeur = une longue phrase de passe de votre choix (notez-la). Validez : le site est mis à jour.

Le site est alors en ligne sur `https://airmetro.<votre-compte>.workers.dev`.

(Variante « Pages » : le dossier `functions/` fonctionne aussi dans un projet Cloudflare Pages avec la sortie `public` et une liaison D1 nommée `DB`.)

### 4. Envoyer des mesures
- **Automatique** : sur la page du capteur (192.168.4.1), carte « Site public » : adresse du site + clé. À la sortie du métro, le parcours est envoyé si le téléphone a Internet ; sinon utilisez le bouton « Envoyer les parcours en attente » plus tard.
- **Manuel** : ouvrez `https://airmetro.<votre-compte>.workers.dev/contribuer.html`, entrez la clé, choisissez le CSV téléchargé à la sortie du métro, envoyez.

Les envois répétés ne créent pas de doublons.

## Ce qui est protégé
- Seules les personnes qui connaissent la clé peuvent écrire ; tout le monde peut lire.
- Le serveur refuse les stations inconnues, les valeurs aberrantes (PM10 < PM2.5, plages impossibles) et plus de 600 passages par heure.
- On ne stocke que des moyennes par passage sur un quai (heure arrondie à 10 min) : aucune identité, aucun trajet complet.
- Pour changer la clé : modifiez `UPLOAD_KEY` dans Cloudflare puis mettez à jour la carte « Site public » du capteur.

## Limites à connaître
- Les offres gratuites ont des quotas (requêtes par jour, taille de base) et peuvent évoluer : un capteur unique reste très loin des limites, mais vérifiez les conditions actuelles de Cloudflare.
- Mesures **indicatives** (capteur grand public), pas réglementaires ; l'avertissement est affiché sur le site.
- Nom de domaine personnalisé : seule option payante, facultative.

## Tester en local (facultatif)
Node 22.13+ : `node test/dev-server.mjs` puis ouvrir http://localhost:8790 (clé de test : `secret-test`). Ajoutez `?demo` à l'adresse pour voir des données fictives.
