import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { SalleConfig, Vec3 } from '../salles/types'
import { store, useEtat, type Sens } from '../store'
import { CALQUE_REFLET } from './Reflet'
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

/** Radians parcourus par pixel de scroll (sens horaire vu du dessus) */
const RAD_PAR_PIXEL = 0.0012
/** Au point de vue d'un popup : après avoir tourné de cet angle autour de l'œuvre, on regarde son axe */
const TOUR_VERS_AXE = Math.PI / 3
/** Passage : on s'aligne sur l'axe de la porte à cette distance avant elle (et après la porte d'arrivée) */
const APPROCHE = 6
/** Passage, après le couloir : le regard vise ce point plus loin sur le trajet (m), amorti */
const REGARD_DEVANT = 12
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

  /** La vue initiale (vue d'arrivée, regard sans la souris), point d'arrivée de l'entrée depuis la spirale */
  const vueInitiale = () => ({
    centre: P().centre,
    angle: P().angleDepart,
    rayon: r.current.rayonLointain,
    hauteurYeux: P().hauteurYeux,
    regard: lerp(r.current.regardBas, r.current.regardHaut, reglagesTransition(salle.current).regard),
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
   * Avancer sur l'anneau ; depuis la vue d'arrivée, le premier scroll mène sur le cercle.
   * Au point de vue d'un popup, on tourne autour de l'œuvre sans quitter le popup (on n'en sort
   * que par la croix, un clic à côté ou Échap).
   */
  function avancer(radians: number) {
    const s = n.current
    if (s.mode === 'etape') {
      s.tourEtapeCible += radians
      if (radians !== 0) s.sens = Math.sign(radians)
      return
    }
    if (s.mode !== 'cercle') return
    if (s.anneau === 'loin' && radians !== 0) s.anneau = 'cercle'
    s.angleCible += radians
    if (radians !== 0) s.sens = Math.sign(radians)
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
   * Trajet vers la salle d'arrivée : le long du cercle (par le plus court), puis dans l'axe de
   * la porte quelques mètres avant elle, pour s'engager dans le couloir tout droit ; le couloir,
   * la porte d'arrivée, encore quelques mètres dans son axe, puis son cercle, en face d'elle.
   */
  function demarrerPassage(cle: number, arrivee: SalleConfig, sens: Sens) {
    const s = n.current
    const g = r.current
    const y = P().hauteurYeux
    const [cx, cz] = P().centre
    const { porte, porteArrivee } = portesDuPassage(salle.current, arrivee, sens)
    matricePlacement(placementArrivee(porte, porteArrivee), s.arrivee3d)

    const seuil = new THREE.Vector3(...porte.position)
    const dir = new THREE.Vector3(...porte.direction).normalize()
    const approche = seuil.clone().addScaledVector(dir, -APPROCHE).setY(y)
    const points = [camera.position.clone()]
    const ajouter = (v: THREE.Vector3) => {
      if (v.distanceTo(points[points.length - 1]) > 0.3) points.push(v)
    }
    const a0 = s.mode === 'cercle' ? s.angle : versCyl(camera.position).angle
    const r0 = s.mode === 'cercle' ? s.rayon : g.rayon
    const delta = enroule(Math.atan2(approche.x - cx, approche.z - cz) - a0)
    const nArc = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 4)))
    for (let i = 1; i <= nArc; i++) ajouter(depuisCyl({ angle: a0 + (delta * i) / nArc, rayon: r0, y }, new THREE.Vector3()))
    ajouter(approche)
    for (const f of [0, 0.5, 1]) ajouter(seuil.clone().addScaledVector(dir, LONGUEUR_COULOIR * f).setY(y))
    // Dans la salle d'arrivée : quelques mètres dans l'axe de sa porte, puis la vue initiale
    // (celle du chargement de la page : face à l'œuvre, à bonne distance), en contournant
    // l'œuvre sur l'anneau de la vue d'arrivée quand on entre par l'autre côté
    const pa = arrivee.parcours
    const [ax, az] = pa.centre
    // Rayon de la vue d'arrivée : celui de la salle d'arrivée
    const rl = reglagesNavigation(arrivee).rayonLointain
    const degagement = new THREE.Vector3(...porteArrivee.position)
      .addScaledVector(new THREE.Vector3(...porteArrivee.direction).normalize(), -APPROCHE)
      .setY(pa.hauteurYeux)
    const aSortie = Math.atan2(degagement.x - ax, degagement.z - az)
    ajouter(degagement.applyMatrix4(s.arrivee3d))
    s.angleArrivee = pa.angleDepart
    const deltaA = enroule(pa.angleDepart - aSortie)
    const nArcA = Math.max(1, Math.ceil(Math.abs(deltaA) / (Math.PI / 4)))
    for (let i = 1; i <= nArcA; i++) {
      const a = aSortie + (deltaA * i) / nArcA
      ajouter(
        new THREE.Vector3(ax + rl * Math.sin(a), pa.hauteurYeux, az + rl * Math.cos(a)).applyMatrix4(s.arrivee3d),
      )
    }

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
    const depart = visitee && groupesSalles.get(visitee.cle)
    if (depart && depart !== groupe) depart.visible = false
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
      if (horsVisite(e.target)) return
      e.preventDefault() // la page ne défile jamais
      let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (e.deltaMode === 1) d *= 16
      else if (e.deltaMode === 2) d *= window.innerHeight
      avancer(-d * RAD_PAR_PIXEL * r.current.vitesse)
    }

    const souris = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const s = n.current
      // Petite marge en haut et en bas : on atteint les extrêmes sans coller au bord
      s.souris = borner(1 - (e.clientY / window.innerHeight - 0.08) / 0.84) // souris en haut = regard vers le haut
      s.sourisX = borner((e.clientX / window.innerWidth) * 2 - 1, -1, 1)
    }

    // Au doigt : glisser horizontal = avancer, glisser vertical = regard
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
      avancer(dx * 2.2 * RAD_PAR_PIXEL * r.current.vitesse)
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
      if (appui && Math.hypot(e.clientX - appui.x, e.clientY - appui.y) < 8) cliquer(e.clientX, e.clientY)
      appui = null
    }
    let dernierSurvol = 0
    const survoler = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.timeStamp - dernierSurvol < 80) return
      dernierSurvol = e.timeStamp
      canvas.style.cursor = n.current.mode === 'cercle' && surLOeuvre(e.clientX, e.clientY) ? 'pointer' : ''
    }

    const clavier = (e: KeyboardEvent) => {
      if (horsVisite(e.target) || e.target instanceof HTMLInputElement) return
      const s = n.current
      if (e.key === 'ArrowRight') avancer(-0.2)
      else if (e.key === 'ArrowLeft') avancer(0.2)
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
    return () => {
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
      demarrerTransition({ angle: P().angleDepart, rayon: g.rayonLointain, y: P().hauteurYeux })
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
    if (s.enEntree && u >= 1) {
      s.enEntree = false
      entree.debut = entree.relais = null
    }
    const auto = s.mode === 'cercle' && !reduitMouvement() && !s.enEntree
    s.elan = auto ? amortir(s.elan, 1, 0.6, dt) : 0
    if (auto) s.angleCible += s.sens * THREE.MathUtils.degToRad(g.auto) * s.elan * dt

    s.angle = instant ? s.angleCible : amortir(s.angle, s.angleCible, g.amorti, dt)

    const { pos, cible } = tmp
    let fov = focale

    // L'anneau change (premier scroll, clic sur l'œuvre) : on s'approche ou s'éloigne en douceur
    s.rayon = instant || s.mode !== 'cercle' ? rayonDe(s.anneau) : amortir(s.rayon, rayonDe(s.anneau), 1.4, dt)

    if (s.mode === 'cercle') {
      depuisCyl({ angle: s.angle, rayon: s.rayon, y: P().hauteurYeux }, pos)
      cibleCercle(s.angle, cible)
      if (s.enEntree) {
        poseEntree(vueInitiale(), u, tmp.posEntree, tmp.cibleEntree)
        // En arrivant, on rend la main au regard à la souris (et au scroll, s'il a déjà servi)
        const k = lisseEntre(0.85, 1, u)
        pos.lerpVectors(tmp.posEntree, pos, k)
        cible.lerpVectors(tmp.cibleEntree, cible, k)
        fov = lerp(champEntree(u, focale, camera.aspect, reglagesTransition(salle.current).champEnPlus), focale, k)
      }
    } else if (s.mode === 'passage' && s.courbe && configArrivee) {
      s.t = s.duree > 0 ? Math.min(1, s.t + dt / s.duree) : 1
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
      cible.lerpVectors(s.departCible, s.bout, lisseEntre(0, 0.2, s.t))
      cible.lerp(s.devant, lisseEntre(0.5, 1, avance / LONGUEUR_COULOIR))
      cible.lerp(cibleArrivee(configArrivee, tmp.cibleCercle), Math.max(lisse(borner(sorti)), lisseEntre(0.9, 1, s.t)))
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
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
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
      capturerCartouches: async (nom: string) => {
        const { oeuvres } = await import('../oeuvres')
        const oeuvre = oeuvres.find((o) => o.id === nom)
        if (!oeuvre) throw new Error(`œuvre inconnue : ${nom}`)
        const m = await import('../outils/capture')
        return m.capturerCartouches({ gl, scene, camera, etat: n.current, etapes: salle.current.etapes, vues: oeuvre.vues, aller: allerEtape, retour: revenirAuCercle, nom })
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  return <ReglagesNavigationSalle key={config.id} config={config} />
}

/** Réglages de navigation d'une salle (touche M, « Navigation · <salle> ») */
export type ReglagesNavigation = {
  rayon: number
  rayonLointain: number
  rayonProche: number
  vitesse: number
  amorti: number
  regardBas: number
  regardHaut: number
  regardAmorti: number
  ecart: number
  auto: number
  duree: number
  dureePassage: number
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
      rayonLointain: p.rayonLointain,
      rayonProche: p.rayonProche,
      vitesse: 1,
      amorti: 3,
      regardBas: p.regard.bas,
      regardHaut: p.regard.haut,
      regardAmorti: 2.5,
      ecart: 0.6,
      auto: 1,
      duree: 2.8,
      dureePassage: 8,
    }
    navigationParSalle.set(config.id, g)
  }
  return g
}

/** Touche M : un dossier par salle (chaque salle a son parcours : une œuvre de 3 m n'est pas vue comme une œuvre de 10 m) */
function ReglagesNavigationSalle({ config }: { config: SalleConfig }) {
  const g = reglagesNavigation(config)
  const reglages = useControls(`Navigation · ${config.titre}`, {
    rayon: { value: g.rayon, min: 3, max: 14, step: 0.1, label: 'rayon du cercle (m)' },
    rayonLointain: { value: g.rayonLointain, min: 3, max: 14, step: 0.1, label: 'rayon de la vue d’arrivée (m)' },
    rayonProche: { value: g.rayonProche, min: 2, max: 9, step: 0.1, label: 'rayon du cercle réduit (m)' },
    vitesse: { value: g.vitesse, min: 0.2, max: 3, step: 0.05, label: 'vitesse du scroll' },
    amorti: { value: g.amorti, min: 0.5, max: 12, step: 0.1, label: 'réactivité du déplacement' },
    regardBas: { value: g.regardBas, min: 0, max: 6, step: 0.1, label: 'regard le plus bas, souris en bas (m)' },
    regardHaut: { value: g.regardHaut, min: 1, max: 14, step: 0.1, label: 'regard le plus haut, souris en haut (m)' },
    regardAmorti: { value: g.regardAmorti, min: 0.5, max: 12, step: 0.1, label: 'réactivité du regard' },
    ecart: { value: g.ecart, min: 0, max: 3, step: 0.05, label: 'écart horizontal du regard (m)' },
    auto: { value: g.auto, min: 0, max: 6, step: 0.1, label: 'déplacement auto (°/s)' },
    duree: { value: g.duree, min: 0.5, max: 6, step: 0.1, label: 'durée des transitions (s)' },
    dureePassage: { value: g.dureePassage, min: 1, max: 15, step: 0.1, label: 'durée du passage par le couloir (s)' },
  })
  Object.assign(g, reglages)
  return null
}
