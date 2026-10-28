import * as THREE from 'three'
import type { Cadre } from '../store'
import { CHAMP_EN_PLUS, FORMAT_CAPTURE, RECUL } from '../entree'

/**
 * Canvas plein écran des transitions spirale ↔ salle (piloté par ui/Transition.tsx) : il
 * dessine, dans une boîte aux coins arrondis posée sur la carte de la spirale, l'image de
 * l'œuvre ou la photo de la salle quittée.
 *
 * Parallaxe : quand l'œuvre a une capture de sa salle avec la profondeur de chaque pixel
 * (outils/capture.ts), l'image est déformée comme si la caméra avançait dans l'axe du regard :
 * le sol et l'œuvre, proches, grandissent plus vite que le fond. Pour chaque pixel, on remonte
 * le rayon de la caméra avancée, du plus proche au plus lointain, jusqu'à la première surface
 * de la capture (d'où l'œuvre qui recouvre bien le fond derrière elle).
 */

/** Réglages enregistrés avec une capture (fichier .json, voir outils/capture.ts) */
export type ReglagesCapture = {
  /** Champ de vision vertical de la capture (°) et focale de la salle (°) */
  champ: number
  focale: number
  format: number
  /** Profondeurs extrêmes encodées (m), en inverse de la distance */
  zProche: number
  zLoin: number
}

/** Ce que la boîte montre à une image donnée */
export type Dessin = {
  boite: Cadre
  /** Image de l'œuvre (et sa capture de salle, le cas échéant) */
  image: string
  vueEntree?: string
  /** Avancée de la caméra dans l'image (m) et champ du contenu (°) */
  avance: number
  champ: number
  /** Agrandissement de l'image dans la boîte (effet de masque ; 1 = elle la couvre juste) */
  zoom: number
  /** Photo de la salle quittée, et sa part dans le mélange (1 = photo seule) */
  photo?: HTMLCanvasElement | null
  melange?: number
  /** Vignette sombre de la salle, posée sur la boîte (0 → 1) : elle va et vient avec le plein écran */
  vignette: number
  /** Éclairage de l'image (lumière linéaire, 1 = telle quelle) : celui de la carte de la spirale, plus sombre */
  eclairage: number
  opacite: number
}

const VERTEX = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uImage;
uniform sampler2D uProf;
uniform sampler2D uPhoto;
uniform float uAvecProf;
uniform float uMelange;
uniform vec2 uEcran;      // pixels du canvas
uniform vec4 uBoite;      // centre (origine en haut à gauche), largeur, hauteur, en pixels du canvas
uniform float uAngle;     // radians, sens horaire à l'écran
uniform float uCoins;
uniform float uFormatImage;
uniform float uFormatPhoto;
uniform float uTan0;      // tan(champ de la capture / 2)
uniform float uTan;       // tan(champ du contenu / 2)
uniform float uZoom;      // agrandissement de l'image dans la boîte
uniform float uAvance;    // m
uniform vec2 uInvZ;       // 1 / zProche, 1 / zLoin
uniform float uOpacite;
uniform float uVignette;
uniform float uEclairage;
uniform float uAvancePhoto; // m
uniform float uTanPhoto;    // tan(champ vertical de la photo / 2)

// Coordonnées verticales normalisées (-1 → 1, y vers le haut) d'une image de format f qui couvre la boîte
vec2 couvrir(vec2 b, float formatBoite, float f) {
  float s = min(1.0, f / formatBoite);
  return vec2(b.x * formatBoite * s, -b.y * s);
}

vec2 uvCapture(vec2 q) { return vec2(q.x / (uTan0 * uFormatImage), q.y / uTan0) * 0.5 + 0.5; }

float profondeur(vec2 uv) {
  vec4 c = texture2D(uProf, vec2(uv.x, 1.0 - uv.y)); // image décodée sans retournement
  float w = (c.r * 255.0 * 256.0 + c.g * 255.0) / 65535.0;
  return 1.0 / mix(uInvZ.y, uInvZ.x, w);
}

// Vignette sombre de la salle (.salle-ui__vignette, style.css), rapportée à la boîte : dégradé
// radial « farthest-corner » (couleurs prémultipliées, comme le navigateur), en « produit » à 50 %
vec3 vignette(vec3 couleur, vec2 b) {
  float r = length(b) * 0.70710678;
  vec4 a = vec4(33.0, 23.0, 10.0, 255.0) / 255.0 * 0.5;
  vec4 m = vec4(17.0, 11.0, 5.0, 255.0) / 255.0 * 0.75;
  vec4 v = r < 0.5 ? a * (r / 0.5)
    : r < 0.75 ? mix(a, m, (r - 0.5) / 0.25)
    : mix(m, vec4(0.0, 0.0, 0.0, 1.0), clamp((r - 0.75) / 0.25, 0.0, 1.0));
  return couleur * (1.0 - 0.5 * uVignette * (v.a - v.rgb));
}

// Distance dans l'axe, depuis une caméra avancée de « avance », de la première surface de la capture
// sur le rayon « qv » (pente) : du plus proche au plus lointain, puis affinage par dichotomie.
// Pas en progression géométrique (≈ 14 % de la distance) : en pas réguliers sur l'inverse de la
// distance, il n'y en avait qu'un entre 10 et 80 m, et la sculpture était placée à 1 m près
float surface(vec2 qv, float avance) {
  const int N = 40;
  const float PRES = 0.5;
  float raison = pow(1.0 / (uInvZ.y * PRES), 1.0 / float(N));
  float lambdaAvant = PRES;
  float lambda = PRES;
  bool touche = false;
  for (int i = 1; i <= N; i++) {
    lambda *= raison;
    float z = lambda + avance;
    if (profondeur(uvCapture(qv * lambda / z)) <= z) { touche = true; break; }
    lambdaAvant = lambda;
  }
  if (!touche) return lambda;
  float a = lambdaAvant;
  float e = lambda;
  for (int j = 0; j < 8; j++) {
    float m = 0.5 * (a + e);
    float z = m + avance;
    if (profondeur(uvCapture(qv * m / z)) <= z) e = m; else a = m;
  }
  return e;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uEcran.y - gl_FragCoord.y);
  vec2 d = p - uBoite.xy;
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 l = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 demi = uBoite.zw * 0.5;
  vec2 q0 = abs(l) - demi + uCoins;
  float dist = length(max(q0, 0.0)) + min(max(q0.x, q0.y), 0.0) - uCoins;
  float alpha = clamp(0.5 - dist, 0.0, 1.0) * uOpacite;
  if (alpha <= 0.0) discard;
  vec2 b = l / demi;
  float formatBoite = uBoite.z / uBoite.w;

  // Image de l'œuvre, ou capture de sa salle vue de la caméra avancée
  vec2 qv = couvrir(b, formatBoite, uFormatImage) * uTan / uZoom;
  vec2 q = qv;
  // Distance (dans l'axe) de la caméra avancée à la surface vue, servie aussi à la photo
  float lambda = 1.0 / uInvZ.y;
  if (uAvecProf > 0.5 && (uAvance > 0.001 || uMelange > 0.0)) {
    lambda = surface(qv, uAvance);
    q = qv * lambda / (lambda + uAvance);
  }
  vec2 uvImage = uvCapture(q);
  vec3 couleur = texture2D(uImage, vec2(uvImage.x, 1.0 - uvImage.y)).rgb; // décodée sans retournement

  if (uMelange > 0.0) {
    // Photo de la salle, prise à la vue initiale (avancée uAvancePhoto, champ uTanPhoto) : on y lit
    // les mêmes rayons que dans l'image (même agrandissement, même champ), et le même point de la
    // salle grâce à la profondeur de la capture. Image et photo restent superposées pendant leur fondu.
    vec2 qp = qv;
    float part = uMelange;
    if (uAvecProf > 0.5) {
      float zp = lambda + uAvance - uAvancePhoto; // distance du point à la caméra de la photo
      if (zp > 0.05) {
        qp = qv * lambda / zp;
        // Caché, vu de la photo (le mur derrière le bord de l'œuvre) : l'image seule
        part *= 1.0 - smoothstep(0.02, 0.06, (zp - surface(qp, uAvancePhoto)) / zp);
      } else part = 0.0; // derrière elle : pas sur la photo
    }
    vec2 n = vec2(qp.x / uFormatPhoto, qp.y) / uTanPhoto;
    // Hors du cadre de la photo, l'image seule (bord adouci)
    part *= 1.0 - smoothstep(0.985, 1.0, max(abs(n.x), abs(n.y)));
    vec3 photo = texture2D(uPhoto, clamp(n * 0.5 + 0.5, 0.0, 1.0)).rgb;
    couleur = mix(couleur, photo, part);
  }
  if (uEclairage != 1.0) {
    // En lumière linéaire, comme le rendu de la carte (couleurs sRGB)
    vec3 lin = mix(couleur / 12.92, pow((couleur + 0.055) / 1.055, vec3(2.4)), step(0.04045, couleur)) * uEclairage;
    couleur = mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
  }
  if (uVignette > 0.0) couleur = vignette(couleur, b);
  gl_FragColor = vec4(couleur * alpha, alpha);
}
`

const images = new Map<string, Promise<THREE.Texture>>()
const profondeurs = new Map<string, Promise<THREE.Texture>>()
const reglages = new Map<string, Promise<ReglagesCapture>>()
const pretes = new Map<string, THREE.Texture | ReglagesCapture>()

function garder<T extends THREE.Texture | ReglagesCapture>(cle: string, p: Promise<T>) {
  p.then((v) => pretes.set(cle, v)).catch(() => {})
  return p
}

/** Image décodée hors du fil principal, octets exacts (couleurs recopiées telles quelles) */
const bitmap = (url: string) =>
  fetch(url)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))

function chargerImage(url: string) {
  if (!images.has(url))
    images.set(
      url,
      garder(
        'i' + url,
        bitmap(url).then((b) => {
          const t = new THREE.Texture(b)
          t.colorSpace = THREE.NoColorSpace
          t.flipY = false // ignoré pour une ImageBitmap : retournée dans le shader
          // Mipmaps : l'image reste nette quand la boîte est petite (carte de la spirale)
          t.minFilter = THREE.LinearMipmapLinearFilter
          t.anisotropy = 8
          t.needsUpdate = true
          toile?.envoyer(t)
          return t
        }),
      ),
    )
  return images.get(url)!
}

function chargerProfondeur(base: string) {
  if (!profondeurs.has(base))
    profondeurs.set(
      base,
      garder(
        'p' + base,
        // Octets exacts (profondeur codée sur 16 bits) : ni conversion de couleur, ni prémultiplication
        bitmap(`${base}-profondeur.png`)
          .then((b) => {
            const t = new THREE.Texture(b)
            t.colorSpace = THREE.NoColorSpace
            t.flipY = false
            t.minFilter = t.magFilter = THREE.NearestFilter // les deux octets ne s'interpolent pas
            t.generateMipmaps = false
            t.needsUpdate = true
            toile?.envoyer(t)
            return t
          }),
      ),
    )
  return profondeurs.get(base)!
}

function chargerReglages(base: string) {
  if (!reglages.has(base)) reglages.set(base, garder('r' + base, fetch(`${base}.json`).then((r) => r.json())))
  return reglages.get(base)!
}

/**
 * Prépare à l'avance ce que la transition affichera pour une œuvre (quand sa carte reste
 * centrée) : le canvas de la transition, ses images téléchargées, décodées et déjà envoyées à
 * la carte graphique. Le clic sur « Découvrir » ne fige plus l'écran.
 */
export function prechargerImages(image: string, vueEntree?: string) {
  obtenirToile()
  chargerImage(image)
  if (vueEntree) {
    chargerProfondeur(vueEntree)
    chargerReglages(vueEntree)
  }
}

/** L'image de l'œuvre est-elle prête à être dessinée par la transition ? */
export const imagePrete = (url: string) => pretes.has('i' + url)

/** Réglages de la capture de l'œuvre s'ils sont chargés, sinon ceux par défaut (image sans profondeur) */
export function reglagesCapture(vueEntree?: string): ReglagesCapture {
  const r = vueEntree && (pretes.get('r' + vueEntree) as ReglagesCapture | undefined)
  return r || { champ: 55 + CHAMP_EN_PLUS, focale: 55, format: FORMAT_CAPTURE, zProche: 1, zLoin: 60 }
}

let toile: ToileTransition | null = null
/** Le canvas des transitions, créé une fois pour toutes (un contexte WebGL de plus) */
export const obtenirToile = () => (toile ??= new ToileTransition())

export class ToileTransition {
  readonly canvas: HTMLCanvasElement
  private rendu: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private matiere: THREE.ShaderMaterial
  private photo: { source: HTMLCanvasElement; texture: THREE.CanvasTexture } | null = null
  private vide = new THREE.DataTexture(new Uint8Array(4), 1, 1)

  constructor() {
    this.rendu = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true })
    this.rendu.setClearColor(0x000000, 0)
    this.rendu.debug.checkShaderErrors = import.meta.env.DEV // voir Experience.tsx
    this.canvas = this.rendu.domElement
    this.canvas.className = 'transition__toile'
    this.vide.needsUpdate = true
    this.matiere = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      uniforms: {
        uImage: { value: this.vide },
        uProf: { value: this.vide },
        uPhoto: { value: this.vide },
        uAvecProf: { value: 0 },
        uMelange: { value: 0 },
        uEcran: { value: new THREE.Vector2() },
        uBoite: { value: new THREE.Vector4() },
        uAngle: { value: 0 },
        uCoins: { value: 0 },
        uFormatImage: { value: FORMAT_CAPTURE },
        uFormatPhoto: { value: 1 },
        uTan0: { value: 1 },
        uTan: { value: 1 },
        uZoom: { value: 1 },
        uAvance: { value: 0 },
        uInvZ: { value: new THREE.Vector2(1, 1 / 60) },
        uOpacite: { value: 1 },
        uVignette: { value: 0 },
        uEclairage: { value: 1 },
        uAvancePhoto: { value: RECUL },
        uTanPhoto: { value: 1 },
      },
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matiere)
    quad.frustumCulled = false
    this.scene.add(quad)
    // Compilation sans bloquer (le premier dessin n'attend plus le shader)
    this.rendu.compileAsync(this.scene, this.camera).catch(() => {})
  }

  /** Envoie une texture à la carte graphique dès qu'elle est prête, plutôt qu'au premier dessin */
  envoyer(t: THREE.Texture) {
    this.rendu.initTexture(t)
  }

  /** Dessine une image de la transition (les textures pas encore chargées sont demandées et sautées). */
  dessiner(d: Dessin) {
    const ratio = Math.min(window.devicePixelRatio, 2)
    const w = window.innerWidth
    const h = window.innerHeight
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.rendu.setPixelRatio(ratio)
      this.rendu.setSize(w, h)
    }
    const u = this.matiere.uniforms

    chargerImage(d.image)
    const image = pretes.get('i' + d.image) as THREE.Texture | undefined
    const prof = d.vueEntree ? (pretes.get('p' + d.vueEntree) as THREE.Texture | undefined) : undefined
    if (d.vueEntree) prechargerImages(d.image, d.vueEntree)
    const r = reglagesCapture(d.vueEntree)

    if (d.photo && this.photo?.source !== d.photo) {
      this.photo?.texture.dispose()
      const t = new THREE.CanvasTexture(d.photo)
      t.colorSpace = THREE.NoColorSpace
      t.minFilter = THREE.LinearFilter
      t.generateMipmaps = false
      this.photo = { source: d.photo, texture: t }
    }
    const melange = d.photo ? (d.melange ?? 1) : 0

    // Sans image ni photo à montrer, on laisse voir la carte de la spirale
    if (!image && melange <= 0) return this.effacer()

    const img = image?.image as { width: number; height: number } | undefined
    u.uImage.value = image ?? this.vide
    u.uFormatImage.value = img ? img.width / img.height : FORMAT_CAPTURE
    u.uProf.value = prof ?? this.vide
    u.uAvecProf.value = prof ? 1 : 0
    u.uPhoto.value = this.photo?.texture ?? this.vide
    u.uFormatPhoto.value = d.photo ? d.photo.width / d.photo.height : 1
    u.uMelange.value = image ? melange : 1
    u.uEcran.value.set(this.canvas.width, this.canvas.height)
    u.uBoite.value.set(d.boite.x * ratio, d.boite.y * ratio, d.boite.largeur * ratio, d.boite.hauteur * ratio)
    u.uAngle.value = d.boite.angle
    // Coins de la carte de la spirale (≈ 1,3 % de sa largeur), droits en plein écran
    u.uCoins.value = d.boite.largeur >= w - 0.5 ? 0 : d.boite.largeur * 0.0127 * ratio
    u.uTan0.value = Math.tan(THREE.MathUtils.degToRad(r.champ) / 2)
    u.uTan.value = Math.tan(THREE.MathUtils.degToRad(d.champ) / 2)
    u.uZoom.value = d.zoom
    u.uAvance.value = d.avance
    u.uInvZ.value.set(1 / r.zProche, 1 / r.zLoin)
    u.uOpacite.value = d.opacite
    u.uVignette.value = d.vignette
    u.uEclairage.value = d.eclairage
    // La photo est prise à la vue initiale (avancée RECUL), avec la focale de la salle
    u.uTanPhoto.value = Math.tan(THREE.MathUtils.degToRad(r.focale) / 2)
    this.rendu.render(this.scene, this.camera)
  }

  effacer() {
    this.rendu.clear()
  }
}
