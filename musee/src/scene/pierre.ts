import * as THREE from 'three'

/**
 * Matière « pierre » procédurale, sans texture image : aucun motif répété.
 *
 * La couleur de chaque point est calculée à partir de sa position dans
 * l'espace (bruit continu), en trois couches :
 *  - nuances : très grandes variations douces (plusieurs mètres), comme
 *    les différences entre blocs ou les traces du temps ;
 *  - voile : variations moyennes (dizaines de cm), à peine perceptibles ;
 *  - grain : grain fin de la pierre (millimètres / centimètres).
 * Les couches fines s'effacent automatiquement avec la distance
 * (anti-scintillement), ce qui garde une matière fine et calme.
 *
 * S'utilise sur un MeshBasicMaterial (la lumière vient de la lightmap).
 */
export type ReglagesPierre = { grain: number; voile: number; nuances: number }

/** K de l'encodage logarithmique de la lightmap (voir blender/lightmap.py) */
export type EncodageLightmap = { k: number }

/**
 * Reflet de la sculpture sur un sol horizontal (voir Reflet.tsx) : une image de la
 * sculpture vue depuis la caméra symétrique, lue à la position du pixel à l'écran.
 * L'alpha porte l'atténuation avec la hauteur ; le flou grandit quand on s'éloigne du contact.
 */
export type UniformsReflet = {
  tReflet: { value: THREE.Texture | null }
  uResolution: { value: THREE.Vector2 }
  uTexelReflet: { value: THREE.Vector2 }
  uForceReflet: { value: number }
  uFlouReflet: { value: number }
}

/**
 * Repère de la salle, commun à toutes ses matières. La salle peut être posée n'importe
 * où (au bout du couloir pendant un passage) : le grain de la pierre est calculé dans
 * son repère à elle, il ne bouge donc pas quand on la recale à l'origine.
 * Au-delà du plan de chaque porte, dans l'encadrement, le précalcul de Blender contient un
 * sas fermé derrière chaque porte (il empêche le ciel d'entrer) : il est masqué, le couloir est construit en direct (Couloir.tsx).
 */
export type UniformsSalle = {
  /** Monde → repère de la salle (inverse du placement de la salle) */
  uVersSalle: { value: THREE.Matrix4 }
  uPortePos: { value: THREE.Vector3[] }
  uPorteDir: { value: THREE.Vector3[] }
  /** Demi-largeur et hauteur de chaque ouverture */
  uPorteTaille: { value: THREE.Vector2[] }
  uNbPortes: { value: number }
}

/** Nombre de portes au plus par salle */
export const MAX_PORTES = 4

export function creerUniformsSalle(): UniformsSalle {
  const liste = <T,>(f: () => T) => Array.from({ length: MAX_PORTES }, f)
  return {
    uVersSalle: { value: new THREE.Matrix4() },
    uPortePos: { value: liste(() => new THREE.Vector3()) },
    uPorteDir: { value: liste(() => new THREE.Vector3(0, 0, -1)) },
    uPorteTaille: { value: liste(() => new THREE.Vector2()) },
    uNbPortes: { value: 0 },
  }
}

/**
 * Bruit précalculé pour le grain de la pierre : une valeur au hasard par case d'une grille
 * de 32 × 32 × 32, qui se répète. Le shader la lit avec le filtrage de la carte graphique :
 * une lecture de texture par couche au lieu de huit calculs (le grain était le poste le plus
 * lourd de la scène). Les couches sont à des fréquences sans rapport entier : leur somme ne
 * se répète pas de façon visible.
 */
const TAILLE_BRUIT = 32
export const textureBruit = (() => {
  const n = TAILLE_BRUIT
  const valeurs = new Uint8Array(n * n * n)
  let g = 12345
  for (let i = 0; i < valeurs.length; i++) {
    g = (g * 1103515245 + 12345) & 0x7fffffff
    valeurs[i] = g >> 23 // 8 bits de poids fort : 0 → 255
  }
  const t = new THREE.Data3DTexture(valeurs, n, n, n)
  t.format = THREE.RedFormat
  t.type = THREE.UnsignedByteType
  t.minFilter = t.magFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
})()

export function appliquerPierre(
  m: THREE.MeshBasicMaterial,
  r: ReglagesPierre,
  enc: EncodageLightmap,
  salle: UniformsSalle,
  reflet?: UniformsReflet,
) {
  const uniforms = {
    uK: { value: enc.k },
    uGrain: { value: r.grain },
    uVoile: { value: r.voile },
    uNuances: { value: r.nuances },
    uBruit: { value: textureBruit },
  }
  m.userData.pierre = uniforms
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, salle, reflet ?? {})
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform mat4 uVersSalle;\nvarying vec3 vPosPierre;\nvarying vec3 vPosSalle;\nvarying vec3 vNormPierre;',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vPosPierre = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vPosSalle = (uVersSalle * vec4(vPosPierre, 1.0)).xyz;
        vNormPierre = normalize(mat3(uVersSalle) * mat3(modelMatrix) * normal);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_PIERRE}\n${GLSL_PORTE}`)
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nif (auDelaDesPortes(vPosSalle)) discard;\ndiffuseColor.rgb *= pierre(vPosSalle, vNormPierre);',
      )
      // lightmap encodée en logarithmique : on la décode
      .replace('lightMapTexel.rgb * lightMapIntensity', 'decodeLightmap(lightMapTexel.rgb) * lightMapIntensity')
    if (reflet)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_REFLET}`)
        .replace('#include <tonemapping_fragment>', `${GLSL_REFLET_APPLIQUE}\n#include <tonemapping_fragment>`)
  }
  m.customProgramCacheKey = () => (reflet ? 'pierre-v7-reflet' : 'pierre-v7')
  m.needsUpdate = true
}

export function reglerPierre(m: THREE.MeshBasicMaterial, r: ReglagesPierre) {
  const u = m.userData.pierre
  if (!u) return
  u.uGrain.value = r.grain
  u.uVoile.value = r.voile
  u.uNuances.value = r.nuances
}

const GLSL_PORTE = /* glsl */ `
#define MAX_PORTES ${MAX_PORTES}
varying vec3 vPosSalle;
uniform vec3 uPortePos[MAX_PORTES];
uniform vec3 uPorteDir[MAX_PORTES];
uniform vec2 uPorteTaille[MAX_PORTES];
uniform int uNbPortes;

// Vrai pour ce qui se trouve derrière le plan d'une porte, dans son encadrement
bool auDelaDesPortes(vec3 p) {
  for (int i = 0; i < MAX_PORTES; i++) {
    if (i >= uNbPortes) break;
    vec3 q = p - uPortePos[i];
    vec3 d = uPorteDir[i];
    float profondeur = dot(q, d);
    float cote = abs(dot(q, vec3(-d.z, 0.0, d.x)));
    // dès le plan de la porte : le sas de Blender se superposerait aux parois du couloir (scintillement) ;
    // à toute hauteur : la fente zénithale de Blender se prolonge au-dessus du couloir, qui dessine la sienne
    if (profondeur > 0.0 && cote < uPorteTaille[i].x + 0.05) return true;
  }
  return false;
}
`

/** Grain de la pierre (bruit continu en trois couches) : partagé avec le couloir. */
export const GLSL_PIERRE = /* glsl */ `
varying vec3 vPosPierre;
varying vec3 vNormPierre;
uniform float uGrain;
uniform float uVoile;
uniform float uNuances;
uniform float uK;
uniform highp sampler3D uBruit;

vec3 decodeLightmap(vec3 v) {
  return (exp(v * log(1.0 + uK)) - 1.0) / uK;
}

// Bruit de valeur 3D lissé (continu) : une lecture de la texture de bruit (voir textureBruit).
// La position dans la case est lissée avant la lecture : le filtrage linéaire de la carte
// graphique donne alors la même interpolation douce qu'un calcul complet.
float bruit(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uBruit, (i + f + 0.5) / ${TAILLE_BRUIT}.0, 0.0).r * 2.0 - 1.0;
}

// Somme de couches, chacune effacée quand elle devient plus fine qu'un pixel
float couches(vec3 p, float freq, int n, float tailleP) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= n) break;
    float visible = 1.0 - smoothstep(0.25, 0.6, tailleP * freq);
    if (visible <= 0.0) break; // les couches suivantes, plus fines encore, ne se voient pas non plus
    s += a * bruit(p * freq + float(i) * 17.31) * visible;
    freq *= 2.03;
    a *= 0.5;
  }
  return s / (1.0 - pow(0.5, float(n))); // divisé par la somme des amplitudes des n couches
}

vec3 pierre(vec3 p, vec3 n) {
  float tailleP = length(fwidth(p)); // taille d'un pixel à l'écran, en mètres
  // décalage selon l'orientation : deux murs voisins ne portent pas le même dessin
  p += n * 13.7;
  float nuances = couches(p, 0.18, 3, tailleP);              // ~5 m
  float voile   = couches(p * vec3(1.0, 2.2, 1.0), 1.6, 3, tailleP); // ~60 cm, étiré à l'horizontale
  float grain   = couches(p, 28.0, 4, tailleP);              // ~3 cm et plus fin
  float v = 1.0 + nuances * uNuances + voile * uVoile + grain * uGrain;
  // légère variation de teinte : un peu plus chaud dans les zones claires
  return vec3(v) * mix(vec3(0.985, 1.0, 1.02), vec3(1.02, 1.0, 0.975), clamp(nuances * 0.5 + 0.5, 0.0, 1.0));
}
`

const GLSL_REFLET = /* glsl */ `
uniform sampler2D tReflet;
uniform vec2 uResolution;
uniform vec2 uTexelReflet;
uniform float uForceReflet;
uniform float uFlouReflet;

// Lecture floutée : net au contact (alpha fort), de plus en plus flou en s'éloignant
vec4 lireReflet() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 c = texture2D(tReflet, uv);
  float rayon = mix(1.0, uFlouReflet, 1.0 - c.a);
  vec4 s = c * 2.0;
  float w = 2.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.3927;
    vec2 o = vec2(cos(a), sin(a)) * rayon * uTexelReflet;
    s += texture2D(tReflet, uv + o) + texture2D(tReflet, uv + o * 0.45);
    w += 2.0;
  }
  return s / w;
}
`

const GLSL_REFLET_APPLIQUE = /* glsl */ `
if (uForceReflet > 0.0) {
  // Pierre mate : reflet léger, un peu plus présent en vue rasante (Fresnel)
  float rasant = 1.0 - clamp(normalize(cameraPosition - vPosPierre).y, 0.0, 1.0);
  float f = uForceReflet * (0.35 + 0.65 * pow(rasant, 4.0));
  vec4 r = lireReflet();
  gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - f * r.a) + r.rgb * f;
}
`
