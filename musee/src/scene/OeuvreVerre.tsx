import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { useReglagesSalle } from '../reglages'
import { CALQUE_REFLET, PasseReflet, type UniformsSculpture } from './Reflet'
import type { UniformsReflet } from './pierre'
import { GLSL_INCANDESCENCE, POINTS_BRONCHES, chaleurProcesseur, creerUniformsIncandescence, etatIncandescence, pointsBronches } from './incandescence'

/**
 * Œuvre de verre (« Souffle d'éclats », blender/souffle.py) : poumons de verre épais (deux surfaces) et vaisseaux
 * lumineux, sans éclairage calculé, d'après l'image de l'œuvre. Refait le 05/11 (« on dirait un gros ballon en
 * plastique ») : ce qui fait le verre, ce sont des arêtes de lumière nettes et des reflets précis, pas un dégradé.
 * - « Verre », en deux passes, ses deux faces :
 *   1. réfraction (depuis le 05/11) : la salle, rendue sans l'œuvre dans une image à part, est vue au travers,
 *      déviée, un peu irisée, bleuie (davantage au bord) ; avec « réfraction » à 0, simple absorption : ce qu'on
 *      voit au travers est assombri et bleui, sans déviation ;
 *   2. lumière ajoutée : arêtes cyan fines (Fresnel serré ; le verre épais les double), masse bleue nuageuse
 *      (poches sombres, zones claires), reflets de la lumière du hall par les ouvertures, modelé d'une lumière
 *      bleue venue d'en haut et ses éclats, qui accrochent les bosses et les scissures ;
 * - « Vaisseaux » : dessinés en dernier (rouge pur, ni absorbé ni teinté), en verre rouge depuis le 05/11
 *   (demande de Ludovic) : transparents au centre des tubes, denses au bord, reflets blancs (un trait de la
 *   lumière du modelé le long de chaque tube, les ouvertures de la salle) ; lacis fin presque opaque. Plus de
 *   fibres, d'anneaux sur la trachée ni d'éclats dessinés (retirés le 05/11).
 *   Le modèle donne pour chaque tube : UV = (tour, longueur en m), UV2 = (rayon, 1 pour la trachée), V retourné
 *   par l'export glTF (1 − v).
 * Depuis le 06/11, poumons du collègue de Ludovic (blender/poumons.py) : un seul maillage pour les poumons, sans
 * données dans les UV pour les bronches (« Vaisseaux ») : elles sont traitées comme de gros vaisseaux. Leurs textures
 * sont lues : couleur (« peinture » : teinte du verre, lumière ajoutée, couleur des bronches) et relief (normales).
 * Reflet au sol (07/11, demande de Ludovic) : la lumière du verre et les bronches sont dessinées dans la passe de reflet
 * (PasseReflet, comme les statues), éteintes avec la hauteur (« Reflet au sol · <salle> », atténuation) ; la réfraction
 * n'y est pas (elle lit l'image de la salle vue normalement).
 * Réglages : touche M, « Verre · <salle> ». Les maillages sont sur le calque de l'œuvre : un clic dessus mène au
 * cercle réduit, comme pour les autres œuvres (Navigation).
 */

const GLSL_ENTOURAGE = /* glsl */ `
  // Ce qui se reflète : la lumière du hall par les deux ouvertures de l'espace central (au sud-ouest et au
  // nord-est, à 11 m : ≈ 30° de large, jusqu'à 20° au-dessus de l'horizon), et la pénombre autour
  // (plus de lampes au plafond depuis le 05/11)
  float ouverture(vec3 r, vec2 cap) {
    vec2 h = normalize(r.xz + 1e-5);
    return smoothstep(0.955, 0.975, dot(h, cap)) * smoothstep(-0.18, -0.05, r.y) * (1.0 - smoothstep(0.3, 0.38, r.y));
  }
  // Puits de lumière au-dessus de l'œuvre (06/11) : disque blanc froid, vu de l'œuvre à ≈ 30° autour de la verticale
  vec3 entourage(vec3 r) {
    float baies = ouverture(r, normalize(vec2(-1.0, 1.0))) + ouverture(r, normalize(vec2(1.0, -1.0)));
    float puits = smoothstep(0.84, 0.88, r.y);
    return vec3(1.0, 0.95, 0.88) * baies * 2.2 + vec3(0.85, 0.9, 1.0) * puits * 2.5 + vec3(0.03 + 0.05 * max(r.y, 0.0));
  }`

const SOMMETS = /* glsl */ `
  varying vec3 vNormale;
  varying vec3 vVue;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vMonde;
  void main() {
    vec4 p = modelMatrix * vec4(position, 1.0);
    vNormale = normalize(mat3(modelMatrix) * normal);
    vVue = cameraPosition - p.xyz;
    vLocal = position;
    vUv = uv;
    vMonde = p.xyz;
    gl_Position = projectionMatrix * viewMatrix * p;
  }`

/**
 * Textures du modèle (poumons du collègue, 06/11) : couleur peinte et relief. Relief sans tangentes, d'après les
 * dérivées de la position et des UV à l'écran (comme three, perturbNormal2Arb).
 */
const GLSL_CARTES = /* glsl */ `
  uniform sampler2D uCarte, uRelief;
  uniform vec2 uEchelleRelief;
  uniform float uAvecCarte, uAvecRelief;
  varying vec2 vUv;
  varying vec3 vMonde;
  vec3 avecRelief(vec3 n) {
    if (uAvecRelief < 0.5) return n;
    vec3 q0 = dFdx(vMonde), q1 = dFdy(vMonde);
    vec2 st0 = dFdx(vUv), st1 = dFdy(vUv);
    vec3 q1perp = cross(q1, n), q0perp = cross(n, q0);
    vec3 t = q1perp * st0.x + q0perp * st1.x;
    vec3 b = q1perp * st0.y + q0perp * st1.y;
    float det = max(dot(t, t), dot(b, b));
    float e = det == 0.0 ? 0.0 : inversesqrt(det);
    vec3 m = texture2D(uRelief, vUv).xyz * 2.0 - 1.0;
    m.xy *= uEchelleRelief;
    return normalize(t * (m.x * e) + b * (m.y * e) + n * m.z);
  }
  vec3 peinture() { return uAvecCarte > 0.5 ? texture2D(uCarte, vUv).rgb : vec3(1.0); }`

/** Uniforms des textures du modèle, remplis à partir de ses matières (voir plus bas) */
const uniformsCartes = () => ({
  uCarte: { value: null as THREE.Texture | null },
  uRelief: { value: null as THREE.Texture | null },
  uEchelleRelief: { value: new THREE.Vector2(1, 1) },
  uAvecCarte: { value: 0 },
  uAvecRelief: { value: 0 },
})
type UniformsCartes = ReturnType<typeof uniformsCartes>

/** Teinte du verre : celle du réglage, mêlée à la couleur peinte du modèle (« peinture » : 0 à 1) */
const GLSL_TEINTE = /* glsl */ `
  uniform float uPeinture;
  vec3 teinteVerre(vec3 teinte) { return uAvecCarte > 0.5 ? mix(teinte, peinture(), uPeinture) : teinte; }`

/** Bruit lisse en 3D (valeurs au hasard aux nœuds d'une grille, interpolées) et sa somme sur trois octaves */
const GLSL_BRUIT = /* glsl */ `
  float hasard(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float bruit(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hasard(i), hasard(i + vec3(1, 0, 0)), f.x), mix(hasard(i + vec3(0, 1, 0)), hasard(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hasard(i + vec3(0, 0, 1)), hasard(i + vec3(1, 0, 1)), f.x), mix(hasard(i + vec3(0, 1, 1)), hasard(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float nuages(vec3 p) { return 0.55 * bruit(p) + 0.3 * bruit(p * 2.1 + 3.1) + 0.15 * bruit(p * 4.3 + 7.7); }`

// Valeurs basses : l'exposition de la salle (×3,4) s'applique aussi à l'œuvre ; au-delà de ≈ 1 après exposition,
// la courbe de couleurs pâlit le rouge en saumon et le bleu en lavande
export function OeuvreVerre({ config, modele, uSol, longueurReflet }: {
  config: SalleConfig
  modele: string
  uSol: UniformsReflet
  longueurReflet: number
}) {
  const gltf = useGLTF(modele)
  // Mode « reflet » des matières, piloté par la passe de reflet (seuls uReflet et uLongueurReflet servent ici)
  const uSculpture = useMemo<UniformsSculpture>(
    () => ({ uOcclusion: { value: 0 }, uOcclusionDirecte: { value: 0 }, uReflet: { value: 0 }, uLongueurReflet: { value: 1.4 } }),
    [],
  )
  uSculpture.uLongueurReflet.value = longueurReflet
  // Incandescence des bronches (07/11) : chauffe, rythme et couleurs, partagés par les bronches et le verre
  const uChauffe = useMemo(creerUniformsIncandescence, [])
  // Lumière des bronches jetée dans le verre : points tirés sur les bronches (repère du modèle), force et portée
  const uLumiereVerre = useMemo(
    () => ({
      uPointsBronches: { value: Array.from({ length: POINTS_BRONCHES }, () => new THREE.Vector3(0, -100, 0)) },
      uVerreLumiere: { value: 0.6 },
      uVerrePortee: { value: 0.45 },
    }),
    [],
  )
  const r = useReglagesSalle(config, 'Verre', {
    teinte: { value: '#1a3dff', label: 'bleu du verre' },
    aretes: { value: '#5fd2ff', label: 'arêtes' },
    bords: { value: 0.75, min: 0, max: 10, step: 0.05, label: 'arêtes lumineuses' },
    finesse: { value: 12, min: 1, max: 20, step: 0.5, label: 'finesse des arêtes' },
    masse: { value: 0.04, min: 0, max: 1, step: 0.01, label: 'lumière dans la masse' },
    nuages: { value: 1, min: 0, max: 1, step: 0.01, label: 'nuages dans la masse' },
    reflets: { value: 0.6, min: 0, max: 8, step: 0.05 },
    modele: { value: 0.06, min: 0, max: 2, step: 0.01, label: 'modelé (volume)' },
    eclats: { value: 0.3, min: 0, max: 4, step: 0.01, label: 'éclats sur les bosses' },
    arriere: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'faces arrière' },
    absorption: { value: '#0a1890', label: 'teinte absorbée' },
    peinture: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'couleur du modèle (teinte)' },
    lumierePeinture: { value: 0.05, min: 0, max: 1, step: 0.005, label: 'couleur du modèle (lumière)' },
    relief: { value: 1, min: 0, max: 3, step: 0.05, label: 'relief du modèle' },
    densite: { value: 0.7, min: 0, max: 1, step: 0.01, label: 'densité du verre' },
    refraction: { value: 0.7, min: -2, max: 2, step: 0.01, label: 'réfraction (0 : sans)' },
    dispersion: { value: 0.08, min: 0, max: 0.4, step: 0.01, label: 'irisation' },
    rouge: { value: '#ff0848', label: 'gros vaisseaux' },
    peintureVaisseaux: { value: 0.6, min: 0, max: 1, step: 0.01, label: 'couleur du modèle (bronches)' },
    rougeFin: { value: '#ff0a50', label: 'lacis fin' },
    eclat: { value: 0.45, min: 0, max: 5, step: 0.01, label: 'éclat des gros vaisseaux' },
    eclatFin: { value: 0.25, min: 0, max: 5, step: 0.01, label: 'éclat du lacis' },
    transparence: { value: 0.6, min: 0, max: 1, step: 0.01, label: 'transparence des vaisseaux' },
    refletsVaisseaux: { value: 1, min: 0, max: 5, step: 0.01, label: 'reflets des vaisseaux' },
    // Incandescence des bronches, comme une résistance électrique (07/11 ; incandescence.ts)
    chauffe: { value: 1.2, min: 0, max: 4, step: 0.01, label: 'incandescence : intensité' },
    coeur: { value: 0.6, min: 0, max: 1, step: 0.01, label: 'incandescence : cœur des tubes plus chaud' },
    deformation: { value: 0.03, min: 0, max: 0.2, step: 0.001, label: 'artères : déformation par le verre (m)' },
    deformationEchelle: { value: 1.5, min: 0.2, max: 6, step: 0.05, label: 'artères : finesse de la déformation' },
    froid: { value: '#ff1600', label: 'incandescence : couleur basse' },
    chaud: { value: '#ff8a2a', label: 'incandescence : couleur haute' },
    variation: { value: 0.6, min: 0, max: 1, step: 0.01, label: 'variations : amplitude' },
    vitesse: { value: 0.6, min: 0, max: 4, step: 0.01, label: 'variations : vitesse' },
    crises: { value: 0.6, min: 0, max: 1.5, step: 0.01, label: 'variations : crises (pics rares)' },
    scintillement: { value: 0.15, min: 0, max: 1, step: 0.01, label: 'variations : scintillement' },
    onde: { value: 2, min: 0, max: 10, step: 0.1, label: 'variations : propagation (m/s, 0 = ensemble)' },
    verreLumiere: { value: 0.6, min: 0, max: 4, step: 0.01, label: 'lumière dans le verre : force' },
    verrePortee: { value: 0.45, min: 0.05, max: 1.5, step: 0.01, label: 'lumière dans le verre : portée (m)' },
  })

  // 1. Absorption : multiplie ce qu'on voit au travers par la teinte du verre
  const absorbe = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'VerreAbsorbe',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        uniforms: { uTeinte: { value: new THREE.Color() }, uDensite: { value: 0.9 }, uPeinture: { value: 0 }, ...uniformsCartes() },
        vertexShader: SOMMETS,
        fragmentShader: /* glsl */ `
          ${GLSL_CARTES}
          ${GLSL_TEINTE}
          uniform vec3 uTeinte;
          uniform float uDensite;
          varying vec3 vNormale;
          varying vec3 vVue;
          void main() {
            float c = abs(dot(normalize(vNormale), normalize(vVue)));
            gl_FragColor = vec4(mix(vec3(1.0), teinteVerre(uTeinte), uDensite * (0.75 + 0.25 * pow(1.0 - c, 1.2))), 1.0);
          }`,
      }),
    [],
  )

  // 1 bis. Réfraction (05/11, essai demandé par Ludovic) : la salle, rendue sans l'œuvre dans une image à part
  // (moitié de la résolution, `fond`), est vue au travers du verre, déviée selon l'orientation de sa surface et
  // un peu irisée (rouge, vert et bleu déviés différemment). D'abord le dessous du verre est mis au noir, puis
  // chaque face tournée vers la caméra y ajoute la moitié de l'image déviée : un rayon traverse deux faces
  // tournées vers lui (dehors de la paroi proche, dedans de la paroi du fond), le résultat ne dépend pas de
  // l'ordre de dessin ; au ras du bord, une seule face : plus sombre, comme la tranche d'un verre épais.
  const noir = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'VerreNoir',
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.ZeroFactor,
        vertexShader: SOMMETS,
        fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(0.0); }`,
      }),
    [],
  )
  const refracte = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'VerreRefracte',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uFond: { value: null },
          uTaille: { value: new THREE.Vector2(1, 1) },
          uRefraction: { value: 0.35 },
          uDispersion: { value: 0.08 },
          uTeinte: { value: new THREE.Color() },
          uDensite: { value: 0.9 },
          uPeinture: { value: 0 },
          ...uniformsCartes(),
        },
        vertexShader: SOMMETS,
        fragmentShader: /* glsl */ `
          ${GLSL_CARTES}
          ${GLSL_TEINTE}
          uniform sampler2D uFond;
          uniform vec2 uTaille;
          uniform float uRefraction, uDispersion, uDensite;
          uniform vec3 uTeinte;
          varying vec3 vNormale;
          varying vec3 vVue;
          void main() {
            vec3 n = avecRelief(normalize(vNormale));
            float c = clamp(dot(n, normalize(vVue)), 0.0, 1.0);
            // Déviation à l'écran : orientation de la surface vue de la caméra, moindre de loin
            vec3 nv = normalize((viewMatrix * vec4(n, 0.0)).xyz);
            vec2 d = nv.xy * uRefraction / max(length(vVue), 0.5);
            vec2 uv = gl_FragCoord.xy / uTaille;
            vec3 fond = vec3(texture2D(uFond, uv - d * (1.0 - uDispersion)).r,
                             texture2D(uFond, uv - d).g,
                             texture2D(uFond, uv - d * (1.0 + uDispersion)).b);
            vec3 t = mix(vec3(1.0), teinteVerre(uTeinte), uDensite * (0.75 + 0.25 * pow(1.0 - c, 1.2)));
            gl_FragColor = vec4(fond * t * t * 0.5, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )

  // 2. Lumière du verre, ajoutée à l'image
  const verre = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'Verre',
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTeinte: { value: new THREE.Color() },
          uAretes: { value: new THREE.Color() },
          uBords: { value: 3 },
          uFinesse: { value: 6 },
          uMasse: { value: 0.16 },
          uNuages: { value: 0.8 },
          uReflets: { value: 2.5 },
          uArriere: { value: 0.5 },
          uModele: { value: 0.35 },
          uEclats: { value: 0.8 },
          uLumierePeinture: { value: 0 },
          ...uniformsCartes(),
          ...uChauffe,
          ...uLumiereVerre,
          uReflet: uSculpture.uReflet,
          uLongueurReflet: uSculpture.uLongueurReflet,
        },
        vertexShader: SOMMETS,
        fragmentShader: /* glsl */ `
          ${GLSL_BRUIT}
          ${GLSL_CARTES}
          ${GLSL_INCANDESCENCE}
          uniform float uLumierePeinture, uReflet, uLongueurReflet, uVerreLumiere, uVerrePortee;
          uniform vec3 uPointsBronches[${POINTS_BRONCHES}];
          uniform vec3 uTeinte, uAretes;
          uniform float uBords, uFinesse, uMasse, uNuages, uReflets, uArriere, uModele, uEclats;
          varying vec3 vNormale;
          varying vec3 vVue;
          varying vec3 vLocal;
          ${GLSL_ENTOURAGE}
          void main() {
            vec3 n = avecRelief(normalize(vNormale) * (gl_FrontFacing ? 1.0 : -1.0));
            vec3 v = normalize(vVue);
            float c = clamp(dot(n, v), 0.0, 1.0);
            // Arêtes : Fresnel serré, en traits fins le long des contours (doublés par le verre épais)
            float arete = pow(1.0 - c, uFinesse);
            // Masse : bleu nuageux, poches sombres et zones claires
            float nu = nuages(vLocal * 1.7);
            float masse = uMasse * mix(1.0, 0.12 + 2.4 * smoothstep(0.35, 0.75, nu), uNuages);
            vec3 couleur = uTeinte * masse + uAretes * arete * uBords;
            // Couleur peinte du modèle, ajoutée comme une lumière dans la masse (ses reflets peints compris)
            if (uAvecCarte > 0.5) couleur += peinture() * uLumierePeinture;
            // Lumière des bronches incandescentes, prise dans le verre près d'elles (07/11) : elle reste dans la coque
            if (uVerreLumiere > 0.0) {
              float proche = 0.0;
              for (int i = 0; i < ${POINTS_BRONCHES}; i++) {
                vec3 e = (vLocal - uPointsBronches[i]) / uVerrePortee;
                proche += exp(-dot(e, e));
              }
              float h = chaleur(vMonde.y);
              couleur += rampe(h) * h * min(proche, 3.0) * 0.05 * uVerreLumiere * (gl_FrontFacing ? 1.0 : 0.7);
            }
            // Reflets (Schlick) : nets, ils glissent sur les bosses
            float fresnel = 0.04 + 0.96 * pow(1.0 - c, 5.0);
            couleur += entourage(reflect(-v, n)) * fresnel * uReflets;
            // Modelé : une lumière bleue venue d'en haut (le puits, depuis le 06/11 ; avant, du sud-ouest), éclaire les
            // lobes et laisse les creux sombres ; ses éclats, très serrés, accrochent les bosses
            vec3 l = normalize(vec3(-0.2, 1.0, 0.2)); // du puits, au-dessus (06/11)
            couleur += vec3(0.3, 0.55, 1.0) * pow(max(dot(n, l), 0.0), 2.0) * uModele;
            couleur += vec3(0.75, 0.9, 1.0) * pow(max(dot(n, normalize(l + v)), 0.0), 140.0) * uEclats;
            if (!gl_FrontFacing) couleur *= uArriere;
            gl_FragColor = vec4(couleur, 1.0);
            // Dans la passe de reflet : éteint avec la hauteur (ajouté à l'image : l'alpha porte l'atténuation)
            if (uReflet > 0.5) gl_FragColor = vec4(couleur, exp(-max(vMonde.y, 0.0) / uLongueurReflet));
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )

  // 3. Vaisseaux, dessinés en dernier (ordre 3, parmi les objets transparents mais opaques)
  const vaisseaux = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'Vaisseaux',
        transparent: true,
        defines: { USE_UV1: '' },
        vertexColors: true, // « dansVerre » (poumons.py) : part de la déformation
        // Verre rouge : ce qu'il y a derrière se voit au centre des tubes (prémultiplié : la couleur est déjà
        // pondérée par l'opacité, les reflets blancs s'y ajoutent)
        premultipliedAlpha: true,
        depthWrite: false,
        uniforms: {
          uRouge: { value: new THREE.Color() },
          uRougeFin: { value: new THREE.Color() },
          uEclat: { value: 5.5 },
          uEclatFin: { value: 1.6 },
          uTransparence: { value: 0.6 },
          uRefletsV: { value: 1 },
          uAvecDonnees: { value: 1 },
          ...uChauffe,
          uCoeur: { value: 0.6 },
          uDeformation: { value: 0.03 },
          uDeformationEchelle: { value: 1.5 },
          uPeintureV: { value: 0 },
          ...uniformsCartes(),
          uReflet: uSculpture.uReflet,
          uLongueurReflet: uSculpture.uLongueurReflet,
        },
        vertexShader: /* glsl */ `
          varying vec3 vNormale;
          varying vec3 vVue;
          varying vec2 vDonnees;
          varying vec2 vUv;
          varying vec3 vMonde;
          uniform float uDeformation, uDeformationEchelle;
          // Champ lisse (sommes de sinus) : l'ondulation du verre épais vu de biais
          float onde(vec3 q) {
            return sin(q.x * 1.7 + sin(q.y * 1.3)) * 0.5 + sin(q.y * 2.3 + sin(q.z * 1.9) * 1.5) * 0.3
                 + sin(q.z * 3.1 + q.x * 0.7) * 0.2;
          }
          void main() {
            vec4 p = modelMatrix * vec4(position, 1.0);
            // Déformation légère (07/11) : vues au travers de la coque, les artères ondulent selon l'angle de vue,
            // comme derrière un verre épais et irrégulier ; seulement dans la coque (couleur de sommet « dansVerre »
            // de poumons.py : 0 dehors, 1 dedans, adoucie à la paroi), la trachée et les bronches souches restent nettes
            vec3 vers = normalize(cameraPosition - p.xyz);
            vec3 droite = normalize(cross(vers, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
            vec3 haut_ = cross(droite, vers);
            vec3 q = p.xyz * uDeformationEchelle + vers * 2.5;
            #ifdef USE_COLOR
              float dansVerre = color.r;
            #else
              float dansVerre = 0.0;
            #endif
            p.xyz += (droite * onde(q) + haut_ * onde(q.zxy + 7.3)) * uDeformation * dansVerre;
            vNormale = normalize(mat3(modelMatrix) * normal);
            vVue = cameraPosition - p.xyz;
            vDonnees = uv1;
            vUv = uv;
            vMonde = p.xyz;
            gl_Position = projectionMatrix * viewMatrix * p;
          }`,
        fragmentShader: /* glsl */ `
          ${GLSL_CARTES}
          uniform vec3 uRouge, uRougeFin;
          ${GLSL_INCANDESCENCE}
          uniform float uEclat, uEclatFin, uTransparence, uRefletsV, uAvecDonnees, uPeintureV, uReflet, uLongueurReflet, uCoeur;
          varying vec3 vNormale;
          varying vec3 vVue;
          varying vec2 vDonnees;
          ${GLSL_ENTOURAGE}
          void main() {
            vec3 n = avecRelief(normalize(vNormale));
            vec3 v = normalize(vVue);
            float c = clamp(abs(dot(n, v)), 0.0, 1.0);
            float rayon = vDonnees.x;
            // Le lacis, trop fin pour un modelé, reste d'une couleur égale et presque opaque (sinon il scintille)
            // Sans données (bronches du collègue, 06/11) : tout est traité comme de gros vaisseaux
            float gros = uAvecDonnees > 0.5 ? smoothstep(0.006, 0.05, rayon) : 1.0;
            // Tube de verre : plus transparent au centre, plus rouge et plus dense au bord (trajet plus long)
            float bord = pow(1.0 - c, 1.5);
            float alpha = mix(0.9, mix(1.0 - uTransparence, 1.0, bord), gros);
            vec3 rougeGros = uAvecCarte > 0.5 ? mix(uRouge, peinture(), uPeintureV) : uRouge;
            vec3 corps = mix(uRougeFin * uEclatFin, rougeGros * uEclat, gros) * mix(1.0, 0.55 + 0.9 * bord, gros);
            // Incandescence (07/11) : comme une résistance électrique, le cœur des tubes plus chaud que leurs bords ;
            // elle varie avec la douleur (incandescence.ts)
            float h = chaleur(vMonde.y) * mix(1.0, 0.45 + 0.85 * pow(c, 1.5), uCoeur);
            // (× 0,18 : l'exposition de la salle s'y applique ; plus vive, la courbe de couleurs délave le rouge en saumon)
            vec3 incandescence = rampe(h) * h * 0.18 * gros;
            // Reflets blancs : la lumière du modelé (en haut, côté sud-ouest) en un trait le long de chaque tube, et
            // les ouvertures de l'espace central (Fresnel)
            vec3 l = normalize(vec3(-0.2, 1.0, 0.2)); // du puits, au-dessus (06/11)
            float trait = pow(max(dot(n, normalize(l + v)), 0.0), 90.0);
            float fresnel = 0.04 + 0.96 * pow(1.0 - c, 5.0);
            vec3 reflet = (vec3(1.0, 0.95, 0.95) * trait * 1.4 + entourage(reflect(-v, n)) * fresnel) * uRefletsV * gros;
            gl_FragColor = vec4(corps * alpha + reflet + incandescence, alpha);
            // Dans la passe de reflet : éteint avec la hauteur (prémultiplié : tout est atténué)
            if (uReflet > 0.5) gl_FragColor *= exp(-max(vMonde.y, 0.0) / uLongueurReflet);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [uSculpture],
  )

  absorbe.uniforms.uTeinte.value.set(r.absorption)
  absorbe.uniforms.uDensite.value = r.densite
  absorbe.uniforms.uPeinture.value = r.peinture
  const ur = refracte.uniforms
  ur.uTeinte.value.set(r.absorption)
  ur.uDensite.value = r.densite
  ur.uRefraction.value = r.refraction
  ur.uDispersion.value = r.dispersion
  ur.uPeinture.value = r.peinture
  const u = verre.uniforms
  u.uTeinte.value.set(r.teinte)
  u.uAretes.value.set(r.aretes)
  u.uBords.value = r.bords
  u.uFinesse.value = r.finesse
  u.uMasse.value = r.masse
  u.uNuages.value = r.nuages
  u.uReflets.value = r.reflets
  u.uArriere.value = r.arriere
  u.uModele.value = r.modele
  u.uEclats.value = r.eclats
  u.uLumierePeinture.value = r.lumierePeinture
  const w = vaisseaux.uniforms
  w.uRouge.value.set(r.rouge)
  w.uRougeFin.value.set(r.rougeFin)
  w.uEclat.value = r.eclat
  w.uEclatFin.value = r.eclatFin
  w.uTransparence.value = r.transparence
  w.uRefletsV.value = r.refletsVaisseaux
  w.uCoeur.value = r.coeur
  w.uDeformation.value = r.deformation
  w.uDeformationEchelle.value = r.deformationEchelle
  uChauffe.uChauffe.value = r.chauffe
  uChauffe.uVariation.value = r.variation
  uChauffe.uVitesse.value = r.vitesse
  uChauffe.uCrises.value = r.crises
  uChauffe.uScintillement.value = r.scintillement
  uChauffe.uOnde.value = r.onde
  uChauffe.uFroid.value.set(r.froid)
  uChauffe.uChaud.value.set(r.chaud)
  uLumiereVerre.uVerreLumiere.value = r.verreLumiere
  uLumiereVerre.uVerrePortee.value = r.verrePortee
  w.uPeintureV.value = r.peintureVaisseaux

  // Copie du modèle ; le verre y est doublé : d'abord l'absorption, puis la lumière ajoutée
  const scene = useMemo(() => {
    const copie = gltf.scene.clone()
    const verres: THREE.Mesh[] = []
    copie.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && (mesh.material as THREE.Material).name === 'Verre') verres.push(mesh)
    })
    const absorptions: THREE.Mesh[] = []
    const refractions: THREE.Mesh[] = []
    for (const v of verres) {
      const a = new THREE.Mesh(v.geometry, absorbe)
      const n = new THREE.Mesh(v.geometry, noir)
      const f = new THREE.Mesh(v.geometry, refracte)
      a.renderOrder = n.renderOrder = 1
      f.renderOrder = 1.5
      v.renderOrder = 2
      v.add(a, n, f)
      absorptions.push(a)
      refractions.push(n, f)
    }
    copie.userData.passes = { absorptions, refractions }

    // Textures du modèle (couleur, relief), lues sur ses matières d'origine ; données des vaisseaux dans les UV2
    const lire = (nom: string, cibles: UniformsCartes[]) => {
      let mesh: THREE.Mesh | undefined
      copie.traverse((o) => {
        const m = o as THREE.Mesh
        if (!mesh && m.isMesh && (m.material as THREE.Material).name === nom) mesh = m
      })
      const mat = mesh?.material as THREE.MeshStandardMaterial | undefined
      for (const c of cibles) {
        c.uCarte.value = mat?.map ?? null
        c.uAvecCarte.value = mat?.map ? 1 : 0
        c.uRelief.value = mat?.normalMap ?? null
        c.uAvecRelief.value = mat?.normalMap ? 1 : 0
        if (mat?.normalScale) c.uEchelleRelief.value.copy(mat.normalScale)
      }
      return mesh
    }
    lire('Verre', [absorbe.uniforms, refracte.uniforms, verre.uniforms] as unknown as UniformsCartes[])
    const v = lire('Vaisseaux', [vaisseaux.uniforms] as unknown as UniformsCartes[])
    vaisseaux.uniforms.uAvecDonnees.value = v?.geometry.getAttribute('uv1') ? 1 : 0
    if (v) pointsBronches(v).forEach((p, i) => uLumiereVerre.uPointsBronches.value[i].copy(p))
    copie.userData.echellesRelief = [absorbe, refracte, verre, vaisseaux].map((m) => m.uniforms.uEchelleRelief.value.clone())
    return copie
  }, [gltf.scene, absorbe, noir, refracte, verre, vaisseaux])

  // Force du relief : échelle des normales du modèle × réglage
  const echelles = scene.userData.echellesRelief as THREE.Vector2[]
  ;[absorbe, refracte, verre, vaisseaux].forEach((m, i) => m.uniforms.uEchelleRelief.value.copy(echelles[i]).multiplyScalar(r.relief))

  // Image de la salle sans l'œuvre, pour la réfraction : après la navigation et le reflet (caméra à jour), avant
  // les effets d'image (priorité 1). Image linéaire (cible en demi-flottants : three n'y applique ni courbe ni
  // conversion), comme celle des effets d'image.
  const gl = useThree((s) => s.gl)
  const fond = useMemo(() => {
    const cible = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
    cible.texture.minFilter = cible.texture.magFilter = THREE.LinearFilter
    cible.texture.generateMipmaps = false
    return cible
  }, [])
  useEffect(() => {
    refracte.uniforms.uFond.value = fond.texture
    return () => fond.dispose()
  }, [fond, refracte])
  const taille = useMemo(() => new THREE.Vector2(), [])
  const couleurFond = useMemo(() => new THREE.Color(), [])
  useFrame(({ scene: monde, camera }) => {
    const avecRefraction = r.refraction !== 0
    const { absorptions, refractions } = scene.userData.passes as { absorptions: THREE.Mesh[]; refractions: THREE.Mesh[] }
    for (const m of absorptions) m.visible = !avecRefraction
    for (const m of refractions) m.visible = avecRefraction
    if (!avecRefraction || !scene.visible) return
    gl.getDrawingBufferSize(taille)
    refracte.uniforms.uTaille.value.copy(taille)
    const w = Math.max(1, Math.round(taille.x / 2))
    const h = Math.max(1, Math.round(taille.y / 2))
    if (fond.width !== w || fond.height !== h) fond.setSize(w, h)
    const avant = gl.getRenderTarget()
    const alpha = gl.getClearAlpha()
    gl.getClearColor(couleurFond)
    const ombres = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    scene.visible = false
    gl.setRenderTarget(fond)
    gl.setClearColor(0x000000, 1)
    gl.clear()
    gl.render(monde, camera)
    gl.setRenderTarget(avant)
    scene.visible = true
    gl.shadowMap.autoUpdate = ombres
    gl.setClearColor(couleurFond, alpha)
  }, -0.5)
  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || mesh.material === absorbe || mesh.material === noir || mesh.material === refracte) return
      const nom = (mesh.material as THREE.Material).name
      mesh.material = nom === 'Vaisseaux' ? vaisseaux : verre
      if (nom === 'Vaisseaux') mesh.renderOrder = 3
      mesh.castShadow = mesh.receiveShadow = false
      mesh.layers.enable(CALQUE_REFLET) // clic sur l'œuvre (Navigation)
    })
  }, [scene, verre, vaisseaux, absorbe, noir, refracte])

  // Les vaisseaux n'ont qu'une face : la passe de reflet la retourne (la symétrie inverse le sens des faces)
  const retournees = useMemo(() => [vaisseaux] as unknown as THREE.MeshStandardMaterial[], [vaisseaux])
  useFrame((_, dt) => {
    uChauffe.uTemps.value += Math.min(dt, 0.05)
    etatIncandescence.chaleur = chaleurProcesseur(uChauffe.uTemps.value, r)
  })
  return (
    <>
      <group position={config.sculpture.position} rotation-y={THREE.MathUtils.degToRad(config.sculpture.rotationY)}>
        <primitive object={scene} />
      </group>
      <PasseReflet sculpture={scene} materiaux={retournees} uSol={uSol} uSculpture={uSculpture} />
    </>
  )
}
