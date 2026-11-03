import { button, levaStore, useControls } from 'leva'
import type { SalleConfig } from './salles/types'
import enregistresAuChargement from './salles/reglages.json'

/**
 * Réglages de la touche M propres à chaque salle (03/11, demande de Ludovic) : un dossier par
 * partie et par salle (« Faisceau · Salle 2 — Huntington »), dont les valeurs sont enregistrées
 * dans src/salles/reglages.json (bouton « Enregistrer les réglages de cette salle », en dev) et
 * reprises au chargement, en ligne comme en dev.
 *
 * Un seul objet de valeurs par salle et par partie, lu à chaque image : jamais celui d'une autre
 * salle, même quand deux salles sont montées en même temps (passage, retour vers la spirale).
 */

type Valeur = number | string | boolean
type Enregistres = Record<string, Record<string, Record<string, Valeur>>>
let enregistres = enregistresAuChargement as Enregistres
// Après un enregistrement, le fichier change : on reprend ses valeurs sans recharger la page
if (import.meta.hot)
  import.meta.hot.accept('./salles/reglages.json', (m) => {
    if (m) enregistres = m.default as Enregistres
  })

/** Valeurs enregistrées d'une partie d'une salle (vide si rien n'est enregistré) */
export const valeursEnregistrees = (salle: SalleConfig, partie: string): Record<string, Valeur> =>
  enregistres[salle.id]?.[partie] ?? {}

/** Nom du dossier de la touche M d'une partie d'une salle */
export const dossierSalle = (partie: string, salle: SalleConfig) => `${partie} · ${salle.titre}`

/** Champ de la touche M : sa valeur par défaut et ses bornes (schéma de Leva) */
type Champ = { value: Valeur } & Record<string, unknown>
type Schema = Record<string, Champ>
export type Valeurs<S extends Schema> = { [K in keyof S]: S[K]['value'] extends number ? number : S[K]['value'] extends boolean ? boolean : string }

const parSalle = new Map<string, Record<string, Record<string, Valeur>>>()

/**
 * Valeurs d'une partie d'une salle, lues à chaque image : celles de la touche M, à défaut celles
 * enregistrées, à défaut celles du schéma. Les clés inconnues du schéma (anciens réglages) sont ignorées.
 */
export function reglagesSalle<S extends Schema>(salle: SalleConfig, partie: string, schema: S): Valeurs<S> {
  let parties = parSalle.get(salle.id)
  if (!parties) parSalle.set(salle.id, (parties = {}))
  if (!parties[partie]) {
    const sauves = valeursEnregistrees(salle, partie)
    parties[partie] = Object.fromEntries(
      Object.entries(schema).map(([cle, champ]) => [cle, typeof sauves[cle] === typeof champ.value ? sauves[cle] : champ.value]),
    )
  }
  return parties[partie] as Valeurs<S>
}

/**
 * Dossier de la touche M d'une partie d'une salle, avec son bouton « copier ». Renvoie les valeurs
 * (un nouvel objet à chaque changement, pour les effets React) ; l'objet lu à chaque image
 * (`reglagesSalle`) est tenu à jour.
 */
export function useReglagesSalle<S extends Schema>(salle: SalleConfig, partie: string, schema: S): Valeurs<S> {
  const r = reglagesSalle(salle, partie, schema)
  const dossier = dossierSalle(partie, salle)
  const complet = Object.fromEntries(Object.entries(schema).map(([cle, champ]) => [cle, { ...champ, value: r[cle] }]))
  // Leva ne sait pas typer un schéma construit : on le type à la sortie
  const valeurs = useControls(dossier, { ...boutonCopier(dossier), ...complet } as unknown as Schema, [salle.id]) as unknown as Valeurs<S>
  Object.assign(r, valeurs)
  return valeurs
}

/** Bouton « copier ce dossier », en tête de chaque dossier de la touche M */
export const boutonCopier = (dossier: string) => ({
  'copier ce dossier': button(() => {
    copierReglages((d) => d === dossier).then(
      () => signaler(`« ${dossier} » copié : collez-le dans la conversation`),
      () => signaler('Copie impossible : autorisez le presse-papiers'),
    )
  }),
})

/** Valeurs du panneau, par dossier : { Couloir: { soleil: 1.2, … }, … } (sans les boutons) */
export function lireReglages(garder: (dossier: string) => boolean = () => true) {
  const reglages: Record<string, Record<string, Valeur>> = {}
  for (const [chemin, entree] of Object.entries(levaStore.getData())) {
    if (!('value' in entree) || entree.type === 'BUTTON') continue
    const i = chemin.lastIndexOf('.')
    const dossier = i < 0 ? '(racine)' : chemin.slice(0, i)
    if (garder(dossier)) (reglages[dossier] ??= {})[chemin.slice(i + 1)] = entree.value as Valeur
  }
  return reglages
}

/** Copie les dossiers choisis, dans le format que « Coller des réglages » relit */
export function copierReglages(garder?: (dossier: string) => boolean) {
  return copier(JSON.stringify({ page: location.pathname, reglages: lireReglages(garder) }, null, 2))
}

/** Message bref affiché par CopieReglages (ui/CopieReglages.tsx) */
let ecouteur: ((m: string) => void) | null = null
export const ecouterMessages = (f: typeof ecouteur) => {
  ecouteur = f
}
export const signaler = (m: string) => ecouteur?.(m)

/** Presse-papiers, avec repli pour les pages sans accès direct */
function copier(texte: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texte)
  return new Promise<void>((ok, echec) => {
    const zone = document.createElement('textarea')
    zone.value = texte
    document.body.append(zone)
    zone.select()
    const reussi = document.execCommand('copy')
    zone.remove()
    if (reussi) ok()
    else echec()
  })
}
