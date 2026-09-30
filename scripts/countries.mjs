// Référentiel des 25 pays émetteurs de pièces en euros.
// iso: code ISO 3166-1 alpha-2 (identifiant interne), numeric: id dans world-atlas,
// ecb: code utilisé dans les URLs de la BCE, en: nom anglais (noms de fichiers BCE),
// aliases: variantes des noms français rencontrées sur le site de la BCE.
export const COUNTRIES = [
  { iso: 'ad', numeric: '020', ecb: 'ad', fr: 'Andorre', en: 'Andorra', euroSince: 2014 },
  { iso: 'at', numeric: '040', ecb: 'at', fr: 'Autriche', en: 'Austria', euroSince: 2002 },
  { iso: 'be', numeric: '056', ecb: 'be', fr: 'Belgique', en: 'Belgium', euroSince: 2002 },
  { iso: 'bg', numeric: '100', ecb: 'bg', fr: 'Bulgarie', en: 'Bulgaria', euroSince: 2026 },
  { iso: 'cy', numeric: '196', ecb: 'cy', fr: 'Chypre', en: 'Cyprus', euroSince: 2008 },
  { iso: 'de', numeric: '276', ecb: 'de', fr: 'Allemagne', en: 'Germany', euroSince: 2002 },
  { iso: 'ee', numeric: '233', ecb: 'et', fr: 'Estonie', en: 'Estonia', euroSince: 2011 },
  { iso: 'es', numeric: '724', ecb: 'es', fr: 'Espagne', en: 'Spain', euroSince: 2002 },
  { iso: 'fi', numeric: '246', ecb: 'fi', fr: 'Finlande', en: 'Finland', euroSince: 2002 },
  { iso: 'fr', numeric: '250', ecb: 'fr', fr: 'France', en: 'France', euroSince: 2002 },
  { iso: 'gr', numeric: '300', ecb: 'gr', fr: 'Grèce', en: 'Greece', euroSince: 2002 },
  { iso: 'hr', numeric: '191', ecb: 'hr', fr: 'Croatie', en: 'Croatia', euroSince: 2023 },
  { iso: 'ie', numeric: '372', ecb: 'ie', fr: 'Irlande', en: 'Ireland', euroSince: 2002 },
  { iso: 'it', numeric: '380', ecb: 'it', fr: 'Italie', en: 'Italy', euroSince: 2002 },
  { iso: 'lt', numeric: '440', ecb: 'lt', fr: 'Lituanie', en: 'Lithuania', euroSince: 2015 },
  { iso: 'lu', numeric: '442', ecb: 'lu', fr: 'Luxembourg', en: 'Luxembourg', euroSince: 2002 },
  { iso: 'lv', numeric: '428', ecb: 'lv', fr: 'Lettonie', en: 'Latvia', euroSince: 2014 },
  {
    iso: 'mc', numeric: '492', ecb: 'mo', fr: 'Monaco', en: 'Monaco', euroSince: 2002,
    aliases: ['Principauté de Monaco'],
  },
  { iso: 'mt', numeric: '470', ecb: 'mt', fr: 'Malte', en: 'Malta', euroSince: 2008 },
  { iso: 'nl', numeric: '528', ecb: 'nl', fr: 'Pays-Bas', en: 'Netherlands', euroSince: 2002 },
  { iso: 'pt', numeric: '620', ecb: 'pt', fr: 'Portugal', en: 'Portugal', euroSince: 2002 },
  { iso: 'si', numeric: '705', ecb: 'sl', fr: 'Slovénie', en: 'Slovenia', euroSince: 2007 },
  { iso: 'sk', numeric: '703', ecb: 'sk', fr: 'Slovaquie', en: 'Slovakia', euroSince: 2009 },
  {
    iso: 'sm', numeric: '674', ecb: 'sm', fr: 'Saint-Marin', en: 'San Marino', euroSince: 2002,
    aliases: ['République de Saint-Marin'],
  },
  {
    iso: 'va', numeric: '336', ecb: 'va', fr: 'Vatican', en: 'Vatican', euroSince: 2002,
    aliases: ['Cité du Vatican', 'État de la Cité du Vatican'],
  },
]

export const DENOMINATIONS = [
  { id: '1c', label: '1 cent', slug: '1cent' },
  { id: '2c', label: '2 cents', slug: '2cents' },
  { id: '5c', label: '5 cents', slug: '5cents' },
  { id: '10c', label: '10 cents', slug: '10cents' },
  { id: '20c', label: '20 cents', slug: '20cents' },
  { id: '50c', label: '50 cents', slug: '50cents' },
  { id: '1e', label: '1 euro', slug: '1euro' },
  { id: '2e', label: '2 euros', slug: '2euro' },
]
