import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { Porte, SalleConfig, Vec3 } from '../salles/types'
import { boutonCopier, dossierSalle, valeursEnregistrees } from '../reglages'
import { vueEnCours } from '../salles/pointsDeVue'
import { store, useEtat, type Sens } from '../store'
import { CALQUE_REFLET } from './Reflet'
import { regard } from './Effets'
import { avancee, champEntree, entree, poseEntree, reglagesTransition } from '../entree'
import { LONGUEUR_COULOIR, groupesSalles, matricePlacement, placementArrivee, portesDuPassage } from './passage'

/**
 * Navigation de la visite (caméra maison, sans CameraControls) :
 * - trois anneaux autour de l'œuvre, à hauteur d'yeux : la vue d'arrivée, lointaine
 *   (en entrant dans la salle) ; le cercle de la visite, où mène le premier scroll ; le
 *   cercle réduit, près de l'œuvre, où l'on va (et d'où l'on revient) en cliquant sur l'œuvre ;
 * - on avance le long de l'anneau en scrollant (molette, trackpad, glisser au doigt,
 *   flèches ← →) ; sans action, on y dérive très lentement, dans le sens du dernier scroll ;
 * - la caméra regarde toujours l'œuvre ; la hauteur de la souris dans la fenêtre
 *   règle le regard : du pied (souris en bas) au sommet (souris en haut) ;
 * - les popups Maladie et Manifeste mènent à des points de vue hors du cercle (étapes) ; on peut
 *   y tourner autour de l'œuvre (scroll, à leur distance et leur hauteur) et le regard y suit
 *   la souris comme sur le cercle ; en les fermant (croix, clic à côté, Échap), on revient sur
 *   le cercle, là où on l'avait quitté (décalé d'autant qu'on a tourné au point de vue) ;
 * - œuvre précédente / suivante : on longe le cercle jusqu'en face de la porte (l'entrée
 *   ou la sortie, voir portesDuPassage), on
 *   traverse le couloir et l'on entre dans la salle d'arrivée, posée au bout (passage.ts).
 *   Une fois arrivé, tout est recalé sur elle dans la même image.
 *
 * Tout l'état tient dans quelques nombres, amortis à chaque image.
 */

/** « sortie » : vers la vue initiale avant de rejoindre la spirale (voir ui/Transition.tsx), on y reste */
type Mode = 'cercle' | 'aller' | 'etape' | 'retour' | 'passage' | 'sortie'
/** Anneau sur lequel on tourne en mode « cercle » */
type Anneau = 'loin' | 'cercle' | 'pres'
/** Coordonnées cylindriques autour de l'axe de l'œuvre */
type Cyl = { angle: number; rayon: number; y: number }

/** Rapproche `actuel` de `cible`, indépendamment de la fréquence d'images */
const amortir = (actuel: number, cible: number, vitesse: number, dt: number) =>
  actuel + (cible - actuel) * (1 - Math.exp(-vitesse * dt))
/** Accélération puis décélération douces */
const doux = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** Accélération et freinage plus légers (vitesse de pointe 1,5 × la moyenne) */
const lisse = (t: number) => t * t * (3 - 2 * t)
const lisseEntre = (a: number, b: number, t: number) => lisse(borner((t - a) / (b - a)))
/**
 * Avancement du passage (0 → 1) : démarrage et arrêt en douceur, vitesse constante entre les
 * deux (1,25 × la moyenne au plus, au lieu de 1,5 au milieu du trajet, à l'entrée du couloir).
 */
const profilPassage = (t: number, a = 0.15, d = 0.25) => {
  const v = 1 / (1 - a / 2 - d / 2)
  const rampe = (y: number) => y * y * y - (y * y * y * y) / 2 // intégrale de lisse
  if (t < a) return v * a * rampe(t / a)
  if (t > 1 - d) return 1 - v * d * rampe((1 - t) / d)
  return v * (a / 2 + t - a)
}
const borner = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
/** Ramène un angle dans ]-π, π] */
const enroule = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const lerp = THREE.MathUtils.lerp

/**
 * Mètres parcourus par pixel de scroll (sens horaire vu du dessus) : la même distance à toutes les
 * distances de l'œuvre (vue d'arrivée, cercles, points de vue des popups), demande de Ludovic du
 * 01/11 ; autant que l'ancien réglage (0,0012 radian par pixel) sur un cercle de 9 m
 */
const M_PAR_PIXEL = 0.0108
/** Au-delà de ce déplacement (px), un appui est un glisser, plus un clic */
const SEUIL_GLISSER = 8
/** Flèches du clavier : un pas (m) */
const PAS_CLAVIER = 1.8
/** Au point de vue d'un popup : après avoir tourné de cet angle autour de l'œuvre, on regarde son axe */
const TOUR_VERS_AXE = Math.PI / 3
/** Passage : on s'aligne sur l'axe de la porte à cette distance avant elle (et après la porte d'arrivée) */
const APPROCHE = 6
/** Passage, après le couloir : le regard vise ce point plus loin sur le trajet (m), amorti */
const REGARD_DEVANT = 12
/**
 * Départ d'un passage (01/11, demande de Ludovic) : on se retourne d'abord sur place, de l'œuvre vers
 * le fond du couloir, en tournant (en ligne droite, le point regardé passait près de la caméra, qui
 * se retournait d'un coup, jusqu'à 360°/s), en un temps qui grandit avec l'angle (pointe à
 * `rotationPassage`, touche M) ; on se met en marche quand la tête a fait cette part de la rotation.
 */
const DEPART_MARCHE = 0.6
/** La marche est raccourcie du temps passé à se retourner avant de partir, jusqu'à cette part au plus */
const MARCHE_MIN = 0.8
/** Cap (vu du dessus) du point `p` depuis `o`, et sa distance horizontale */
const cap = (o: THREE.Vector3, p: THREE.Vector3) => Math.atan2(p.x - o.x, p.z - o.z)
const distanceSol = (o: THREE.Vector3, p: THREE.Vector3) => Math.hypot(p.x - o.x, p.z - o.z)
/** Passage : temps de réponse du regard (s), qui suit sa cible sans dépasser `rotationPassage` */
const REGARD_PASSAGE = 0.35
/**
 * Rapproche `actuel` de `cible` comme un ressort amorti (sans rebond), vitesse bornée à peu près à
 * `vmax` (SmoothDamp, Game Programming Gems 4) ; `etat.v` garde la vitesse d'une image à l'autre.
 */
function suivre(actuel: number, cible: number, etat: { v: number }, temps: number, vmax: number, dt: number) {
  if (dt <= 0) return actuel
  const omega = 2 / temps
  const x = omega * dt
  const amorti = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const ecart = borner(actuel - cible, -vmax * temps, vmax * temps)
  const visee = actuel - ecart
  const tmp = (etat.v + omega * ecart) * dt
  etat.v = (etat.v - omega * tmp) * amorti
  let sortie = visee + (ecart + tmp) * amorti
  if (cible - actuel > 0 === sortie > cible) {
    sortie = cible
    etat.v = 0
  }
  return sortie
}
/**
 * Point regardé entre `a` (k = 0) et `b` (k = 1) vus depuis `pos`, en tournant : cap dans le sens
 * `sens` (celui du départ, gardé même si la caméra, en avançant, fait passer l'écart au-delà du
 * demi-tour), inclinaison et distance en ligne droite.
 */
function regardEntre(pos: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, k: number, sens: number, out: THREE.Vector3) {
  const ca = cap(pos, a)
  let ecart = enroule(cap(pos, b) - ca)
  if (ecart * sens < -Math.PI / 2) ecart += 2 * Math.PI * sens
  const da = Math.max(0.5, distanceSol(pos, a))
  const db = Math.max(0.5, distanceSol(pos, b))
  const inclinaison = lerp(Math.atan2(a.y - pos.y, da), Math.atan2(b.y - pos.y, db), k)
  const c = ca + ecart * k
  const d = lerp(da, db, k)
  return out.set(pos.x + Math.sin(c) * d, pos.y + Math.tan(inclinaison) * d, pos.z + Math.cos(c) * d)
}
const reduitMouvement = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Navigation({
  config,
  configArrivee,
  focale,
}: {
  config: SalleConfig
  /** Salle d'arrivée pendant un passage */
  configArrivee: SalleConfig | null
  focale: number
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const canvas = useThree((s) => s.gl.domElement)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  // Salle où l'on est : celle de la page, ou déjà celle d'arrivée dès la fin d'un passage
  // (arriver(), avant que la page ne suive). Tout se lit ici, jamais dans une valeur gardée
  // d'un rendu précédent : sinon, à l'arrivée, on reprend un instant le parcours de la salle quittée
  const salle = useRef(config)
  const configPrecedente = useRef(config)
  if (configPrecedente.current !== config) {
    configPrecedente.current = config
    salle.current = config
  }
  const P = () => salle.current.parcours
  /** Réglages de navigation de la salle où l'on est (chaque salle a les siens) */
  const r = { get current() { return reglagesNavigation(salle.current) } }
  const p = config.parcours // valeurs de départ seulement

  // État de la navigation (mutable : rien ne doit provoquer de rendu React)
  const n = useRef({
    mode: 'cercle' as Mode,
    /** On entre dans la salle sur la vue d'arrivée, lointaine */
    anneau: 'loin' as Anneau,
    /** Rayon actuel, qui rejoint en douceur celui de l'anneau */
    rayon: p.rayonLointain,
    angle: p.angleDepart,
    angleCible: p.angleDepart,
    /** Angle du cercle au moment où l'on est parti vers une étape */
    angleMemoire: p.angleDepart,
    souris: 0.55, // 0 = bas de la fenêtre, 1 = haut
    sourisLisse: 0.55,
    sourisX: 0, // -1 = gauche, 1 = droite
    sourisXLisse: 0,
    etape: -1,
    /** Au point de vue d'un popup : angle dont on a tourné autour de l'œuvre (scroll), et sa cible */
    tourEtape: 0,
    tourEtapeCible: 0,
    /** Hauteur de la souris en partant vers le point de vue : le regard s'en écarte comme sur le cercle */
    sourisEtape: 0.55,
    /** Sens du déplacement automatique : celui du dernier scroll (-1 = horaire) */
    sens: -1,
    /** 0 → 1 : le déplacement automatique démarre en douceur (arrivée, retour d'étape) */
    elan: 0,
    /** Pas de déplacement automatique (photos des cartouches : la vue exacte du popup, outils/capture.ts) */
    immobile: false,
    /** Caméra posée de l'extérieur, image par image (vidéo du survol de la grille, outils/capture.ts) */
    pose: null as { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number } | null,
    /**
     * Entrée depuis la spirale (voir entree.ts) : la caméra avance en ligne droite jusqu'à la
     * vue d'arrivée, au rythme de l'image de la carte, qui s'efface par-dessus
     */
    enEntree: entree.debut !== null,
    // Transition en cours
    t: 0,
    duree: 1,
    depart: { angle: 0, rayon: 0, y: 0 } as Cyl,
    arrivee: { angle: 0, rayon: 0, y: 0 } as Cyl,
    departCible: new THREE.Vector3(),
    departFov: 55,
    // Passage vers une autre salle : trajet, placement de la salle d'arrivée, angle d'arrivée sur son cercle
    courbe: null as THREE.CatmullRomCurve3 | null,
    arrivee3d: new THREE.Matrix4(),
    angleArrivee: 0,
    cleArrivee: 0,
    /** Point regardé devant soi pendant le passage, amorti (pas d'à-coups dans les virages) */
    devant: new THREE.Vector3(),
    /** Passage : seuil et direction de la porte de départ, fond du couloir, fin du trajet */
    seuil: new THREE.Vector3(),
    dirPorte: new THREE.Vector3(),
    bout: new THREE.Vector3(),
    fin: new THREE.Vector3(),
    /** Passage : part du trajet (0 → 1) où le regard tourne vers le fond du couloir, et dans quel sens */
    /** Passage : temps écoulé depuis le début du retournement, sa durée et son sens (s) */
    pivot: 0,
    dureePivot: 0,
    sensTour: 1,
    /** Passage : cap et inclinaison du regard (radians), amortis et à vitesse bornée */
    capLisse: 0,
    inclLisse: 0,
    vCap: { v: 0 },
    vIncl: { v: 0 },
    // Image précédente
    cible: new THREE.Vector3(0, 4, 0),
    initialise: false,
  })

  // Vecteurs réutilisés
  const tmp = useRef({
    pos: new THREE.Vector3(),
    cible: new THREE.Vector3(),
    cibleCercle: new THREE.Vector3(),
    devant: new THREE.Vector3(),
    posEntree: new THREE.Vector3(),
    cibleEntree: new THREE.Vector3(),
    inverse: new THREE.Matrix4(),
  }).current

  const rayonDe = (a: Anneau) => {
    const g = r.current
    return a === 'loin' ? g.rayonLointain : a === 'pres' ? g.rayonProche : g.rayon
  }

  /**
   * Hauteur de l'œil sur un anneau : celle de la vue d'arrivée (réglable en vue libre) sur
   * l'anneau lointain, celle du cercle ailleurs, en glissant de l'une à l'autre avec le rayon
   */
  const hauteurAnneau = (rayon: number) => {
    const g = r.current
    const yeux = P().hauteurYeux
    const loin = P().hauteurLointain ?? yeux
    const k = g.rayonLointain - g.rayon > 0.01 ? borner((rayon - g.rayon) / (g.rayonLointain - g.rayon)) : 1
    return lerp(yeux, loin, k)
  }

  /** La vue initiale (vue d'arrivée, regard sans la souris), point d'arrivée de l'entrée depuis la spirale */
  const vueInitiale = () => ({
    centre: P().centre,
    angle: P().angleDepart,
    rayon: r.current.rayonLointain,
    hauteurYeux: P().hauteurLointain ?? P().hauteurYeux,
    regard: P().regardInitial ?? lerp(r.current.regardBas, r.current.regardHaut, reglagesTransition(salle.current).regard),
    recul: reglagesTransition(salle.current).recul,
  })

  const versCyl = (v: THREE.Vector3 | Vec3): Cyl => {
    const [cx, cz] = P().centre
    const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z]
    return { angle: Math.atan2(x - cx, z - cz), rayon: Math.hypot(x - cx, z - cz), y }
  }
  const depuisCyl = (c: Cyl, out: THREE.Vector3) => {
    const [cx, cz] = P().centre
    return out.set(cx + c.rayon * Math.sin(c.angle), c.y, cz + c.rayon * Math.cos(c.angle))
  }

  /** Point regardé depuis le cercle, selon la souris */
  const cibleCercle = (angle: number, out: THREE.Vector3) => {
    const s = n.current
    const { regardBas, regardHaut, ecart } = r.current
    const [cx, cz] = P().centre
    const lateral = s.sourisXLisse * ecart // vers la droite de l'écran
    return out.set(cx + Math.cos(angle) * lateral, lerp(regardBas, regardHaut, s.sourisLisse), cz - Math.sin(angle) * lateral)
  }

  /**
   * Vue au point de vue d'un popup (étape), tournée de `tourEtape` autour de l'axe de l'œuvre,
   * à la même distance et la même hauteur. Le point regardé tourne avec la caméra et rejoint
   * l'axe à mesure qu'on s'éloigne du point de vue (sinon on finirait par regarder le vide) ;
   * sa hauteur suit la souris, avec l'amplitude du cercle, à partir du regard de l'étape.
   */
  function vueEtape(e: SalleConfig['etapes'][number], pos: THREE.Vector3, cible: THREE.Vector3) {
    const s = n.current
    const c = versCyl(e.position)
    depuisCyl({ angle: c.angle + s.tourEtape, rayon: c.rayon, y: c.y }, pos)
    const ct = versCyl(e.cible)
    const versAxe = lisse(borner(Math.abs(s.tourEtape) / TOUR_VERS_AXE))
    depuisCyl({ angle: ct.angle + s.tourEtape, rayon: ct.rayon * (1 - versAxe), y: ct.y }, cible)
    // Amplitude du regard sur le cercle (angle entre regard bas et regard haut, vus depuis lui)
    const g = r.current
    const yeux = P().hauteurYeux
    const plage = Math.atan2(g.regardHaut - yeux, g.rayon) - Math.atan2(g.regardBas - yeux, g.rayon)
    const d = Math.hypot(cible.x - pos.x, cible.z - pos.z)
    const tangage = Math.atan2(cible.y - pos.y, d) + (s.sourisLisse - s.sourisEtape) * plage
    cible.y = pos.y + d * Math.tan(borner(tangage, -1.3, 1.3))
    return pos
  }

  function demarrerTransition(arrivee: Cyl) {
    const s = n.current
    s.depart = versCyl(camera.position)
    // On part de l'angle le plus proche, pour tourner par le plus court chemin
    s.depart.angle = arrivee.angle + enroule(s.depart.angle - arrivee.angle)
    s.arrivee = arrivee
    s.departCible.copy(s.cible)
    s.departFov = camera.fov
    const distance = depuisCyl(arrivee, tmp.pos).distanceTo(camera.position)
    s.duree = reduitMouvement() ? 0 : r.current.duree * borner(distance / 8, 0.6, 1.3)
    s.t = 0
  }

  function allerEtape(i: number) {
    const e = salle.current.etapes[i]
    const s = n.current
    if (!e || s.mode === 'passage' || s.mode === 'sortie') return
    if (s.mode === 'cercle' || s.mode === 'retour') s.angleMemoire = s.angle // position exacte sur l'anneau
    s.mode = 'aller'
    s.etape = i
    s.tourEtape = s.tourEtapeCible = 0
    s.sourisEtape = s.souris
    demarrerTransition(versCyl(e.position))
    store.set({ etape: i, arrive: false })
  }

  function revenirAuCercle() {
    const s = n.current
    if (s.mode === 'cercle' || s.mode === 'retour' || s.mode === 'passage' || s.mode === 'sortie') return
    // On a tourné autour de l'œuvre au point de vue : on retrouve le cercle d'autant plus loin
    if (s.mode === 'etape') s.angleMemoire += s.tourEtape
    s.tourEtape = s.tourEtapeCible = 0
    s.mode = 'retour'
    s.anneau = 'cercle' // on revient toujours sur le cercle de la visite
    s.angle = s.angleCible = s.angleMemoire
    demarrerTransition({ angle: s.angleMemoire, rayon: r.current.rayon, y: P().hauteurYeux })
    store.set({ etape: null, arrive: false })
  }

  /**
   * Retour sur le cercle demandé par le visiteur (Échap) depuis un point de vue :
   * le popup se referme et le premier écran revient (le tour libre).
   */
  function quitterEtape() {
    const s = n.current
    if (s.mode !== 'aller' && s.mode !== 'etape') return
    revenirAuCercle()
    store.set({ onglet: 'info' })
  }

  /**
   * Distance à l'axe de l'œuvre de l'orbite où l'on est (m) : point de vue du popup, ou anneau (celui
   * qu'on rejoint) ; les déplacements, donnés en mètres, y sont ramenés en angle
   */
  function rayonOrbite() {
    const s = n.current
    const r0 = s.mode === 'etape' ? versCyl(salle.current.etapes[s.etape].position).rayon : rayonDe(s.anneau)
    return Math.max(1, r0)
  }

  /**
   * Avancer de `metres` autour de l'œuvre ; depuis la vue d'arrivée, le premier scroll mène sur le
   * cercle. Au point de vue d'un popup, on tourne autour de l'œuvre sans quitter le popup (on n'en
   * sort que par la croix, un clic à côté ou Échap).
   */
  function avancer(metres: number) {
    const s = n.current
    if (s.mode === 'etape') {
      s.tourEtapeCible += metres / rayonOrbite()
      if (metres !== 0) s.sens = Math.sign(metres)
      return
    }
    if (s.mode !== 'cercle') return
    if (s.anneau === 'loin' && metres !== 0) s.anneau = 'cercle'
    s.angleCible += metres / rayonOrbite()
    if (metres !== 0) s.sens = Math.sign(metres)
  }

  /** Clic sur l'œuvre : on s'en approche (cercle réduit), ou l'on revient sur le cercle */
  const rayonClic = useRef(new THREE.Raycaster()).current
  const pointeur = useRef(new THREE.Vector2()).current
  function surLOeuvre(x: number, y: number) {
    const rect = canvas.getBoundingClientRect()
    pointeur.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
    rayonClic.setFromCamera(pointeur, camera)
    rayonClic.layers.set(CALQUE_REFLET) // seules les sculptures sont sur ce calque
    return rayonClic.intersectObjects(scene.children, true).some((i) => (i.object as THREE.Mesh).isMesh)
  }
  function cliquer(x: number, y: number) {
    const s = n.current
    if (s.mode !== 'cercle' || !surLOeuvre(x, y)) return
    s.anneau = s.anneau === 'pres' ? 'cercle' : 'pres'
  }

  /**
   * Trajet vers la salle d'arrivée, le plus direct possible (31/10 : les détours le long du cercle
   * faisaient des zigzags) : on ne longe l'anneau que le temps de voir le premier point du chemin
   * de la porte sans passer près de l'œuvre ni par une colonne (cheminLibre) ; puis le chemin de
   * la porte (Porte.chemin, ou quelques mètres dans son axe), le couloir, le chemin de la porte
   * d'arrivée, et l'anneau de la vue d'arrivée, rejoint au plus près de la vue initiale.
   */
  function demarrerPassage(cle: number, arrivee: SalleConfig, sens: Sens) {
    const s = n.current
    const g = r.current
    const y = P().hauteurYeux
    const { porte, porteArrivee } = portesDuPassage(salle.current, arrivee, sens)
    matricePlacement(placementArrivee(porte, porteArrivee), s.arrivee3d)

    const seuil = new THREE.Vector3(...porte.position)
    const dir = new THREE.Vector3(...porte.direction).normalize()
    const chemin = cheminPorte(porte).map((v) => v.setY(y))
    const points = [camera.position.clone()]
    const ajouter = (v: THREE.Vector3) => {
      if (v.distanceTo(points[points.length - 1]) > 0.3) points.push(v)
    }
    // Départ : tout droit vers le chemin de la porte, après avoir longé l'anneau s'il le faut
    const a0 = s.mode === 'cercle' ? s.angle : versCyl(camera.position).angle
    const r0 = s.mode === 'cercle' ? s.rayon : versCyl(camera.position).rayon
    // On ne passe pas plus près de l'œuvre que le cercle de la visite (ni que l'endroit d'où l'on part)
    const loin = Math.min(g.rayon * 0.9, r0 * 0.98)
    if (!cheminLibre(salle.current, camera.position, chemin[0], loin)) {
      const a1 = angleQuiVoit(salle.current, r0, a0, chemin[0], loin)
      arc(P().centre, r0, a0, a1, y).forEach(ajouter)
    }
    chemin.forEach(ajouter)
    for (const f of [0, 0.5, 1]) ajouter(seuil.clone().addScaledVector(dir, LONGUEUR_COULOIR * f).setY(y))
    // Dans la salle d'arrivée : le chemin de sa porte, puis l'anneau de la vue d'arrivée, rejoint
    // au plus près de la vue initiale (face à l'œuvre) et longé jusqu'à elle
    const pa = arrivee.parcours
    const rl = reglagesNavigation(arrivee).rayonLointain
    const yl = pa.hauteurLointain ?? pa.hauteurYeux
    const cheminA = cheminPorte(porteArrivee).reverse().map((v) => v.setY(pa.hauteurYeux))
    const dernier = cheminA[cheminA.length - 1]
    const a2 = angleQuiVoit(arrivee, rl, pa.angleDepart, dernier, Math.min(reglagesNavigation(arrivee).rayon * 0.9, rl * 0.98))
    const jonction = new THREE.Vector3(pa.centre[0] + rl * Math.sin(a2), yl, pa.centre[1] + rl * Math.cos(a2))
    for (const v of [...cheminA, jonction, ...arc(pa.centre, rl, a2, pa.angleDepart, yl)]) ajouter(v.applyMatrix4(s.arrivee3d))
    s.angleArrivee = pa.angleDepart

    s.seuil.copy(seuil)
    s.dirPorte.copy(dir)
    s.bout.copy(seuil).addScaledVector(dir, LONGUEUR_COULOIR).setY(y)
    s.fin.copy(points[points.length - 1])
    s.courbe = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    s.mode = 'passage'
    s.cleArrivee = cle
    s.t = 0
    s.duree = reduitMouvement() ? 0 : g.dureePassage * borner(s.courbe.getLength() / 40, 0.7, 1)
    s.departCible.copy(s.cible)
    s.devant.copy(s.cible)
    // Plus l'angle à parcourir pour regarder le fond du couloir est grand, plus on prend le temps
    // (vitesse moyenne aux deux tiers de la pointe, avec `lisse`)
    const ecart = enroule(cap(camera.position, s.bout) - cap(camera.position, s.cible))
    s.sensTour = ecart < 0 ? -1 : 1
    s.pivot = 0
    s.dureePivot = s.duree > 0 ? Math.abs(ecart) / ((THREE.MathUtils.degToRad(g.rotationPassage) * 2) / 3) : 0
    // Temps passé à tourner avant de partir (lisse(x) = DEPART_MARCHE pour x ≈ 0,57) : la marche est
    // raccourcie d'autant, pour que le passage ne s'allonge pas trop
    const attente = s.dureePivot * 0.5655
    s.duree = Math.max(s.duree * MARCHE_MIN, s.duree - attente)
    s.capLisse = cap(camera.position, s.cible)
    s.inclLisse = Math.atan2(s.cible.y - camera.position.y, Math.max(0.5, distanceSol(camera.position, s.cible)))
    s.vCap.v = s.vIncl.v = 0
    s.departFov = camera.fov
    s.elan = 0
    store.set({ etape: null, arrive: false })
  }

  /** Point regardé à l'arrivée (celui du cercle de la salle d'arrivée), dans le repère actuel */
  function cibleArrivee(arrivee: SalleConfig, out: THREE.Vector3) {
    const s = n.current
    const { ecart } = r.current
    const { regardBas, regardHaut } = reglagesNavigation(arrivee)
    const [ax, az] = arrivee.parcours.centre
    const lateral = s.sourisXLisse * ecart
    const a = s.angleArrivee
    return out
      .set(ax + Math.cos(a) * lateral, lerp(regardBas, regardHaut, s.sourisLisse), az - Math.sin(a) * lateral)
      .applyMatrix4(s.arrivee3d)
  }

  /**
   * Arrivée : la salle d'arrivée revient à l'origine, la caméra avec elle, la salle de
   * départ disparaît ; tout dans la même image, donc invisible à l'écran.
   */
  function arriver(pos: THREE.Vector3, cible: THREE.Vector3) {
    const s = n.current
    // On est désormais dans la salle d'arrivée : son parcours et ses réglages valent dès cette image
    if (configArrivee) salle.current = configArrivee
    tmp.inverse.copy(s.arrivee3d).invert()
    pos.applyMatrix4(tmp.inverse)
    cible.applyMatrix4(tmp.inverse)
    const { salle: visitee, passage } = store.get()
    const groupe = groupesSalles.get(s.cleArrivee)
    if (groupe) {
      groupe.position.set(0, 0, 0)
      groupe.rotation.set(0, 0, 0)
      groupe.updateMatrixWorld(true)
    }
    // La salle quittée disparaît, sauf le couloir traversé : le couloir de la porte d'arrivée, qui le remplace, n'est
    // monté qu'au rendu suivant de React ; sans lui, une image sans couloir (flash vu par Ludovic le 07/11). Il est
    // recalé avec la salle d'arrivée (même déplacement), donc immobile à l'écran
    const depart = visitee && groupesSalles.get(visitee.cle)
    if (depart && depart !== groupe) {
      tmp.inverse.decompose(depart.position, depart.quaternion, depart.scale)
      const couloir = depart.getObjectsByProperty('type', 'Group').find((o) => o.userData.couloirTraverse) ?? null
      // Tout est caché, sauf le chemin jusqu'au couloir (la salle est emballée dans des groupes intermédiaires)
      if (!couloir) depart.visible = false
      for (let o: THREE.Object3D | null = couloir; o && o !== depart && o.parent; o = o.parent)
        for (const voisin of o.parent.children) if (voisin !== o) voisin.visible = false
      depart.updateMatrixWorld(true)
    }
    s.mode = 'cercle'
    s.anneau = 'loin'
    s.rayon = r.current.rayonLointain
    s.courbe = null
    s.angle = s.angleCible = s.angleMemoire = s.angleArrivee
    s.elan = 0
    store.set({ salle: passage, passage: null })
  }

  // Demandes venant de l'interface (boutons d'étapes, fermeture du popup)
  const demande = useEtat((e) => e.demande)
  useEffect(() => {
    if (demande === null) return
    if (n.current.mode === 'passage') return store.set({ demande: null })
    if (demande === 'cercle') revenirAuCercle()
    else allerEtape(demande)
    store.set({ demande: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demande])

  // Entrées : molette / trackpad, souris, doigt, clavier
  useEffect(() => {
    const horsVisite = (cible: EventTarget | null) =>
      cible instanceof Element && !!cible.closest('.popup, .menu--ouvert, [class*="leva"]')

    const molette = (e: WheelEvent) => {
      if (store.get().libre) return // vue libre : la molette règle la vitesse (scene/VolLibre.tsx)
      if (horsVisite(e.target)) return
      e.preventDefault() // la page ne défile jamais
      let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (e.deltaMode === 1) d *= 16
      else if (e.deltaMode === 2) d *= window.innerHeight
      avancer(-d * M_PAR_PIXEL * r.current.vitesse)
    }

    const souris = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const s = n.current
      // Petite marge en haut et en bas : on atteint les extrêmes sans coller au bord
      s.souris = borner(1 - (e.clientY / window.innerHeight - 0.08) / 0.84) // souris en haut = regard vers le haut
      // Pendant un cliquer-glisser, le regard ne suit pas la souris de côté : seul le déplacement compte
      if (!prise?.glisse) s.sourisX = borner((e.clientX / window.innerWidth) * 2 - 1, -1, 1)
    }

    // À la souris (05/11, demande de Ludovic) : cliquer-glisser horizontal = avancer autour de l'œuvre,
    // dans le même sens qu'au doigt (sens choisi par Ludovic le 05/11) ; le regard suit toujours la hauteur de la souris. Un glisser
    // n'est pas un clic : il ne rapproche pas de l'œuvre et ne ferme pas le popup (`ignorerClic`)
    let prise: { id: number; x: number; distance: number; glisse: boolean } | null = null
    let ignorerClic = false
    const prendre = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || store.get().libre) return
      prise = { id: e.pointerId, x: e.clientX, distance: 0, glisse: false }
    }
    const tirer = (e: PointerEvent) => {
      if (!prise || e.pointerId !== prise.id) return
      if (!(e.buttons & 1)) return void (prise = null) // bouton relâché hors de la fenêtre
      const dx = e.clientX - prise.x
      prise.x = e.clientX
      prise.distance += Math.abs(dx)
      if (!prise.glisse && prise.distance >= SEUIL_GLISSER) {
        prise.glisse = true
        canvas.style.cursor = 'var(--curseur-deplacer)'
      }
      const s = n.current
      if (s.mode !== 'cercle' && s.mode !== 'etape') return
      avancer(-dx * r.current.glisser * M_PAR_PIXEL * r.current.vitesse)
    }
    const lacherPrise = (e: PointerEvent) => {
      if (!prise || e.pointerId !== prise.id) return
      if (prise.glisse) {
        ignorerClic = true
        setTimeout(() => (ignorerClic = false)) // le clic, s'il vient, suit aussitôt le relâchement
        canvas.style.cursor = curseur(e.clientX, e.clientY)
      }
      prise = null
    }
    // Avant tout autre écouteur de clic (celui du popup, sur window) : premier de la phase de capture
    const clicApresGlisser = (e: MouseEvent) => {
      if (!ignorerClic) return
      ignorerClic = false
      e.stopImmediatePropagation()
    }

    // Au doigt : glisser horizontal = avancer (sens inversé le 05/11, comme à la souris : demande de Ludovic), glisser vertical = regard
    let doigt: { id: number; x: number; y: number; distance: number } | null = null
    const toucher = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || doigt) return
      doigt = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0 }
    }
    const glisser = (e: PointerEvent) => {
      if (!doigt || e.pointerId !== doigt.id) return
      const dx = e.clientX - doigt.x
      const dy = e.clientY - doigt.y
      doigt.x = e.clientX
      doigt.y = e.clientY
      doigt.distance += Math.hypot(dx, dy)
      const s = n.current
      if (s.mode !== 'cercle' && s.mode !== 'etape') return
      avancer(-dx * 2.2 * M_PAR_PIXEL * r.current.vitesse)
      s.souris = borner(s.souris + (dy / window.innerHeight) * 1.3)
    }
    const lacher = (e: PointerEvent) => {
      if (doigt && e.pointerId === doigt.id) doigt = null
    }

    // Clic (souris ou doigt, sans glisser) sur l'œuvre ; à la souris, le curseur l'annonce
    let appui: { x: number; y: number } | null = null
    const appuyer = (e: PointerEvent) => {
      appui = { x: e.clientX, y: e.clientY }
    }
    const relacher = (e: PointerEvent) => {
      if (store.get().libre) return void (appui = null)
      if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) < SEUIL_GLISSER && !prise?.glisse) {
        cliquer(e.clientX, e.clientY)
        if (e.pointerType === 'mouse') canvas.style.cursor = curseur(e.clientX, e.clientY) // la loupe s'inverse aussitôt
      }
      appui = null
    }
    let dernierSurvol = 0
    const survoler = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.timeStamp - dernierSurvol < 80) return
      dernierSurvol = e.timeStamp
      if (prise?.glisse) return
      canvas.style.cursor = curseur(e.clientX, e.clientY)
    }
    // Curseurs de la maquette (style.css, --curseur-…) : sur l'œuvre, la loupe + si un clic rapproche
    // (cercle réduit), la loupe − si l'on y est déjà ; ailleurs, les flèches de déplacement (glisser
    // pour tourner autour de l'œuvre)
    const curseur = (x: number, y: number) => {
      const s = n.current
      if (s.mode === 'cercle' && surLOeuvre(x, y)) return s.anneau === 'pres' ? 'var(--curseur-zoom-arriere)' : 'var(--curseur-zoom-avant)'
      return s.mode === 'cercle' || s.mode === 'etape' ? 'var(--curseur-deplacer)' : ''
    }

    const clavier = (e: KeyboardEvent) => {
      if (store.get().libre || horsVisite(e.target) || e.target instanceof HTMLInputElement) return
      const s = n.current
      if (e.key === 'ArrowRight') avancer(-PAS_CLAVIER)
      else if (e.key === 'ArrowLeft') avancer(PAS_CLAVIER)
      else if (e.key === 'ArrowUp') s.souris = borner(s.souris + 0.15)
      else if (e.key === 'ArrowDown') s.souris = borner(s.souris - 0.15)
      else if (e.key === 'Escape') quitterEtape()
      else return
      e.preventDefault()
    }

    window.addEventListener('wheel', molette, { passive: false })
    window.addEventListener('pointermove', souris)
    canvas.addEventListener('pointerdown', toucher)
    canvas.addEventListener('pointerdown', appuyer)
    canvas.addEventListener('pointerup', relacher)
    canvas.addEventListener('pointermove', survoler)
    window.addEventListener('pointermove', glisser)
    window.addEventListener('pointerup', lacher)
    window.addEventListener('pointercancel', lacher)
    window.addEventListener('keydown', clavier)
    canvas.addEventListener('pointerdown', prendre)
    window.addEventListener('pointermove', tirer)
    window.addEventListener('pointerup', lacherPrise)
    window.addEventListener('pointercancel', lacherPrise)
    window.addEventListener('click', clicApresGlisser, true)
    return () => {
      canvas.removeEventListener('pointerdown', prendre)
      window.removeEventListener('pointermove', tirer)
      window.removeEventListener('pointerup', lacherPrise)
      window.removeEventListener('pointercancel', lacherPrise)
      window.removeEventListener('click', clicApresGlisser, true)
      window.removeEventListener('wheel', molette)
      window.removeEventListener('pointermove', souris)
      canvas.removeEventListener('pointerdown', toucher)
      canvas.removeEventListener('pointerdown', appuyer)
      canvas.removeEventListener('pointerup', relacher)
      canvas.removeEventListener('pointermove', survoler)
      window.removeEventListener('pointermove', glisser)
      window.removeEventListener('pointerup', lacher)
      window.removeEventListener('pointercancel', lacher)
      window.removeEventListener('keydown', clavier)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas])

  useFrame((_, delta) => {
    const s = n.current
    // Vue libre (touche V) : la caméra est à scene/VolLibre.tsx ; en revenant, on repart d'où l'on était
    if (store.get().libre) return void (s.initialise = false)
    if (s.pose) {
      camera.position.copy(s.pose.position)
      camera.quaternion.copy(s.pose.quaternion)
      camera.fov = s.pose.fov
      camera.updateProjectionMatrix()
      return
    }
    const g = r.current
    const dt = Math.min(delta, 0.1)
    const instant = !s.initialise

    s.sourisLisse = instant ? s.souris : amortir(s.sourisLisse, s.souris, g.regardAmorti, dt)
    s.sourisXLisse = instant ? s.sourisX : amortir(s.sourisXLisse, s.sourisX, g.regardAmorti, dt)

    // Retour à la spirale : on rejoint d'abord la vue initiale, d'où sera prise la photo de la salle
    const transition = store.get().transition
    if (transition?.sens === 'sortie' && transition.phase === 'retour' && s.mode !== 'sortie' && s.mode !== 'passage') {
      s.mode = 'sortie'
      s.enEntree = false
      demarrerTransition({ angle: P().angleDepart, rayon: g.rayonLointain, y: P().hauteurLointain ?? P().hauteurYeux })
      const distance = depuisCyl(s.arrivee, tmp.pos).distanceTo(camera.position)
      // 0,6 s au moins : le temps que le titre et les liens partent, lettre par lettre (ui/apparition.ts)
      s.duree = reduitMouvement() ? 0 : borner(distance / 10, 0.6, 2)
      store.set({ etape: null, arrive: false })
    }

    const passage = store.get().passage
    if (passage && s.mode !== 'passage' && configArrivee && groupesSalles.has(passage.cle)) {
      demarrerPassage(passage.cle, configArrivee, passage.sens)
    }

    // Déplacement automatique très lent sur le cercle (coupé si l'on préfère réduire les animations)
    const u = s.enEntree ? avancee() : 1
    // Avancée figée (captures, outils/capture.ts) : on reste sur le mouvement d'entrée, même au bout (vue initiale)
    if (s.enEntree && u >= 1 && entree.fige === null) {
      s.enEntree = false
      entree.debut = entree.relais = null
    }
    // Sur les anneaux et aux points de vue des popups, à la même vitesse (m/s) quelle que soit la distance
    const auto = (s.mode === 'cercle' || s.mode === 'etape') && !reduitMouvement() && !s.enEntree && !s.immobile
    s.elan = auto ? amortir(s.elan, 1, 0.6, dt) : 0
    if (auto) {
      const pas = (s.sens * g.vitesseAuto * s.elan * dt) / rayonOrbite()
      if (s.mode === 'etape') s.tourEtapeCible += pas
      else s.angleCible += pas
    }

    s.angle = instant ? s.angleCible : amortir(s.angle, s.angleCible, g.amorti, dt)

    const { pos, cible } = tmp
    let fov = focale

    // L'anneau change (premier scroll, clic sur l'œuvre) : on s'approche ou s'éloigne en douceur
    s.rayon = instant || s.mode !== 'cercle' ? rayonDe(s.anneau) : amortir(s.rayon, rayonDe(s.anneau), 1.4, dt)

    if (s.mode === 'cercle') {
      depuisCyl({ angle: s.angle, rayon: s.rayon, y: hauteurAnneau(s.rayon) }, pos)
      cibleCercle(s.angle, cible)
      if (s.enEntree) {
        poseEntree(vueInitiale(), u, tmp.posEntree, tmp.cibleEntree)
        // En arrivant, on rend la main au regard à la souris (et au scroll, s'il a déjà servi)
        const k = entree.fige !== null ? 0 : lisseEntre(0.85, 1, u)
        pos.lerpVectors(tmp.posEntree, pos, k)
        cible.lerpVectors(tmp.cibleEntree, cible, k)
        fov = lerp(champEntree(u, focale, camera.aspect, reglagesTransition(salle.current).champEnPlus), focale, k)
      }
    } else if (s.mode === 'passage' && s.courbe && configArrivee) {
      // On se retourne d'abord ; on se met en marche quand la tête a fait DEPART_MARCHE de la rotation
      s.pivot += dt
      const tour = s.dureePivot > 0 ? lisse(borner(s.pivot / s.dureePivot)) : 1
      if (tour >= DEPART_MARCHE) s.t = s.duree > 0 ? Math.min(1, s.t + dt / s.duree) : 1
      const u = profilPassage(s.t)
      s.courbe.getPointAt(u, pos)
      // Regard : d'abord le fond du couloir, un point fixe (la tête tourne à peine pendant qu'on
      // longe le cercle et qu'on s'engage dans le couloir) ; passé le milieu du couloir, vers où
      // l'on va (un point plus loin sur le trajet, suivi avec retard) ; enfin, l'œuvre d'arrivée
      const avance = (pos.x - s.seuil.x) * s.dirPorte.x + (pos.z - s.seuil.z) * s.dirPorte.z
      const sorti = avance > LONGUEUR_COULOIR ? pos.distanceTo(s.bout) / Math.max(1, s.fin.distanceTo(s.bout)) : 0
      const longueur = s.courbe.getLength()
      const uDevant = u + REGARD_DEVANT / longueur
      if (uDevant <= 1) s.courbe.getPointAt(uDevant, tmp.devant)
      else s.courbe.getPointAt(1, tmp.devant).add(s.courbe.getTangentAt(1, tmp.cible).multiplyScalar((uDevant - 1) * longueur))
      tmp.devant.setY(P().hauteurYeux)
      s.devant.x = amortir(s.devant.x, tmp.devant.x, 1.6, dt)
      s.devant.y = amortir(s.devant.y, tmp.devant.y, 1.6, dt)
      s.devant.z = amortir(s.devant.z, tmp.devant.z, 1.6, dt)
      regardEntre(pos, s.departCible, s.bout, tour, s.sensTour, cible)
      cible.lerp(s.devant, lisseEntre(0.5, 1, avance / LONGUEUR_COULOIR))
      // Vers l'œuvre d'arrivée, en tournant aussi (en ligne droite, le regard pivotait d'un coup)
      const versOeuvre = cibleArrivee(configArrivee, tmp.cibleCercle)
      const sensArrivee = enroule(cap(pos, versOeuvre) - cap(pos, cible)) < 0 ? -1 : 1
      regardEntre(pos, cible, versOeuvre, Math.max(lisse(borner(sorti)), lisseEntre(0.9, 1, s.t)), sensArrivee, cible)
      // Le regard suit ce point sans tourner plus vite que `rotationPassage` (sortie du couloir dans
      // une salle dont le chemin tourne fort, comme la rotonde) ; il le rejoint peu à peu, exactement à
      // l'arrivée (la durée du passage ne change pas : 01/11, Ludovic trouvait trop longs les passages
      // ralentis le temps que le regard rattrape son retard)
      const vmax = THREE.MathUtils.degToRad(g.rotationPassage)
      const capVise = s.capLisse + enroule(cap(pos, cible) - s.capLisse)
      const dVise = Math.max(0.5, distanceSol(pos, cible))
      const inclVise = Math.atan2(cible.y - pos.y, dVise)
      s.capLisse = suivre(s.capLisse, capVise, s.vCap, REGARD_PASSAGE, vmax, dt)
      s.inclLisse = suivre(s.inclLisse, inclVise, s.vIncl, REGARD_PASSAGE, vmax, dt)
      const exact = lisseEntre(0.8, 1, s.t)
      const c = lerp(s.capLisse, capVise, exact)
      const incl = lerp(s.inclLisse, inclVise, exact)
      cible.set(pos.x + Math.sin(c) * dVise, pos.y + Math.tan(incl) * dVise, pos.z + Math.cos(c) * dVise)
      fov = lerp(s.departFov, focale, lisseEntre(0, 0.3, s.t))
      if (s.t >= 1) arriver(pos, cible)
    } else if (s.mode === 'etape') {
      const e = salle.current.etapes[s.etape]
      s.tourEtape = instant ? s.tourEtapeCible : amortir(s.tourEtape, s.tourEtapeCible, g.amorti, dt)
      vueEtape(e, pos, cible)
      fov = e.focale ?? focale
    } else {
      // Transition dans l'espace, en coordonnées cylindriques autour de l'œuvre :
      // on contourne la sculpture au lieu de la traverser.
      s.t = s.duree > 0 ? Math.min(1, s.t + dt / s.duree) : 1
      const t = doux(s.t)
      const { depart: a, arrivee: b } = s
      // On s'éloigne de l'œuvre d'abord, on s'en approche en dernier
      const tr = b.rayon > a.rayon ? doux(borner(s.t / 0.75)) : doux(borner((s.t - 0.25) / 0.75))
      depuisCyl({ angle: lerp(a.angle, b.angle, t), rayon: lerp(a.rayon, b.rayon, tr), y: lerp(a.y, b.y, t) }, pos)

      let cibleFin: THREE.Vector3
      let fovFin = focale
      if (s.mode === 'aller') {
        const e = salle.current.etapes[s.etape]
        cibleFin = tmp.cibleCercle
        vueEtape(e, tmp.posEntree, cibleFin) // suit la souris pendant l'aller
        fovFin = e.focale ?? focale
      } else if (s.mode === 'sortie') {
        // Le regard de la vue initiale, sans la souris : celui de la capture de la carte
        poseEntree(vueInitiale(), 1, tmp.posEntree, tmp.cibleCercle)
        cibleFin = tmp.cibleCercle
      } else {
        cibleFin = cibleCercle(b.angle, tmp.cibleCercle) // suit la souris pendant le retour
      }
      cible.lerpVectors(s.departCible, cibleFin, t)
      fov = lerp(s.departFov, fovFin, t)

      if (s.t >= 1) {
        if (s.mode === 'aller') {
          s.mode = 'etape'
          store.set({ arrive: true })
        } else if (s.mode === 'sortie') {
          if (transition?.sens === 'sortie' && transition.phase === 'retour') store.set({ transition: { ...transition, phase: 'photo' } })
        } else {
          s.mode = 'cercle'
        }
      }
    }

    camera.position.copy(pos)
    camera.lookAt(cible)
    s.cible.copy(cible)
    regard.copy(cible) // mise au point de la profondeur de champ (Effets.tsx)
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const onglet = store.get().onglet
    vueEnCours.nom = onglet !== 'info' ? onglet : s.anneau === 'loin' && s.mode === 'cercle' ? 'initiale' : null
    s.initialise = true
  }, -2) // avant le reflet de la sculpture, qui recopie la caméra de cette image

  // Accès de mise au point (développement uniquement) : régler les étapes depuis la console
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__visite = {
      camera,
      scene,
      gl,
      get config() {
        return salle.current
      },
      etat: n.current,
      aller: allerEtape,
      retour: revenirAuCercle,
      avancer,
      cliquer,
      surLOeuvre,
      rayonClic,
      /** Capture de la vue d'entrée (image et profondeur), voir outils/capture.ts */
      capturer: (nom: string) =>
        import('../outils/capture').then((m) => m.capturer({ gl, scene, camera, etat: n.current, nom, focale, transition: reglagesTransition(salle.current) })),
      /** Photos des cartouches Maladie et Manifeste (points de vue des popups), voir outils/capture.ts */
      /** Vignette des flèches : la vue initiale (voir outils/capture.ts) */
      capturerVignette: (nom: string) =>
        import('../outils/capture').then((m) => m.capturerVignette({ gl, scene, camera, etat: n.current, nom })),
      capturerCartouches: async (nom: string) => {
        const { oeuvres } = await import('../oeuvres')
        const oeuvre = oeuvres.find((o) => o.id === nom)
        if (!oeuvre) throw new Error(`œuvre inconnue : ${nom}`)
        const m = await import('../outils/capture')
        return m.capturerCartouches({ gl, scene, camera, etat: n.current, etapes: salle.current.etapes, vues: oeuvre.vues, aller: allerEtape, retour: revenirAuCercle, nom })
      },
      /** Vidéo du survol de la vignette dans la grille : de la carte à la vue Maladie (voir outils/capture.ts) */
      capturerSurvol: async (nom: string) => {
        const { oeuvres } = await import('../oeuvres')
        const oeuvre = oeuvres.find((o) => o.id === nom)
        if (!oeuvre) throw new Error(`œuvre inconnue : ${nom}`)
        const m = await import('../outils/capture')
        return m.capturerSurvol({
          gl, scene, camera, etat: n.current, etapes: salle.current.etapes, vues: oeuvre.vues,
          aller: allerEtape, retour: revenirAuCercle, nom, transition: reglagesTransition(salle.current),
        })
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  return <ReglagesNavigationSalle key={config.id} config={config} />
}

/** Chemin de la porte dans la salle (Porte.chemin), ou un point à APPROCHE mètres dans son axe */
function cheminPorte(porte: Porte) {
  if (porte.chemin?.length) return porte.chemin.map((v) => new THREE.Vector3(...v))
  const dir = new THREE.Vector3(...porte.direction).normalize()
  return [new THREE.Vector3(...porte.position).addScaledVector(dir, -APPROCHE)]
}

/** Distance (à plat) du point c au segment ab */
function distanceSegment(ax: number, az: number, bx: number, bz: number, cx: number, cz: number) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 > 1e-9 ? borner(((cx - ax) * dx + (cz - az) * dz) / l2) : 0
  return Math.hypot(ax + dx * t - cx, az + dz * t - cz)
}

/**
 * Le segment a → b passe-t-il à plus de `loin` mètres de l'œuvre, et loin des obstacles de la salle
 * (colonnes) ? Les bancs ne comptent pas : la caméra passe au-dessus.
 */
function cheminLibre(config: SalleConfig, a: THREE.Vector3, b: THREE.Vector3, loin: number) {
  const [cx, cz] = config.parcours.centre
  if (distanceSegment(a.x, a.z, b.x, b.z, cx, cz) < loin) return false
  return (config.obstacles ?? []).every((o) => distanceSegment(a.x, a.z, b.x, b.z, o.centre[0], o.centre[1]) >= o.rayon)
}

/** Angle de l'anneau (rayon) le plus proche de `depart` d'où l'on va tout droit jusqu'à `cible` */
function angleQuiVoit(config: SalleConfig, rayon: number, depart: number, cible: THREE.Vector3, loin: number) {
  const [cx, cz] = config.parcours.centre
  const p = new THREE.Vector3()
  for (let k = 0; k <= 90; k++) {
    for (const sens of k ? [1, -1] : [1]) {
      const a = depart + sens * k * (Math.PI / 90)
      p.set(cx + rayon * Math.sin(a), 0, cz + rayon * Math.cos(a))
      if (cheminLibre(config, p, cible, loin)) return a
    }
  }
  return depart
}

/** Points d'un arc de l'anneau (centre, rayon), de l'angle a0 (exclu) à a1, par le plus court, tous les 30° au plus */
function arc(centre: [number, number], rayon: number, a0: number, a1: number, y: number) {
  const delta = enroule(a1 - a0)
  const n = Math.ceil(Math.abs(delta) / (Math.PI / 6))
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (delta * (i + 1)) / n
    return new THREE.Vector3(centre[0] + rayon * Math.sin(a), y, centre[1] + rayon * Math.cos(a))
  })
}

/** Réglages de navigation d'une salle (touche M, « Navigation · <salle> ») */
export type ReglagesNavigation = {
  rayon: number
  rayonLointain: number
  rayonProche: number
  vitesse: number
  /** Cliquer-glisser à la souris : déplacement par pixel, en multiple de celui du scroll */
  glisser: number
  amorti: number
  regardBas: number
  regardHaut: number
  regardAmorti: number
  ecart: number
  /** Déplacement automatique autour de l'œuvre (m/s) */
  vitesseAuto: number
  duree: number
  dureePassage: number
  /** Passage : vitesse de rotation du regard la plus grande (°/s) */
  rotationPassage: number
}

const navigationParSalle = new Map<string, ReglagesNavigation>()
/**
 * Les réglages de navigation d'une salle : son parcours, que la touche M modifie. Un seul objet
 * par salle, lu à chaque image : jamais ceux d'une autre salle, même quand deux salles sont
 * montées en même temps (passage, retour vers la spirale).
 */
export function reglagesNavigation(config: SalleConfig): ReglagesNavigation {
  let g = navigationParSalle.get(config.id)
  if (!g) {
    const p = config.parcours
    g = {
      rayon: p.rayon,
      rayonProche: p.rayonProche,
      vitesse: 1,
      glisser: 1.5,
      amorti: 3,
      regardBas: p.regard.bas,
      regardHaut: p.regard.haut,
      regardAmorti: 2.5,
      ecart: 0.6,
      vitesseAuto: 0.15,
      duree: 2.8,
      dureePassage: 8,
      rotationPassage: 90,
      ...(valeursEnregistrees(config, 'Navigation') as Partial<ReglagesNavigation>), // touche M, src/salles/reglages.json
      // La vue d'arrivée est la position initiale réglée en vue libre (salles/points-de-vue.json) :
      // un rayon enregistré par la touche M la contredisait au rechargement (04/11 : la transition
      // depuis la spirale, capturée à 14,21 m, arrivait dans une salle à 12,83 m)
      rayonLointain: p.rayonLointain,
    }
    navigationParSalle.set(config.id, g)
  }
  return g
}

/**
 * Touche M : un dossier par salle (chaque salle a son parcours : une œuvre de 3 m n'est pas vue comme
 * une œuvre de 10 m). Le rayon de la vue d'arrivée n'y est plus : il vient de la position initiale,
 * réglée en vue libre (touche V)
 */
function ReglagesNavigationSalle({ config }: { config: SalleConfig }) {
  const g = reglagesNavigation(config)
  const reglages = useControls(dossierSalle('Navigation', config), {
    ...boutonCopier(dossierSalle('Navigation', config)),
    rayon: { value: g.rayon, min: 3, max: 14, step: 0.1, label: 'rayon du cercle (m)' },
    rayonProche: { value: g.rayonProche, min: 2, max: 9, step: 0.1, label: 'rayon du cercle réduit (m)' },
    vitesse: { value: g.vitesse, min: 0.2, max: 3, step: 0.05, label: 'vitesse du scroll' },
    glisser: { value: g.glisser, min: 0.2, max: 5, step: 0.05, label: 'cliquer-glisser (× scroll)' },
    amorti: { value: g.amorti, min: 0.5, max: 12, step: 0.1, label: 'réactivité du déplacement' },
    regardBas: { value: g.regardBas, min: 0, max: 6, step: 0.1, label: 'regard le plus bas, souris en bas (m)' },
    regardHaut: { value: g.regardHaut, min: 1, max: 14, step: 0.1, label: 'regard le plus haut, souris en haut (m)' },
    regardAmorti: { value: g.regardAmorti, min: 0.5, max: 12, step: 0.1, label: 'réactivité du regard' },
    ecart: { value: g.ecart, min: 0, max: 3, step: 0.05, label: 'écart horizontal du regard (m)' },
    vitesseAuto: { value: g.vitesseAuto, min: 0, max: 1, step: 0.01, label: 'déplacement auto (m/s)' },
    duree: { value: g.duree, min: 0.5, max: 6, step: 0.1, label: 'durée des transitions (s)' },
    dureePassage: { value: g.dureePassage, min: 1, max: 15, step: 0.1, label: 'durée du passage par le couloir (s)' },
    rotationPassage: { value: g.rotationPassage, min: 10, max: 120, step: 1, label: 'passage : rotation du regard au plus (°/s)' },
  })
  Object.assign(g, reglages)
  return null
}
