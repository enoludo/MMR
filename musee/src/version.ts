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
