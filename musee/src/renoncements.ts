/**
 * Échelle des renoncements dans les salles (06/11, ordre choisi par Ludovic) : quand les images
 * tombent sous 30 par seconde, on renonce, une marche à la fois, à
 *   1. la profondeur de champ, 2. les reflets, 3. les halos, 4. la poussière,
 *   5. l'anticrénelage ×2 (au lieu de ×4 ou ×6), 6. l'anticrénelage ×1,
 * puis, en dernier recours, on baisse la résolution jusqu'à tenir au moins 24 images par seconde
 * (resolution.ts). Quand la machine suit de nouveau, on remonte dans l'ordre inverse.
 * Lu à chaque image par Effets, Salle (reflet) et Poussiere ; 0 = tout est là.
 */
export const RENONCEMENTS = [
  'profondeur de champ',
  'reflets',
  'halos',
  'poussière',
  'anticrénelage ×2',
  'anticrénelage ×1',
] as const
export const NIVEAU_MAX = RENONCEMENTS.length

export const renoncement = { niveau: 0 }

export const sansFlou = () => renoncement.niveau >= 1
export const sansReflets = () => renoncement.niveau >= 2
export const sansHalos = () => renoncement.niveau >= 3
export const sansPoussiere = () => renoncement.niveau >= 4
/** Échantillons au plus (anticrénelage par suréchantillonnage, Effets.tsx) */
export const echantillonsMax = () => (renoncement.niveau >= 6 ? 1 : renoncement.niveau >= 5 ? 2 : Infinity)
