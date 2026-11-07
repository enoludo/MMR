import * as THREE from 'three'
import { Pass } from 'postprocessing'
import { CALQUE_REFLET } from './Reflet'

/**
 * Flou de la salle (07/11, idée de Ludovic : une profondeur de champ simulée, sans calcul sur la 3D) : la salle
 * est floutée selon la distance de chaque point à l'œuvre ; l'œuvre, elle, reste toujours nette.
 * - L'œuvre est dessinée seule dans un masque (objets du calque CALQUE_REFLET, qui ne porte que les sculptures),
 *   avec sa distance à la caméra : un pixel est de l'œuvre si elle y est au moins aussi proche que la scène (une
 *   colonne devant l'œuvre reste de la salle). Le verre, qui n'écrit pas sa profondeur, y compte : la salle vue au
 *   travers reste nette.
 * - Chaque pixel de la salle retrouve son point 3D (profondeur de la scène) ; sa distance à l'œuvre (un axe
 *   vertical, du sol à `haut`, au centre de la sculpture) donne sa part de flou : nette jusqu'à `debut` mètres, floue
 *   entièrement à `debut + progression`.
 * - Le flou est calculé en demi-résolution (deux passes, horizontale puis verticale), chaque prise pesée par sa
 *   propre part de flou : l'œuvre, nette, ne bave pas sur la salle floutée derrière elle. L'image finale mélange
 *   l'image nette et l'image floue selon la part de flou de chaque pixel.
 * Pendant un passage, l'œuvre de la salle d'arrivée compte aussi (la plus proche des deux). Réglages par salle :
 * touche M, « Flou de la salle · <salle> ». Indépendant de « effets actifs » et jamais coupé par l'échelle des renoncements
 * pour le moment (07/11, décision de Ludovic : ≈ 10 % d'images/s sur le M1 en 2560 × 1440).
 */

/** Réglages du flou d'une salle */
export interface ReglagesFlouSalle {
  actif: boolean
  /**
   * Force du flou selon la distance de la caméra à l'œuvre (07/11, demande de Ludovic : plus on est près de l'œuvre,
   * plus la salle est floue) : `flouPres` (rayon en pixels d'une image de 1080 de haut) à `pres` mètres de l'œuvre et
   * plus près, `flouLoin` à `loin` mètres et plus loin, en fondu entre les deux
   */
  flouPres: number
  flouLoin: number
  pres: number
  loin: number
  /** Distance à l'œuvre (m) jusqu'à laquelle la salle reste nette */
  debut: number
  /** Distance (m) sur laquelle le flou monte jusqu'au plus fort */
  progression: number
  /** Haut de l'axe de l'œuvre (m au-dessus du sol) */
  haut: number
}

export const FLOU_SALLE_DEFAUT: ReglagesFlouSalle = {
  actif: false,
  flouPres: 22,
  flouLoin: 4,
  pres: 2.5,
  loin: 9,
  debut: 2,
  progression: 10,
  haut: 4,
}

/** Distance d'un point à l'axe d'une œuvre (du pied, sur `haut` mètres vers le haut) : la même que dans le shader */
export function distanceAxe(p: THREE.Vector3, pied: THREE.Vector3, haut: number) {
  const y = Math.min(Math.max(p.y - pied.y, 0), haut)
  return Math.hypot(p.x - pied.x, p.y - pied.y - y, p.z - pied.z)
}

/** Rayon du flou (px pour 1080 de haut) quand la caméra est à `distance` mètres de l'œuvre */
export function rayonFlou(r: ReglagesFlouSalle, distance: number) {
  const t = THREE.MathUtils.smoothstep(distance, Math.min(r.pres, r.loin - 0.01), r.loin)
  return r.flouPres + (r.flouLoin - r.flouPres) * t
}

/** Nombre de prises de chaque côté, par passe de flou */
const PRISES = 7

const SOMMETS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`

/** Part de flou d'un pixel : 0 sur l'œuvre et près d'elle, 1 loin */
const GLSL_PART = /* glsl */ `
  uniform sampler2D tProfondeur;
  uniform sampler2D tMasque;
  uniform mat4 uProjectionInverse;
  uniform mat4 uCameraMonde;
  uniform vec3 uAxeA, uAxeB;   // pieds des axes des deux œuvres (salle actuelle, salle d'arrivée)
  uniform vec2 uHautA, uHautB; // haut de chaque axe, et présence de la salle (0 : pas de salle d'arrivée)
  uniform vec2 uDebut, uProgression;
  uniform float uForce;        // part de flou la plus forte (0 → 1 : en fondu, et mélangée pendant un passage)
  float distanceAxe(vec3 p, vec3 pied, float haut) {
    float y = clamp(p.y - pied.y, 0.0, haut);
    return length(p - (pied + vec3(0.0, y, 0.0)));
  }
  float partFlou(vec2 uv) {
    float z = texture2D(tProfondeur, uv).r;
    vec4 v = uProjectionInverse * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    v /= v.w;
    float distanceScene = -v.z;
    float oeuvre = texture2D(tMasque, uv).r;
    if (oeuvre > 0.0 && oeuvre <= distanceScene * 1.01 + 0.05) return 0.0;
    vec3 p = (uCameraMonde * vec4(v.xyz, 1.0)).xyz;
    float a = uHautA.y > 0.5 ? smoothstep(uDebut.x, uDebut.x + uProgression.x, distanceAxe(p, uAxeA, uHautA.x)) : 1.0;
    float b = uHautB.y > 0.5 ? smoothstep(uDebut.y, uDebut.y + uProgression.y, distanceAxe(p, uAxeB, uHautB.x)) : 1.0;
    return min(a, b) * uForce;
  }`

function uniformsPart() {
  return {
    tProfondeur: { value: null as THREE.Texture | null },
    tMasque: { value: null as THREE.Texture | null },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uCameraMonde: { value: new THREE.Matrix4() },
    uAxeA: { value: new THREE.Vector3() },
    uAxeB: { value: new THREE.Vector3() },
    uHautA: { value: new THREE.Vector2() },
    uHautB: { value: new THREE.Vector2() },
    uDebut: { value: new THREE.Vector2() },
    uProgression: { value: new THREE.Vector2(1, 1) },
    uForce: { value: 0 },
  }
}

export class PasseFlouSalle extends Pass {
  /** Œuvres suivies (repère du monde) : pied de l'axe, haut, réglages ; remplies à chaque image par Effets */
  readonly salles = [
    { presente: false, pied: new THREE.Vector3(), haut: 4, debut: 2, progression: 10 },
    { presente: false, pied: new THREE.Vector3(), haut: 4, debut: 2, progression: 10 },
  ]
  /** Part de flou la plus forte (0 → 1) */
  force = 0
  /** Rayon du flou le plus fort (pixels d'une image de 1080 de haut) */
  rayon = 14

  private principale: THREE.Camera
  private monde: THREE.Scene
  private masque = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
  private demi = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }))
  private uPart = uniformsPart()
  /** Œuvre seule : sa distance à la caméra (0 ailleurs) */
  private matiereMasque = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying float vDistance;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vDistance = -p.z;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      varying float vDistance;
      void main() { gl_FragColor = vec4(vDistance, 0.0, 0.0, 1.0); }`,
    side: THREE.DoubleSide,
  })
  /** Demi-résolution : quatre prises par pixel, pesées par leur part de flou (alpha) */
  private reduction = new THREE.ShaderMaterial({
    uniforms: { ...this.uPart, tCouleur: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: SOMMETS,
    fragmentShader: /* glsl */ `
      ${GLSL_PART}
      uniform sampler2D tCouleur;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec4 somme = vec4(0.0);
        float poids = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 uv = vUv + (vec2(float(i - (i / 2) * 2), float(i / 2)) - 0.5) * uTexel;
          float f = partFlou(uv);
          somme += vec4(texture2D(tCouleur, uv).rgb * f, f);
          poids += f;
        }
        gl_FragColor = poids > 0.0 ? vec4(somme.rgb / poids, somme.a * 0.25) : vec4(texture2D(tCouleur, vUv).rgb, 0.0);
      }`,
    depthTest: false,
    depthWrite: false,
  })
  /** Flou dans un sens (horizontal ou vertical), prises pesées par leur part de flou */
  private flou = new THREE.ShaderMaterial({
    uniforms: { tImage: { value: null }, uPas: { value: new THREE.Vector2() } },
    vertexShader: SOMMETS,
    fragmentShader: /* glsl */ `
      uniform sampler2D tImage;
      uniform vec2 uPas;
      varying vec2 vUv;
      void main() {
        vec4 centre = texture2D(tImage, vUv);
        vec3 somme = vec3(0.0);
        float poids = 0.0, part = 0.0, total = 0.0;
        for (int i = -${PRISES}; i <= ${PRISES}; i++) {
          float x = float(i) / ${PRISES}.0;
          float g = exp(-3.0 * x * x);
          vec4 c = texture2D(tImage, vUv + uPas * float(i));
          somme += c.rgb * g * c.a;
          poids += g * c.a;
          part += g * c.a;
          total += g;
        }
        gl_FragColor = poids > 1e-4 ? vec4(somme / poids, part / total) : vec4(centre.rgb, 0.0);
      }`,
    depthTest: false,
    depthWrite: false,
  })
  /** Image finale : nette sur l'œuvre, floue loin d'elle */
  private melange = new THREE.ShaderMaterial({
    uniforms: { ...this.uPart, tCouleur: { value: null }, tFlou: { value: null } },
    vertexShader: SOMMETS,
    fragmentShader: /* glsl */ `
      ${GLSL_PART}
      uniform sampler2D tCouleur;
      uniform sampler2D tFlou;
      varying vec2 vUv;
      void main() {
        vec4 nette = texture2D(tCouleur, vUv);
        float f = partFlou(vUv);
        vec3 floue = texture2D(tFlou, vUv).rgb;
        gl_FragColor = vec4(mix(nette.rgb, floue, f), nette.a);
      }`,
    depthTest: false,
    depthWrite: false,
  })
  private ecran = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.reduction)
  private camOrtho = new THREE.OrthographicCamera()
  private couleurFond = new THREE.Color()

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super('FlouSalle')
    this.monde = scene
    this.principale = camera
    this.needsDepthTexture = true
    this.ecran.frustumCulled = false
    for (const c of [this.masque, ...this.demi]) {
      c.texture.generateMipmaps = false
      c.texture.minFilter = c.texture.magFilter = THREE.LinearFilter
    }
    this.masque.texture.minFilter = this.masque.texture.magFilter = THREE.NearestFilter
    this.uPart.tMasque.value = this.masque.texture
  }

  setDepthTexture(texture: THREE.Texture) {
    this.uPart.tProfondeur.value = texture
  }

  setSize(largeur: number, hauteur: number) {
    this.masque.setSize(largeur, hauteur)
    for (const c of this.demi) c.setSize(Math.max(1, Math.round(largeur / 2)), Math.max(1, Math.round(hauteur / 2)))
  }

  private dessiner(renderer: THREE.WebGLRenderer, matiere: THREE.ShaderMaterial, cible: THREE.WebGLRenderTarget | null) {
    this.ecran.material = matiere
    renderer.setRenderTarget(cible)
    renderer.render(this.ecran, this.camOrtho)
  }

  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget | null) {
    const camera = this.principale as THREE.PerspectiveCamera
    const { width: w, height: h } = inputBuffer
    if (this.masque.width !== w || this.masque.height !== h) this.setSize(w, h)

    // 1. Masque de l'œuvre : les sculptures seules, sans fond, sans ombres, d'une seule matière
    const calques = camera.layers.mask
    const fondScene = this.monde.background
    const ombres = renderer.shadowMap.autoUpdate
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.couleurFond)
    camera.layers.set(CALQUE_REFLET)
    this.monde.background = null
    this.monde.overrideMaterial = this.matiereMasque
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(this.masque)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(this.monde, camera)
    this.monde.overrideMaterial = null
    this.monde.background = fondScene
    renderer.shadowMap.autoUpdate = ombres
    renderer.setClearColor(this.couleurFond, alpha)
    camera.layers.mask = calques

    // 2. Part de flou de chaque salle
    const u = this.uPart
    camera.updateMatrixWorld()
    u.uProjectionInverse.value.copy(camera.projectionMatrixInverse)
    u.uCameraMonde.value.copy(camera.matrixWorld)
    const [a, b] = this.salles
    u.uAxeA.value.copy(a.pied)
    u.uAxeB.value.copy(b.pied)
    u.uHautA.value.set(a.haut, a.presente ? 1 : 0)
    u.uHautB.value.set(b.haut, b.presente ? 1 : 0)
    u.uForce.value = this.force
    u.uDebut.value.set(a.debut, b.debut)
    u.uProgression.value.set(Math.max(a.progression, 0.01), Math.max(b.progression, 0.01))

    // 3. Demi-résolution, puis flou horizontal et vertical
    const [d0, d1] = this.demi
    this.reduction.uniforms.tCouleur.value = inputBuffer.texture
    this.reduction.uniforms.uTexel.value.set(1 / w, 1 / h)
    this.dessiner(renderer, this.reduction, d0)
    const pas = (this.rayon * h) / 1080 / 2 / PRISES // en pixels de la demi-résolution
    this.flou.uniforms.tImage.value = d0.texture
    this.flou.uniforms.uPas.value.set(pas / d0.width, 0)
    this.dessiner(renderer, this.flou, d1)
    this.flou.uniforms.tImage.value = d1.texture
    this.flou.uniforms.uPas.value.set(0, pas / d0.height)
    this.dessiner(renderer, this.flou, d0)

    // 4. Mélange de l'image nette et de l'image floue
    this.melange.uniforms.tCouleur.value = inputBuffer.texture
    this.melange.uniforms.tFlou.value = d0.texture
    this.dessiner(renderer, this.melange, this.renderToScreen ? null : outputBuffer)
  }

  dispose() {
    this.masque.dispose()
    for (const c of this.demi) c.dispose()
    for (const m of [this.matiereMasque, this.reduction, this.flou, this.melange]) m.dispose()
    this.ecran.geometry.dispose()
    super.dispose()
  }
}
