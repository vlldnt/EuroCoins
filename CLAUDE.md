# EuroCoins — conventions

Voir README.md pour la présentation fonctionnelle.

## Commandes
- `npm run dev` / `npm run build` (tsc + vite) / `npm run lint` (oxlint). Toujours faire passer `build` et `lint` avant de conclure.
- `npm run fetch-coins`, `npm run build-map`, `npm run build-signatures` (reconnaissance par photo, après fetch-coins) : régénèrent les données. Ne jamais éditer à la main `src/data/*.json` ni `public/coins/**`.

## Règles
- Commentaires en français. Aucun texte d'interface en dur : passer par `useI18n().t()` ; toute nouvelle clé s'ajoute dans `src/i18n/locales/fr.ts` (référence) ET dans les 22 autres fichiers de `locales/` (le type `Messages` l'impose).
- Noms de pays : `useCoinTexts().nameOf(country)`, jamais `country.name` directement.
- Identifiant pays = code ISO alpha-2 minuscule (`fr`, `ee`, `si`…). Les codes BCE (`et`, `sl`, `mo`) n'apparaissent que dans `scripts/countries.mjs`.
- Images : toujours passer par `asset()` de `src/data.ts`.
- Thème : couleurs uniquement via les variables CSS de `src/index.css` (clair + sombre).
- Composants dans `src/components/`, un composant principal par fichier.

## Travail en parallèle (worktrees)
Fichiers partagés, à ne modifier que dans une seule tâche à la fois : `src/data.ts`, `src/App.tsx`, `src/index.css`, `scripts/countries.mjs`.
Une nouvelle fonctionnalité = de préférence un nouveau composant ou un nouveau script.
