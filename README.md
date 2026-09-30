# EuroCoins

Site qui présente les **faces nationales des pièces en euros** des 25 pays émetteurs, à partir d'une carte d'Europe cliquable.

- **Carte SVG cliquable** : chaque pays de la zone euro est cliquable (souris ou clavier). Les micro-États (Andorre, Monaco, Saint-Marin, Vatican, Malte, Luxembourg) ont une pastille pour être faciles à atteindre. Une liste de boutons reprend tous les pays.
- **Pièces courantes** : les 8 valeurs (1 cent → 2 €) sont regroupées **par série / version**, pas par millésime. Exemple : les 3 séries belges (Albert II, Albert II modifiée, Philippe). Quand une valeur n'a pas changé d'une série à l'autre, elle est marquée « inchangée ».
- **Commémoratives 2 €** : toutes les pièces commémoratives du pays, filtrables par année, émissions communes comprises (traité de Rome, UEM, 10 ans de l'euro, drapeau européen, Erasmus).
- Le pays sélectionné est dans l'URL (`/#fr`, `/#de`…) pour partager un lien.
- **Sélecteur de langue par pays** : chaque pays émetteur apparaît avec son drapeau et sa langue (Belgique → flamand, Irlande → anglais, Autriche → allemand, Luxembourg → luxembourgeois…), plus la Chine, le Japon et l'Inde. Par défaut, la langue est celle du pays où l'on se trouve (déduit du fuseau horaire, sans géolocalisation), puis celle du navigateur ; le choix de l'utilisateur est ensuite mémorisé. Les noms de pays viennent de `Intl.DisplayNames`, les textes des pièces des pages BCE de chaque langue (repli : catalan→espagnol, luxembourgeois→allemand, chinois/japonais/hindi→anglais).

Source des images et des textes : [Banque centrale européenne](https://www.ecb.europa.eu/euro/coins/html/index.fr.html).

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

Retour à une version précédente (les 5 dernières sont gardées) :

```bash
ssh vps 'ls -1t /var/www/eurocoins/releases'
ssh vps 'sudo -u deploy-eurocoins ln -sfn /var/www/eurocoins/releases/<version> /var/www/eurocoins/current'
```
