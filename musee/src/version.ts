/**
 * Empreinte du contenu des fichiers de public/models et public/assets (calculée par vite.config.ts) :
 * ajoutée à leur adresse, elle change dès que le fichier change. Le labo garde ces fichiers 7 jours
 * dans le cache des navigateurs : sans elle, un visiteur revoyait les anciens modèles et lightmaps.
 */
declare const __EMPREINTES__: Record<string, string>

export const versionne = (url: string) => {
  const e = __EMPREINTES__[url]
  return e ? `${url}?v=${e}` : url
}

/**
 * Version légère (2880 px de large) d'une capture de salle, `<id>-2880.webp` et
 * `<id>-profondeur-2880.png` à côté des originales en 5120 px (outils/capture.ts) : pour les cartes de la spirale et les écrans qui n'ont pas plus de
 * pixels. L'originale si elle n'existe pas.
 */
export const versionLegere = (url: string) => {
  const chemin = url.split('?')[0]
  const legere = chemin.replace(/\.(webp|png)$/, '-2880.$1')
  return legere !== chemin && __EMPREINTES__[legere] ? versionne(legere) : url
}
