import type { SalleConfig, Vec3 } from './types'
import donnees from './points-de-vue.json'

/**
 * Points de vue réglés en vue libre (touche V, ui/VueLibre.tsx), par salle : la vue d'arrivée
 * (position initiale) et les points de vue des popups Maladie et Manifeste. Enregistrés dans
 * points-de-vue.json par le serveur de développement (vite.config.ts), ils remplacent ceux de la
 * config de la salle ; la visite et les captures (outils/capture.ts) les suivent.
 */
export type NomPointDeVue = 'initiale' | 'maladie' | 'manifeste'
export type PointDeVue = { position: Vec3; cible: Vec3 }
/** Profondeur de champ à une vue (panneau de la vue libre, appliquée par scene/Effets.tsx) */
export type ReglageFlou = {
  actif: boolean
  /** Flou maximal (taille du bokeh) */
  flou: number
  /** Profondeur de la zone nette autour de la mise au point (m) */
  nettete: number
  /** Distance de mise au point (m) ; 0 = le point regardé */
  miseAuPoint: number
}
/** Sans réglage, pas de flou ; ces valeurs servent de départ quand on l'active */
export const FLOU_DEFAUT: ReglageFlou = { actif: false, flou: 3, nettete: 1.5, miseAuPoint: 0 }

export type PointsDeVue = Partial<Record<NomPointDeVue, PointDeVue>> & {
  flou?: Partial<Record<NomPointDeVue, Partial<ReglageFlou>>>
}
/** Étape de la salle utilisée par chaque popup (`vues` de l'œuvre, voir oeuvres.ts) */
export type EtapesDesPopups = { maladie: string | null; manifeste: string | null }

export const pointsDeVue = donnees as unknown as Record<string, PointsDeVue>

/**
 * Vue où l'on est : popup ouvert (dès qu'on s'y rend), anneau de la vue d'arrivée, sinon aucune.
 * Tenue par la navigation à chaque image (par la vue libre quand on y revoit une vue).
 */
export const vueEnCours = { nom: null as NomPointDeVue | null }

/** Profondeur de champ à cette vue de la salle */
export const flouDeLaVue = (config: SalleConfig, nom: NomPointDeVue): ReglageFlou => ({
  ...FLOU_DEFAUT,
  ...pointsDeVue[config.id]?.flou?.[nom],
})

/**
 * Reporte un point de vue dans la config (modifiée sur place). La vue d'arrivée reste sur son
 * anneau autour de l'œuvre, tournée vers son axe : on en garde l'angle, la distance, la hauteur
 * de l'œil, et la hauteur à laquelle le regard croise l'axe.
 */
export function appliquerPointDeVue(config: SalleConfig, nom: NomPointDeVue, p: PointDeVue, etapes: EtapesDesPopups) {
  if (nom === 'initiale') {
    const [cx, cz] = config.parcours.centre
    const [x, y, z] = p.position
    const rayon = Math.hypot(x - cx, z - cz)
    const dx = p.cible[0] - x
    const dz = p.cible[2] - z
    const d = Math.hypot(dx, dz)
    config.parcours.angleDepart = Math.atan2(x - cx, z - cz)
    config.parcours.rayonLointain = Math.round(rayon * 100) / 100
    config.parcours.hauteurLointain = y
    config.parcours.regardInitial = d > 0.01 ? y + ((p.cible[1] - y) * rayon) / d : p.cible[1]
    return
  }
  // Nouvelle liste d'étapes : une config peut partager la sienne avec une autre (salles/rotonde)
  const id = etapes[nom]
  config.etapes = config.etapes.map((e) => (e.id === id ? { ...e, position: [...p.position], cible: [...p.cible] } : e))
}

// Le fichier est réécrit par la vue libre, qui applique déjà le point de vue : pas de rechargement
if (import.meta.hot) import.meta.hot.accept('./points-de-vue.json', () => {})

const avecPoints = new WeakMap<SalleConfig, SalleConfig>()
/** La config de la salle avec ses points de vue réglés (une seule copie par config, partagée) */
export function avecPointsDeVue(config: SalleConfig, etapes: EtapesDesPopups): SalleConfig {
  const pts = pointsDeVue[config.id]
  if (!pts) return config
  let c = avecPoints.get(config)
  if (!c) {
    c = { ...config, parcours: { ...config.parcours } }
    for (const nom of ['initiale', 'maladie', 'manifeste'] as const) {
      const p = pts[nom]
      if (p) appliquerPointDeVue(c, nom, p, etapes)
    }
    avecPoints.set(config, c)
  }
  return c
}
