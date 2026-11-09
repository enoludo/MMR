import { reglagesSalle } from '../reglages'
import type { SalleConfig } from './types'

/**
 * Couleurs d'une salle réglables à la touche M (« Couleurs · <salle> », 03/11) : soleil, ambiance
 * de l'œuvre et des couloirs, lueur du socle, matières. Elles sont écrites dans la config de la
 * salle, que la scène relit (à chaque image pour les lumières, à chaque rendu pour les matières).
 */
export const PARTIE_COULEURS = 'Couleurs'

/** Ambiance des salles qui n'en précisent pas (ciel froid, rebonds chauds sur la pierre) */
export const AMBIANCE_CHAUDE = { ciel: '#a9bde0', sol: '#76675a', couloir: '#ffe0c2' }

/** Champs de la touche M, valeurs de la config */
export function schemaCouleurs(c: SalleConfig) {
  const amb = c.ambiance ?? AMBIANCE_CHAUDE
  const s: Record<string, { value: string; label: string }> = {
    soleil: { value: c.soleil.couleur, label: 'soleil' },
    ambianceCiel: { value: amb.ciel, label: 'ambiance de l’œuvre : haut' },
    ambianceSol: { value: amb.sol, label: 'ambiance de l’œuvre : bas' },
    ambianceCouloir: { value: amb.couloir, label: 'ambiance des couloirs' },
  }
  if (c.sculpture.lueur) s.lueur = { value: c.sculpture.lueur.couleur, label: 'lueur du socle' }
  for (const [nom, m] of Object.entries(c.matieres))
    s[`matiere${nom}`] = { value: m.couleur, label: `${m.metal ? 'métal' : m.lumineuse === undefined ? 'pierre' : 'paroi lumineuse'} : ${nom}` }
  return s
}

/** Écrit les couleurs dans la config de la salle */
export function appliquerCouleurs(c: SalleConfig, v: Record<string, string>) {
  c.soleil.couleur = v.soleil
  c.ambiance = { ciel: v.ambianceCiel, sol: v.ambianceSol, couloir: v.ambianceCouloir }
  if (c.sculpture.lueur && v.lueur) c.sculpture.lueur.couleur = v.lueur
  for (const [nom, m] of Object.entries(c.matieres)) if (v[`matiere${nom}`]) m.couleur = v[`matiere${nom}`]
}

const copies = new Map<SalleConfig, SalleConfig>()
/**
 * La config d'une salle avec ses couleurs enregistrées. Ses couleurs lui sont propres (copie du
 * soleil, de l'ambiance, des matières et de la sculpture) : les salles faites l'une à partir de
 * l'autre (rotonde, salle bleue) partagent sinon ces objets, et régler l'une changerait l'autre.
 */
export function avecCouleurs(config: SalleConfig): SalleConfig {
  let c = copies.get(config)
  if (!c) {
    c = {
      ...config,
      soleil: { ...config.soleil },
      ambiance: { ...(config.ambiance ?? AMBIANCE_CHAUDE) },
      matieres: Object.fromEntries(Object.entries(config.matieres).map(([n, m]) => [n, { ...m }])),
      sculpture: { ...config.sculpture, lueur: config.sculpture.lueur && { ...config.sculpture.lueur } },
    }
    appliquerCouleurs(c, reglagesSalle(c, PARTIE_COULEURS, schemaCouleurs(c)))
    copies.set(config, c)
  }
  return c
}
