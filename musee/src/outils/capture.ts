import * as THREE from 'three'
import { resolutionMax } from '../resolution'
import { FORMAT_CAPTURE, entree, type ReglagesTransition } from '../entree'
import type { ReglagesCapture } from '../ui/ToileTransition'

/**
 * Outil de développement : capture la « vue d'entrée » d'une salle (voir entree.ts), image et
 * profondeur, pour la transition depuis la spirale (parallaxe) et la carte de l'œuvre.
 *
 * Mode d'emploi (navigateur en 1280 × 720 avec un écran Retina, soit 2560 × 1440 pixels) :
 * ouvrir la salle de l'œuvre, attendre la fin du chargement, puis dans la console
 * `await __visite.capturer('le-seuil-des-proportions')`. Les fichiers arrivent dans
 * public/assets/captures (via vite.config.ts) : <nom>.webp (image dessinée en double
 * résolution, 5120 × 2880, nette pendant le zoom de la transition) et <nom>-profondeur.png à la
 * même résolution, leur version légère <nom>-2880.webp et <nom>-profondeur-2880.png, <nom>.json.
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
    gl.render(scene, camera)
    const image = document.createElement('canvas')
    image.width = gl.domElement.width
    image.height = gl.domElement.height
    image.getContext('2d')!.drawImage(gl.domElement, 0, 0)
    gl.setPixelRatio(ratio)

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
    return { image: `${image.width} × ${image.height}`, profondeur: `${prof.width} × ${prof.height}`, reglages }
  } finally {
    entree.fige = null
    etat.enEntree = false
  }
}
