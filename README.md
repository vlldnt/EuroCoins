# EuroCoins

Site qui présente les **faces nationales des pièces en euros** des 25 pays émetteurs, à partir d'une carte d'Europe cliquable.

- **Carte SVG cliquable** : chaque pays de la zone euro est cliquable (souris ou clavier). Les micro-États (Andorre, Monaco, Saint-Marin, Vatican, Malte, Luxembourg) ont une pastille pour être faciles à atteindre. Une liste de boutons reprend tous les pays.
- **Pièces courantes** : les 8 valeurs (1 cent → 2 €) sont regroupées **par série / version**, pas par millésime. Exemple : les 3 séries belges (Albert II, Albert II modifiée, Philippe). Quand une valeur n'a pas changé d'une série à l'autre, elle est marquée « inchangée ».
- **Commémoratives 2 €** : toutes les pièces commémoratives du pays, filtrables par année, émissions communes comprises (traité de Rome, UEM, 10 ans de l'euro, drapeau européen, Erasmus).
- **Ma collection** (`/fr/collection/`, bouton dans l'en-tête) : on coche les pièces qu'on possède, série par série ou année par année (au choix), et les 2 € commémoratives par pays ; filtre « manquantes / possédées », résumé par pays. La collection reste dans le navigateur (`localStorage`) et s'exporte en **Excel** (un onglet par pays, onglets « Résumé », « Manquantes » et « Toutes les pièces » en tête), **CSV** ou **JSON** ; tout fichier exporté se réimporte, et un modèle vide peut être rempli à la main (un `x` par pièce possédée) dans Excel ou Google Sheets. Le classeur comporte aussi un onglet « Manquantes » (une ligne par pays). **Partager un lien** donne une adresse qui montre la collection en lecture seule, dans la langue du destinataire (la collection est encodée dans l'adresse, rien n'est envoyé à un serveur).
- **Reconnaissance par photo** : la comparaison se fait d'abord sur le téléphone (`src/coinMatch.ts`). Si le service `server/identify.py` est installé avec une clé OpenRouter, un modèle de vision (par défaut `qwen/qwen2.5-vl-72b-instruct`) lit la pièce puis la compare aux visuels du catalogue ; la photo lui est alors envoyée. En local, mettre `OPEN_ROUTER_API_KEY` dans `.env` : `npm run dev` lance le service tout seul. Sur le VPS : voir `deploy/systemd/eurocoins-identify.service`.
- **Une adresse par pays et par pièce** (en français pour l'instant) : `/fr/belgique/`, `/fr/belgique/2-euros/`, `/fr/belgique/2-euros-commemoratives/2025-…/`. Ouvrir un pays, un onglet ou une pièce met l'adresse à jour ; l'adresse rouvre la même vue. Dans les autres langues, le pays reste dans le hash (`/#be`), et les anciens liens `/#fr` continuent de fonctionner.
- **Référencement** : chaque adresse est aussi une vraie page HTML générée au build (`scripts/build-pages.mjs`), avec titre, description, balises de partage et données structurées, plus des pages par valeur faciale (`/fr/2-euros/`) et par année de commémoratives (`/fr/2-euros-commemoratives/2024/`), `sitemap.xml` et `robots.txt`.
- **Sélecteur de langue par pays** : chaque pays émetteur apparaît avec son drapeau et sa langue (Belgique → flamand, Irlande → anglais, Autriche → allemand, Luxembourg → luxembourgeois…), plus la Chine, le Japon et l'Inde. Par défaut, la langue est celle du pays où l'on se trouve (déduit du fuseau horaire, sans géolocalisation), puis celle du navigateur ; le choix de l'utilisateur est ensuite mémorisé. Les noms de pays viennent de `Intl.DisplayNames`, les textes des pièces des pages BCE de chaque langue (repli : catalan→espagnol, luxembourgeois→allemand, chinois/japonais/hindi→anglais).

Source des images et des textes : [Banque centrale européenne](https://www.ecb.europa.eu/euro/coins/html/index.fr.html).

## Application (PWA)

Le site est une application installable : bouton **« Installer l'application »** dans l'en-tête (Chrome, Edge, Android), ou sur iPhone **Partager → « Sur l'écran d'accueil »**. Installée, elle s'ouvre en plein écran, **sans barre d'adresse**, et fonctionne hors ligne (service worker généré par `vite-plugin-pwa` : l'application est gardée d'avance, les photos et textes au fil de la consultation). Icônes : `npm run build-icons` (source : `scripts/assets/logo.png`, fond blanc retiré par le script).

## Démarrer

```bash
npm install
npm run dev        # http://localhost:3006
npm run preview    # build servi sur http://localhost:3007
npm run build      # build de production dans dist/
npm run lint
```

## Données

Les données sont générées par des scripts et **versionnées** : le site fonctionne sans rien télécharger.

| Commande | Rôle | Produit |
|---|---|---|
| `npm run fetch-coins` | Parcourt les pages de la BCE (1 cent → 2 €, commémoratives 2004 → année en cours), télécharge les visuels et les convertit en WebP 540 px | `public/coins/**`, `src/data/coins.json` |
| `npm run fetch-texts` | Récupère les textes de la BCE (descriptions des pays, titres et descriptions des commémoratives) dans les 18 langues de l'UE, associés aux pièces par leur image (à lancer après `fetch-coins`) | `public/i18n/<langue>.json` |
| `npm run fetch-mintages` | Récupère sur l'API Numista les tirages par année et par valeur faciale des pièces courantes (circulation et coffrets BU/BE séparés). Demande `NUMISTA_API_KEY` dans `.env` (voir `.env.example`) ; réponses gardées dans `scripts/.cache/numista/` pour ménager le quota mensuel (`-- --refresh` pour réinterroger) | `src/data/mintages.json` |
| `npm run build-map` | Projette le fond de carte (world-atlas 1:50m) en tracés SVG pour l'Europe | `src/data/europe-map.json` |

`fetch-coins` ne retélécharge pas les images déjà présentes (option `-- --force` pour tout reprendre). Relance-le quand la BCE publie de nouvelles pièces.

Le référentiel des pays (codes ISO, codes BCE, noms, année d'adoption) est dans `scripts/countries.mjs`.

## Structure

```
scripts/
  countries.mjs        référentiel pays + valeurs faciales
  fetch-coins.mjs      scraping BCE → images + coins.json
  build-map.mjs        world-atlas → tracés SVG précalculés
src/
  data.ts              types + accès aux données
  data/coins.json      généré
  data/europe-map.json généré
  components/
    EuropeMap.tsx      carte cliquable
    CountryPanel.tsx   séries courantes + commémoratives
  i18n/                langues, traductions de l'interface (locales/*.ts), provider
  components/Lightbox.tsx  carrousel plein écran
  App.tsx              mise en page, sélection (hash URL), zoom
public/coins/
  regular/<iso>/       faces des séries courantes
  commemorative/<année>/
```

## Stack

Vite, React 19, TypeScript. Carte : d3-geo et topojson, utilisés uniquement au moment de la génération. Aucune dépendance de carte n'est chargée dans le navigateur.

## Déploiement

Site en ligne : **https://eurocoins.vieilledent.eu** (VPS, nginx, fichiers statiques).

| Quand | Workflow | Effet |
|---|---|---|
| Push sur `main` | `.github/workflows/deploy.yml` | lint + build, envoi dans `/var/www/eurocoins/releases/<version>/`, bascule du lien `current` |
| Chaque lundi 5 h UTC | `.github/workflows/update-data.yml` | relance `fetch-coins` + `fetch-texts` ; s'il y a du nouveau à la BCE, commite puis redéploie |
| À la main | onglet *Actions* → *Run workflow* | l'un ou l'autre |

Sur le VPS :
- utilisateur `deploy-eurocoins` sans sudo, propriétaire de `/var/www/eurocoins` seulement (clé SSH dédiée, stockée dans les secrets GitHub `VPS_SSH_KEY`, `VPS_HOST`, `VPS_USER`, `VPS_KNOWN_HOSTS`) ;
- site nginx `deploy/nginx/eurocoins.vieilledent.eu.conf` (aucun port ni conteneur : pas de conflit avec les autres projets) ; HTTPS via `sudo certbot --nginx -d eurocoins.vieilledent.eu`.

Compteur de visites : `server/visits.py` (Python standard, sans dépendance), service systemd `eurocoins-visits` (`deploy/systemd/`) en local sur `127.0.0.1:8096`, derrière nginx (`/api/visits`). Une visite = un visiteur par heure (empreinte d'adresse hachée en mémoire, jamais écrite) ; robots, scripts et requêtes venant d'autres sites ignorés. Le total est dans `/var/www/eurocoins/data/visits.json`. Le déploiement copie le service et le redémarre (seule commande sudo autorisée à `deploy-eurocoins`).

Retour à une version précédente (les 5 dernières sont gardées) :

```bash
ssh vps 'ls -1t /var/www/eurocoins/releases'
ssh vps 'sudo -u deploy-eurocoins ln -sfn /var/www/eurocoins/releases/<version> /var/www/eurocoins/current'
```
