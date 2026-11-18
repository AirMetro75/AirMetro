# AirMétro — site public (gratuit)

Carte interactive de la qualité de l'air sur les quais du métro parisien.
Tout tourne sur **Cloudflare (Workers + fichiers statiques) + base D1** (offres gratuites, sans carte bancaire à l'inscription) :

```
worker.js, wrangler.jsonc   configuration du déploiement
public/            le site (index.html = la carte, contribuer.html = envoi d'un CSV)
functions/api/     l'API (lecture publique, envoi protégé par une clé)
schema.sql         la base de données (migration-v2.sql pour une base existante)
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
2. Ouvrez la base D1 `airmetro` : copiez son **Database ID**, collez-le dans `wrangler.jsonc` à la place de `COLLEZ-ICI-L-ID-DE-LA-BASE` (modifiez le fichier sur GitHub, puis *Commit*).
3. Une fois déployé : **Settings → Variables and Secrets → Add** : nom **`ADMIN_KEY`**, type **Secret**, valeur = une longue phrase de passe (réservée à la modération, voir plus bas).

Le site est alors en ligne sur `https://airmetro.<votre-compte>.workers.dev`.

> **Mise à jour depuis la version précédente** : la base change de structure (identifiants de capteur). Dans la console D1, exécutez **une par une** les instructions de `migration-v2.sql` (la première supprime l'ancienne table de mesures de test). Le secret `UPLOAD_KEY` n'est plus utilisé : vous pouvez le supprimer.

### 4. Identifiant de capteur (pour chaque personne, sans compte)
1. La personne ouvre `https://airmetro.<votre-compte>.workers.dev/capteur.html` et clique sur **Créer l'identifiant de mon capteur**. Elle obtient un **identifiant** (`AM-XXXXXX`), une **clé secrète** et un **code de liaison** (`AM-XXXXXX.clé@site`). La clé n'est affichée qu'une fois.
2. Sur la page du capteur (192.168.4.1), carte **Plateforme AirMétro** : coller le code de liaison.
3. À chaque « Sortir du métro », la page demande **« Partager mon parcours sur la plateforme AirMétro ? Oui / Non »**. Si le téléphone n'a pas Internet, l'envoi est mis en attente et repris dès que possible (bouton « Envoyer les parcours en attente », ou à la prochaine ouverture de la page).
4. Option **Partage automatique en direct** : chaque station quittée est envoyée tout de suite, sans question à la sortie (désactivé par défaut).
- CSV déjà téléchargés : page `contribuer.html` (avec le code de liaison).

Les envois répétés ne créent pas de doublons.

## Modération
Ouvrez `/admin.html`, entrez `ADMIN_KEY` : liste des capteurs (créé le, dernier envoi, nombre de passages) et bouton **Suspendre / Réactiver**. Un capteur suspendu disparaît de la carte et ne peut plus envoyer.

## Ce qui est protégé
- Tout le monde peut lire la carte ; pour écrire, il faut un identifiant de capteur et sa clé (la base ne garde que l'empreinte de la clé, jamais la clé).
- Le serveur refuse les stations inconnues, les valeurs aberrantes (PM10 < PM2.5, plages impossibles), plus de 300 passages par heure et par capteur, 3000 par heure au total, et limite les créations d'identifiants (30 par heure, 200 par jour).
- On ne stocke que des moyennes par passage sur un quai (heure arrondie à 10 min), avec l'identifiant du capteur : aucun nom, aucune adresse IP, aucun trajet détaillé.
- Clé perdue : créer un nouvel identifiant (pas de récupération, par conception).
- La création d'identifiants est ouverte à tous : un utilisateur malveillant pourrait envoyer de fausses mesures. La suspension d'un capteur est immédiate. Si les abus deviennent un problème, on peut ajouter une vérification anti-robot gratuite (Cloudflare Turnstile).

## Limites à connaître
- Les offres gratuites ont des quotas (requêtes par jour, taille de base) et peuvent évoluer : un capteur unique reste très loin des limites, mais vérifiez les conditions actuelles de Cloudflare.
- Mesures **indicatives** (capteur grand public), pas réglementaires ; l'avertissement est affiché sur le site.
- Nom de domaine personnalisé : seule option payante, facultative.

## Tester en local (facultatif)
Node 22.13+ : `node test/dev-server.mjs` puis ouvrir http://localhost:8790 (clé d'administration de test : `admin-test`). Ajoutez `?demo` à l'adresse pour voir des données fictives.
