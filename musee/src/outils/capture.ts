import * as THREE from 'three'
import { resolutionMax } from '../resolution'
import { FORMAT_CAPTURE, entree, type ReglagesTransition } from '../entree'
import type { ReglagesCapture } from '../ui/ToileTransition'
import { rendu } from '../scene/Effets'

/** L'image telle qu'à l'écran : avec les effets d'image s'ils sont actifs (Effets.tsx), sans le grain */
function dessiner(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  rendu.capture = true
  if (rendu.image) {
    rendu.redimensionner?.()
    rendu.image()
  } else gl.render(scene, camera)
  rendu.capture = false
}

/**
 * Outil de développement : capture la « vue d'entrée » d'une salle (voir entree.ts), image et
 * profondeur, pour la transition depuis la spirale (parallaxe) et la carte de l'œuvre.
 *
 * Mode d'emploi (navigateur en 1280 × 720 avec un écran Retina, soit 2560 × 1440 pixels) :
 * ouvrir la salle de l'œuvre, attendre la fin du chargement, puis dans la console
 * `await __visite.capturer('le-seuil-des-proportions')`. Les fichiers arrivent dans
 * public/assets/captures (via vite.config.ts) : <nom>.webp (image dessinée en double
 * résolution, 5120 × 2880, nette pendant le zoom de la transition) et <nom>-profondeur.png à la
 * même résolution, leur version légère <nom>-2880.webp et <nom>-profondeur-2880.png, <nom>.json,
 * et la vignette des flèches œuvre précédente / suivante, <nom>-vignette.webp (768 × 432 : la vue
 * initiale, voir capturerVignette).
 */

/** Largeur de la version légère (image et profondeur), voir versionLegere (version.ts) */
const LEGERE = 2880

const Z_PROCHE = 1
const Z_LOIN = 80

/** Profondeur (distance dans l'axe de la caméra) codée sur 16 bits en inverse de la distance, rouge = octet fort */
const matiereProfondeur = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying float vZ;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vZ = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying float vZ;
    uniform vec2 uInvZ;
    void main() {
      float w = clamp((1.0 / vZ - uInvZ.y) / (uInvZ.x - uInvZ.y), 0.0, 1.0);
      float v = floor(w * 65535.0 + 0.5);
      float fort = floor(v / 256.0);
      gl_FragColor = vec4(fort / 255.0, (v - fort * 256.0) / 255.0, 0.0, 1.0);
    }`,
  uniforms: { uInvZ: { value: new THREE.Vector2(1 / Z_PROCHE, 1 / Z_LOIN) } },
  side: THREE.DoubleSide,
})

const images = (n: number) => new Promise<void>((ok) => {
  const suivante = () => (--n <= 0 ? ok() : requestAnimationFrame(suivante))
  requestAnimationFrame(suivante)
})

const enBlob = (c: HTMLCanvasElement, type: string, qualite?: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), type, qualite))

async function envoyer(fichier: string, corps: Blob | string) {
  const r = await fetch(`/__capture?fichier=${fichier}`, { method: 'POST', body: corps })
  if (!r.ok) throw new Error(`${fichier} : ${await r.text()}`)
}

export async function capturer({
  gl,
  scene,
  camera,
  etat,
  nom,
  focale,
  transition,
}: {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** État de la navigation (Navigation.tsx) */
  etat: { enEntree: boolean }
  nom: string
  focale: number
  /** Réglages de transition de la salle (recul et champ de la vue d'entrée) */
  transition: ReglagesTransition
}) {
  const { width, height } = gl.domElement
  if (Math.abs(width / height - FORMAT_CAPTURE) > 0.01) throw new Error(`le canvas doit être en 16:9 (${width} × ${height})`)

  // La caméra sur la vue d'entrée, le temps que tout (reflet compris) suive
  etat.enEntree = true
  entree.fige = 0
  await images(4)
  try {
    // Image : telle qu'à l'écran, en double résolution
    // (à partir de la résolution pleine : la résolution adaptative a pu la baisser)
    const ratio = gl.getPixelRatio()
    gl.setPixelRatio(resolutionMax() * 2)
    dessiner(gl, scene, camera)
    const image = document.createElement('canvas')
    image.width = gl.domElement.width
    image.height = gl.domElement.height
    image.getContext('2d')!.drawImage(gl.domElement, 0, 0)
    gl.setPixelRatio(ratio)
    rendu.redimensionner?.()

    // Profondeur, sans la poussière ni le faisceau (transparents), sans lissage des bords
    const cachees: THREE.Object3D[] = []
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (o.visible && ((o as THREE.Points).isPoints || m?.transparent)) {
        o.visible = false
        cachees.push(o)
      }
    })
    // À la résolution de chaque image (l'entière et la légère) : un point de profondeur par pixel,
    // sinon le contour de l'œuvre se déplace par marches pendant la parallaxe (crénelage vu le 30/10)
    const profondeur = (lp: number, hp: number) => {
      const cible = new THREE.WebGLRenderTarget(lp, hp)
      scene.overrideMaterial = matiereProfondeur
      gl.setRenderTarget(cible)
      gl.render(scene, camera)
      gl.setRenderTarget(null)
      scene.overrideMaterial = null
      const octets = new Uint8Array(lp * hp * 4)
      gl.readRenderTargetPixels(cible, 0, 0, lp, hp, octets)
      cible.dispose()
      // readPixels part du bas : on remet l'image à l'endroit
      const prof = document.createElement('canvas')
      prof.width = lp
      prof.height = hp
      const ctx = prof.getContext('2d')!
      const donnees = ctx.createImageData(lp, hp)
      for (let y = 0; y < hp; y++) donnees.data.set(octets.subarray((hp - 1 - y) * lp * 4, (hp - y) * lp * 4), y * lp * 4)
      ctx.putImageData(donnees, 0, 0)
      return prof
    }
    const prof = profondeur(image.width, image.height)
    const profLegere = profondeur(LEGERE, Math.round(LEGERE / FORMAT_CAPTURE))
    cachees.forEach((o) => (o.visible = true))

    const reglages: ReglagesCapture & { recul: number } = {
      champ: camera.fov,
      focale,
      format: FORMAT_CAPTURE,
      zProche: Z_PROCHE,
      zLoin: Z_LOIN,
      recul: transition.recul,
    }
    if (Math.abs(camera.fov - (focale + transition.champEnPlus)) > 0.01) console.warn('champ inattendu', camera.fov)
    await envoyer(`${nom}.webp`, await enBlob(image, 'image/webp', 0.92))
    // Version légère, 2880 px de large (cartes de la spirale, écrans qui n'ont pas plus de pixels : version.ts)
    const legere = document.createElement('canvas')
    legere.width = LEGERE
    legere.height = Math.round(LEGERE / FORMAT_CAPTURE)
    const cl = legere.getContext('2d')!
    cl.imageSmoothingQuality = 'high'
    cl.drawImage(image, 0, 0, legere.width, legere.height)
    await envoyer(`${nom}-${LEGERE}.webp`, await enBlob(legere, 'image/webp', 0.92))
    await envoyer(`${nom}-profondeur.png`, await enBlob(prof, 'image/png'))
    await envoyer(`${nom}-profondeur-${LEGERE}.png`, await enBlob(profLegere, 'image/png'))
    await envoyer(`${nom}.json`, JSON.stringify(reglages, null, 2))
    await envoyerVignette(gl, scene, camera, nom)
    return { image: `${image.width} × ${image.height}`, profondeur: `${prof.width} × ${prof.height}`, reglages }
  } finally {
    entree.fige = null
    etat.enEntree = false
  }
}

/**
 * Vignette des flèches œuvre précédente / suivante : la vue principale de la salle (vue initiale, celle
 * où l'on arrive), telle qu'à l'écran, sans le décalage du premier écran. Refaite avec les captures et
 * chaque fois que la position initiale est enregistrée en vue libre (ui/VueLibre.tsx) ; canvas en 16:9.
 */
export async function capturerVignette({
  gl,
  scene,
  camera,
  etat,
  nom,
}: {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  etat: { enEntree: boolean }
  nom: string
}) {
  const { width, height } = gl.domElement
  if (Math.abs(width / height - FORMAT_CAPTURE) > 0.01) throw new Error(`le canvas doit être en 16:9 (${width} × ${height})`)
  etat.enEntree = true
  try {
    await envoyerVignette(gl, scene, camera, nom)
  } finally {
    entree.fige = null
    etat.enEntree = false
  }
}

/** La caméra au bout du mouvement d'entrée (la vue initiale), puis l'image réduite (mouvement d'entrée en cours) */
async function envoyerVignette(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, nom: string) {
  entree.fige = 1
  await images(4)
  dessiner(gl, scene, camera)
  await envoyer(`${nom}-vignette.webp`, await enBlob(vignette(gl.domElement), 'image/webp', 0.88))
}

/** Vignette des flèches (carte de 256 × 144 px à l'écran, ×3) : l'image réduite */
export function vignette(image: CanvasImageSource & { width: number; height: number }) {
  const c = document.createElement('canvas')
  c.width = 768
  c.height = 432
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, c.width, c.height)
  return c
}

/** Côté des photos des cartouches (192 px à l'écran, ×3) */
const COTE_CARTOUCHE = 576

/**
 * Photos des cartouches Maladie et Manifeste du premier écran (maquette 471:344) : la vue où va
 * la caméra à l'ouverture de chaque popup (Oeuvre.vues), sans le décalage dû au popup, recadrée
 * au carré au centre. Dans la salle de l'œuvre, sur le premier écran :
 * `await __visite.capturerCartouches('le-seuil-des-proportions')`. Fichiers :
 * public/assets/captures/<nom>-maladie.webp et <nom>-manifeste.webp. À refaire si la salle, la
 * lumière ou les points de vue changent.
 */
export async function capturerCartouches({
  gl,
  scene,
  camera,
  etat,
  etapes,
  vues,
  aller,
  retour,
  nom,
}: {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** État de la navigation (Navigation.tsx) */
  etat: { mode: string; immobile: boolean }
  etapes: { id: string }[]
  vues: Partial<Record<string, string | null>>
  aller: (i: number) => void
  retour: () => void
  nom: string
}) {
  const fichiers: string[] = []
  etat.immobile = true
  try {
    for (const onglet of ['maladie', 'manifeste']) {
      const i = etapes.findIndex((e) => e.id === vues[onglet])
      if (i < 0) throw new Error(`pas de point de vue pour ${onglet}`)
      aller(i)
      // Arrivée au point de vue, puis le temps que le regard et le reflet se posent
      while (etat.mode !== 'etape') await images(1)
      await images(30)

      const ratio = gl.getPixelRatio()
      gl.setPixelRatio(resolutionMax())
      dessiner(gl, scene, camera)
      const { width, height } = gl.domElement
      const cote = Math.min(width, height)
      const photo = document.createElement('canvas')
      photo.width = photo.height = COTE_CARTOUCHE
      const ctx = photo.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(gl.domElement, (width - cote) / 2, (height - cote) / 2, cote, cote, 0, 0, COTE_CARTOUCHE, COTE_CARTOUCHE)
      gl.setPixelRatio(ratio)
      rendu.redimensionner?.()

      const fichier = `${nom}-${onglet}.webp`
      await envoyer(fichier, await enBlob(photo, 'image/webp', 0.88))
      fichiers.push(fichier)
    }
  } finally {
    etat.immobile = false
  }
  retour()
  return fichiers
}

/** Vidéo du survol des vignettes de la grille : taille, cadence, débit (la durée est celle du trajet de la visite) */
const SURVOL = { largeur: 1280, hauteur: 720, images: 30, debit: 5_000_000 }

/** Pose de caméra imposée à la navigation, image par image (Navigation.tsx, `pose`) */
type Pose = { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number }
const lirePose = (camera: THREE.PerspectiveCamera): Pose => ({
  position: camera.position.clone(),
  quaternion: camera.quaternion.clone(),
  fov: camera.fov,
})
const lisseCubique = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * Vidéo du survol d'une vignette de la grille (essai du 03/11, demande de Ludovic) : la caméra part
 * de l'image de la carte et va au point de vue du popup Maladie. Première image = la carte : la vue
 * d'entrée, avec le champ réduit de l'agrandissement de la carte (`zoomCarte` : agrandir le centre
 * d'une image revient à resserrer le champ depuis le même point) ; puis une courbe qui part dans
 * l'axe du mouvement d'entrée (par la vue initiale) et rejoint la vue Maladie, champ et regard
 * glissant en même temps. Durée : celle du trajet de la visite de la vue initiale à la vue Maladie
 * (demande de Ludovic du 03/11). Dessinée image par image (fluide quelle que soit la machine), encodée
 * en MP4 (H.264) par le navigateur (WebCodecs, mp4-muxer), à l'endroit et à l'envers (le retour à la
 * première image quand la souris quitte la vignette ou au clic : les navigateurs ne lisent pas une
 * vidéo à l'envers).
 *
 * Dans la salle, navigateur en 1280 × 720 : `await __visite.capturerSurvol('le-seuil-des-proportions')`,
 * ou bouton « Vidéo du survol » de la vue libre (touche V). Fichiers : public/assets/captures/<nom>-survol.mp4
 * et <nom>-survol-retour.mp4.
 */
export async function capturerSurvol({
  gl,
  scene,
  camera,
  etat,
  etapes,
  vues,
  aller,
  retour,
  nom,
  transition,
}: {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** État de la navigation (Navigation.tsx) */
  etat: { mode: string; immobile: boolean; enEntree: boolean; duree: number; pose: Pose | null }
  etapes: { id: string }[]
  vues: Partial<Record<string, string | null>>
  aller: (i: number) => void
  retour: () => void
  nom: string
  transition: ReglagesTransition
}) {
  const { width, height } = gl.domElement
  if (Math.abs(width / height - FORMAT_CAPTURE) > 0.01) throw new Error(`le canvas doit être en 16:9 (${width} × ${height})`)
  const i = etapes.findIndex((e) => e.id === vues.maladie)
  if (i < 0) throw new Error('pas de point de vue pour maladie')
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const config: VideoEncoderConfig = {
    codec: 'avc1.640028',
    width: SURVOL.largeur,
    height: SURVOL.hauteur,
    bitrate: SURVOL.debit,
    framerate: SURVOL.images,
    avc: { format: 'avc' },
  }
  if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('encodage H.264 non disponible dans ce navigateur')

  // Les trois poses : vue d'entrée (la carte), vue initiale (au bout du mouvement d'entrée), vue Maladie
  etat.enEntree = true
  entree.fige = 0
  await images(4)
  const depart = lirePose(camera)
  depart.fov = (2 * Math.atan(Math.tan((depart.fov * Math.PI) / 360) / transition.zoomCarte) * 180) / Math.PI
  entree.fige = 1
  await images(4)
  const initiale = lirePose(camera)
  entree.fige = null
  etat.enEntree = false
  etat.immobile = true
  try {
    aller(i)
    // Durée du trajet de la visite vers la vue Maladie (Navigation.tsx, demarrerTransition)
    const duree = etat.duree > 0 ? etat.duree : 2
    while (etat.mode !== 'etape') await images(1)
    await images(30)
    const maladie = lirePose(camera)

    /** Un fichier MP4 : `ajouter` une image après l'autre, puis `finir` */
    const encodage = () => {
      const cible = new ArrayBufferTarget()
      const muxer = new Muxer({ target: cible, video: { codec: 'avc', width: SURVOL.largeur, height: SURVOL.hauteur }, fastStart: 'in-memory' })
      let erreur: unknown = null
      const encodeur = new VideoEncoder({ output: (morceau, meta) => muxer.addVideoChunk(morceau, meta), error: (e) => (erreur = e) })
      encodeur.configure(config)
      let k = 0
      return {
        ajouter(source: CanvasImageSource) {
          const trame = new VideoFrame(source, { timestamp: Math.round((k * 1e6) / SURVOL.images), duration: Math.round(1e6 / SURVOL.images) })
          encodeur.encode(trame, { keyFrame: k % SURVOL.images === 0 })
          trame.close()
          k++
          if (erreur) throw erreur
        },
        async finir() {
          await encodeur.flush()
          encodeur.close()
          muxer.finalize()
          return new Blob([cible.buffer], { type: 'video/mp4' })
        },
      }
    }
    const aLEndroit = encodage()
    /** Chaque image gardée (WebP), pour la vidéo à l'envers */
    const gardees: Blob[] = []
    const image = document.createElement('canvas')
    image.width = SURVOL.largeur
    image.height = SURVOL.hauteur
    const ctx = image.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'

    const pose: Pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: depart.fov }
    etat.pose = pose
    const ratio = gl.getPixelRatio()
    const n = Math.max(2, Math.round(duree * SURVOL.images))
    for (let k = 0; k < n; k++) {
      const t = lisseCubique(k / (n - 1))
      // Courbe de Bézier (départ, vue initiale, vue Maladie), regard et champ glissant ensemble
      pose.position
        .copy(depart.position)
        .multiplyScalar((1 - t) ** 2)
        .addScaledVector(initiale.position, 2 * (1 - t) * t)
        .addScaledVector(maladie.position, t * t)
      pose.quaternion.slerpQuaternions(depart.quaternion, maladie.quaternion, t)
      pose.fov = depart.fov + (maladie.fov - depart.fov) * t
      // Le temps que la navigation pose la caméra et que le reflet suive
      await images(2)
      if (gl.getPixelRatio() !== resolutionMax()) gl.setPixelRatio(resolutionMax())
      dessiner(gl, scene, camera)
      ctx.drawImage(gl.domElement, 0, 0, image.width, image.height)
      aLEndroit.ajouter(image)
      gardees.push(await enBlob(image, 'image/webp', 0.95))
    }
    gl.setPixelRatio(ratio)
    rendu.redimensionner?.()
    const aLEnvers = encodage()
    for (let k = n - 1; k >= 0; k--) {
      const bitmap = await createImageBitmap(gardees[k])
      aLEnvers.ajouter(bitmap)
      bitmap.close()
    }
    const video = await aLEndroit.finir()
    const videoRetour = await aLEnvers.finir()
    await envoyer(`${nom}-survol.mp4`, video)
    await envoyer(`${nom}-survol-retour.mp4`, videoRetour)
    return { fichiers: [`${nom}-survol.mp4`, `${nom}-survol-retour.mp4`], duree, images: n, octets: video.size + videoRetour.size }
  } finally {
    etat.pose = null
    etat.immobile = false
    retour()
  }
}
