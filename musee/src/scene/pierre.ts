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
export type EncodageLightmap = { k: number; echelle: number }

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

/**
 * Ombres précalculées (06/11, demande de Ludovic ; touche M « Salle · <salle> ») :
 * - « toutes les ombres » (`uOmbres`) : courbe sur la lumière précalculée, sous `uPivot` (lumière
 *   la plus vive de l'architecture, l'échelle de sa lightmap) : x → pivot × (x / pivot)^uOmbres.
 *   1 = le précalcul tel quel, moins = ombres plus claires, plus = plus profondes. Même courbe
 *   au raccord des couloirs (Couloir.tsx), en lumière absolue (décodée × échelle) : pas de marche
 *   entre deux lightmaps ni au seuil ;
 * - « ombre de la statue » (`uStatue`) : 1 = l'ombre précalculée, 0 = aucune. Le mobilier (sol du
 *   centre, socle) a été recalculé sans la statue (blender/sans-statue.py) ; le rapport avec / sans
 *   statue est une image en niveaux de gris (blender/ombre-statue.py), divisée de la lumière.
 * Un jeu par salle, partagé par ses matières et ses couloirs (`uniformsOmbres`).
 */
export type UniformsOmbres = {
  uOmbres: { value: number }
  uPivot: { value: number }
  uStatue: { value: number }
}
const ombresParSalle = new Map<string, UniformsOmbres>()
export function uniformsOmbres(idSalle: string): UniformsOmbres {
  let u = ombresParSalle.get(idSalle)
  if (!u) ombresParSalle.set(idSalle, (u = { uOmbres: { value: 1 }, uPivot: { value: 1 }, uStatue: { value: 1 } }))
  return u
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

/**
 * Joints du sol (07/11, pavillon : repère d'échelle demandé par Ludovic) : dalles de `longueur` × `largeur` m,
 * alignées (rangs décalés de `uJointsDecalage` dalle : 0 depuis le 07/11, demande de Ludovic ; 0,5 en quinconce), joint plus sombre de `joint` m, tournées de `angle` ; adoucis à l'écran (fwidth)
 * pour ne pas scintiller au loin. Réglés à la touche M (« Joints du sol · <salle> », Salle.tsx).
 */
export type UniformsJoints = {
  uJoints: { value: THREE.Vector4 } // longueur, largeur, joint, force
  uJointsAngle: { value: number }
  /** Décalage d'un rang sur l'autre, en part de dalle (0 : dalles alignées, 0,5 : en quinconce) */
  uJointsDecalage: { value: number }
}
export const creerUniformsJoints = (): UniformsJoints => ({
  uJoints: { value: new THREE.Vector4(1.2, 0.6, 0.004, 0.35) },
  uJointsAngle: { value: 0 },
  uJointsDecalage: { value: 0 },
})
const GLSL_JOINTS = /* glsl */ `
uniform vec4 uJoints;
uniform float uJointsAngle, uJointsDecalage;
float joints(vec3 p, vec3 n) {
  if (n.y < 0.9) return 1.0;
  float c = cos(uJointsAngle), s = sin(uJointsAngle);
  vec2 q = vec2(c * p.x - s * p.z, s * p.x + c * p.z);
  float rang = floor(q.y / uJoints.y);
  q.x += mod(rang, 2.0) * uJointsDecalage * uJoints.x;
  vec2 bord = (0.5 - abs(fract(q / uJoints.xy) - 0.5)) * uJoints.xy; // distance au joint le plus proche (m)
  vec2 w = fwidth(q);
  vec2 ligne = 1.0 - smoothstep(vec2(uJoints.z * 0.5) - w, vec2(uJoints.z * 0.5) + w, bord);
  // Au loin, le joint devient plus fin qu'un pixel : on l'estompe au lieu de le laisser scintiller
  float loin = clamp(uJoints.z / max(max(w.x, w.y), 1e-5), 0.0, 1.0);
  return 1.0 - uJoints.w * max(ligne.x, ligne.y) * mix(0.35, 1.0, loin);
}
`

/**
 * Lueur de l'œuvre sur la salle (07/11, pavillon : demande de Ludovic) : lumière ajoutée à la lumière précalculée,
 * qui suit les variations des bronches incandescentes (Salle.tsx, LueurOeuvre) ; décroît avec la distance au cœur
 * de l'œuvre (`uLueurPortee`), un peu plus forte sur les faces tournées vers elle.
 */
export type UniformsLueur = {
  uLueurPos: { value: THREE.Vector3 }
  uLueurCouleur: { value: THREE.Color }
  uLueurPortee: { value: number }
}
export const creerUniformsLueur = (): UniformsLueur => ({
  uLueurPos: { value: new THREE.Vector3() },
  uLueurCouleur: { value: new THREE.Color(0, 0, 0) },
  uLueurPortee: { value: 3 },
})
const GLSL_LUEUR = /* glsl */ `
uniform vec3 uLueurPos;
uniform vec3 uLueurCouleur;
uniform float uLueurPortee;
vec3 lueurOeuvre(vec3 p, vec3 n) {
  vec3 l = uLueurPos - p;
  float d2 = dot(l, l);
  float face = 0.35 + 0.65 * max(dot(n, l * inversesqrt(max(d2, 1e-4))), 0.0);
  return uLueurCouleur * face / (1.0 + d2 / (uLueurPortee * uLueurPortee));
}
`

export function appliquerPierre(
  m: THREE.MeshBasicMaterial,
  r: ReglagesPierre,
  enc: EncodageLightmap,
  salle: UniformsSalle,
  reflet: UniformsReflet | undefined,
  ombres: UniformsOmbres,
  rapportStatue?: THREE.Texture,
  joints?: UniformsJoints,
  lueur?: UniformsLueur,
) {
  const uniforms = {
    ...ombres,
    uEchelleLm: { value: enc.echelle },
    tRapportStatue: { value: rapportStatue ?? null },
    uK: { value: enc.k },
    uGrain: { value: r.grain },
    uVoile: { value: r.voile },
    uNuances: { value: r.nuances },
    uBruit: { value: textureBruit },
  }
  m.userData.pierre = uniforms
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, salle, reflet ?? {}, joints ?? {}, lueur ?? {})
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
      .replace('#include <common>', `#include <common>\n${GLSL_PIERRE}\n${GLSL_PORTE}\n${GLSL_LUMIERE}`)
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nif (auDelaDesPortes(vPosSalle)) discard;\ndiffuseColor.rgb *= pierre(vPosSalle, vNormPierre);' +
          (joints ? '\ndiffuseColor.rgb *= joints(vPosSalle, normalize(vNormPierre));' : ''),
      )
      // lightmap encodée en logarithmique : on la décode
      .replace('lightMapTexel.rgb * lightMapIntensity', 'lumierePrecalculee(lightMapTexel.rgb, vLightMapUv) * lightMapIntensity')
    if (joints) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_JOINTS}`)
    if (lueur)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_LUEUR}`)
        .replace(
          'lumierePrecalculee(lightMapTexel.rgb, vLightMapUv) * lightMapIntensity',
          '(lumierePrecalculee(lightMapTexel.rgb, vLightMapUv) * lightMapIntensity + lueurOeuvre(vPosSalle, normalize(vNormPierre)) * PI)',
        )
    if (reflet)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${GLSL_REFLET}`)
        .replace('#include <tonemapping_fragment>', `${GLSL_REFLET_APPLIQUE}\n#include <tonemapping_fragment>`)
  }
  if (rapportStatue) m.defines = { ...m.defines, RAPPORT_STATUE: '' }
  m.customProgramCacheKey = () => `pierre-v8${reflet ? '-reflet' : ''}${rapportStatue ? '-statue' : ''}${joints ? '-joints' : ''}${lueur ? '-lueur' : ''}`
  m.needsUpdate = true
}

export function reglerPierre(m: THREE.MeshBasicMaterial, r: ReglagesPierre) {
  const u = m.userData.pierre
  if (!u) return
  u.uGrain.value = r.grain
  u.uVoile.value = r.voile
  u.uNuances.value = r.nuances
}

/** Lumière précalculée d'une matière de la salle : ombre de la statue, puis courbe des ombres */
const GLSL_LUMIERE = /* glsl */ `
uniform float uEchelleLm;
uniform float uStatue;
uniform sampler2D tRapportStatue;
vec3 lumierePrecalculee(vec3 texel, vec2 uv) {
  vec3 x = decodeLightmap(texel) * uEchelleLm;
#ifdef RAPPORT_STATUE
  float r = max(texture2D(tRapportStatue, uv).r, 0.02);
  x *= mix(1.0 / r, 1.0, uStatue);
#endif
  return courbeOmbres(x) / uEchelleLm;
}
`

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

uniform float uOmbres;
uniform float uPivot;

vec3 decodeLightmap(vec3 v) {
  return (exp(v * log(1.0 + uK)) - 1.0) / uK;
}

// Ombres plus claires (uOmbres < 1) ou plus profondes (> 1) sous le pivot, teinte gardée
// (lumière absolue : décodée × échelle de la lightmap ; voir UniformsOmbres)
vec3 courbeOmbres(vec3 x) {
  float l = max((x.r + x.g + x.b) / 3.0, 1e-6);
  return l < uPivot ? x * (uPivot * pow(l / uPivot, uOmbres) / l) : x;
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
