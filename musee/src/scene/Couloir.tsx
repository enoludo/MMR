import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useLightmap } from './lightmaps'
import { useControls } from 'leva'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Porte, SalleConfig } from '../salles/types'
import { GLSL_PIERRE, textureBruit } from './pierre'
import { LONGUEUR_COULOIR, matricePlacement, placementCouloir } from './passage'

/**
 * Couloir entre deux salles, derrière la porte (références : references/couloir).
 *
 * Plongé dans la pénombre, il reçoit le soleil par une suite de fentes verticales
 * percées dans la paroi de gauche (en partant de la salle) : la lumière dessine des
 * bandes rasantes en travers du sol et sur la paroi d'en face, et des rayons dans l'air.
 *
 * Tout est calculé en direct, sans précalcul : pour chaque point, le shader suit le
 * rayon vers le soleil et regarde s'il passe par une fente (les fentes sont régulières,
 * le calcul est exact). Le flou des bords grandit avec la distance à la fente, comme une
 * vraie pénombre. Les réglages (touche M, « Couloir ») s'appliquent immédiatement.
 *
 * Repère du couloir : origine au seuil de la porte, axe −z vers l'extérieur de la salle,
 * x de −largeur/2 (paroi à fentes) à +largeur/2. Il est aussi haut que la porte.
 * `traverse` : on le traverse en ce moment ; la vraie salle remplace la lueur du bout.
 *
 * Raccord avec la salle : le sol, le plafond et le mur qui se prolongent dans le couloir
 * (la porte est au bord de son mur) reprennent, au seuil, la lumière précalculée de la salle
 * au même endroit (sa lightmap), puis passent en quelques mètres à celle du couloir.
 */
export function Couloir({ config, porte, traverse }: { config: SalleConfig; porte: Porte; traverse: boolean }) {
  const c = useControls('Couloir', {
    soleil: { value: 1.2, min: 0, max: 4, step: 0.01 },
    hauteurSoleil: { value: 32, min: 5, max: 75, step: 1, label: 'hauteur du soleil (°)' },
    // Une paroi épaisse ne laisse passer qu'un soleil presque face à elle (sinon la fente est « bouchée »)
    orientation: { value: 12, min: -45, max: 45, step: 1, label: 'orientation du soleil (°)' },
    ambiance: { value: 0.0015, min: 0, max: 0.05, step: 0.0005 },
    rebond: { value: 0.006, min: 0, max: 0.1, step: 0.001, label: 'rebonds' },
    portes: { value: 0.012, min: 0, max: 0.5, step: 0.001, label: 'lumière des portes' },
    fonduPorte: { value: 2.5, min: 0.3, max: 8, step: 0.1, label: 'portée de la lumière des portes (m)' },
    raccord: { value: 4, min: 0.5, max: 12, step: 0.1, label: 'raccord avec la salle (m)' },
    rayons: { value: 0.05, min: 0, max: 0.3, step: 0.005, label: 'rayons dans l’air' },
    dehors: { value: 1, min: 0, max: 3, step: 0.05, label: 'lumière du dehors' },
    fente: { value: 0.4, min: 0.05, max: 1.5, step: 0.01, label: 'largeur des fentes (m)' },
    pas: { value: 1.6, min: 0.6, max: 4, step: 0.05, label: 'écart des fentes (m)' },
    epaisseur: { value: 0.5, min: 0.1, max: 2, step: 0.05, label: 'épaisseur de la paroi (m)' },
    hauteurFente: { value: 16, min: 1, max: 20, step: 0.1, label: 'hauteur des fentes (m)' },
  })

  const L = LONGUEUR_COULOIR
  const W = porte.largeur
  const H = porte.hauteur
  const placement = useMemo(() => placementCouloir(porte), [porte])

  // Lumière précalculée de la salle, au seuil (voir raccordsSalle)
  const nomAtlas = config.matieres.Mur?.lightmap ?? 'salle'
  const atlas = config.lightmaps[nomAtlas]
  const gltf = useGLTF(config.modele)
  const lightmap = useLightmap(atlas.image) // la même texture que la salle (lightmaps.ts)
  const raccords = useMemo(() => raccordsSalle(gltf.scene, config, nomAtlas, porte), [gltf.scene, config, nomAtlas, porte])

  // Fentes réparties régulièrement, en laissant un mur plein près de chaque porte
  const fentes = useMemo(() => {
    const marge = 1.8
    const nombre = Math.max(1, Math.floor((L - 2 * marge) / c.pas) + 1)
    const etendue = (nombre - 1) * c.pas
    return { nombre, premiere: -(L - etendue) / 2 }
  }, [L, c.pas])

  const uniforms = useMemo(
    () => ({
      uGrain: { value: 0.05 },
      uVoile: { value: 0.035 },
      uNuances: { value: 0.07 },
      uBruit: { value: textureBruit },
      uK: { value: atlas.k },
      uSoleilDir: { value: new THREE.Vector3() },
      uSoleil: { value: new THREE.Color() },
      uAmbiance: { value: 0 },
      uRebond: { value: 0 },
      uLumierePorte: { value: 0 },
      uFonduPorte: { value: 1 },
      uBrume: { value: 0 },
      uLongueur: { value: L },
      uDemiLargeur: { value: W / 2 },
      uHauteur: { value: H },
      uEpaisseur: { value: 0 },
      uHautFente: { value: 0 },
      uPas: { value: 1 },
      uFente: { value: 0 },
      uPremiere: { value: 0 },
      uNombre: { value: 1 },
      // Mêmes couleurs que les matières de la salle, et grain calculé dans le repère de la
      // salle : la pierre se prolonge sans raccord visible au passage de la porte
      uCouleurSol: { value: new THREE.Color(config.matieres.Sol?.couleur ?? '#a29b95') },
      uCouleurMur: { value: new THREE.Color(config.matieres.Mur?.couleur ?? '#c4bcb1') },
      uCouleurPlafond: { value: new THREE.Color(config.matieres.Plafond?.couleur ?? '#bcb6af') },
      uPlacement: { value: matricePlacement(placementCouloir(porte)) },
      uLightmapSalle: { value: lightmap },
      uEchelleSalle: { value: atlas.echelle },
      uRaccordSol: { value: raccords.sol ?? new THREE.Vector4() },
      uRaccordPlafond: { value: raccords.plafond ?? new THREE.Vector4() },
      uRaccordMur: { value: raccords.mur ?? new THREE.Vector4() },
      uRaccordActif: { value: new THREE.Vector3(+!!raccords.sol, +!!raccords.plafond, +!!raccords.mur) },
      uFonduRaccord: { value: 4 },
    }),
    [L, W, H, config.matieres, porte, atlas, lightmap, raccords],
  )

  useEffect(() => {
    const h = THREE.MathUtils.degToRad(c.hauteurSoleil)
    const o = THREE.MathUtils.degToRad(c.orientation)
    // Le soleil entre par la paroi à fentes (x < 0) et descend ; l'orientation le fait
    // filer vers le fond du couloir (o > 0) ou vers la salle (o < 0)
    uniforms.uSoleilDir.value.set(Math.cos(h) * Math.cos(o), -Math.sin(h), -Math.cos(h) * Math.sin(o)).normalize()
    uniforms.uSoleil.value.set('#ffdcae').multiplyScalar(c.soleil)
    uniforms.uAmbiance.value = c.ambiance
    uniforms.uRebond.value = c.rebond * c.soleil
    uniforms.uLumierePorte.value = c.portes
    uniforms.uFonduPorte.value = c.fonduPorte
    uniforms.uFonduRaccord.value = c.raccord
    uniforms.uBrume.value = c.rayons
    uniforms.uEpaisseur.value = c.epaisseur
    uniforms.uHautFente.value = Math.min(c.hauteurFente, H - 0.3)
    uniforms.uPas.value = c.pas
    uniforms.uFente.value = c.fente
    uniforms.uPremiere.value = fentes.premiere
    uniforms.uNombre.value = fentes.nombre
  }, [uniforms, c, fentes, H])

  // Parois, sol et plafond : des pavés fusionnés en une seule géométrie
  const geometrie = useMemo(() => {
    const paves: THREE.BufferGeometry[] = []
    const pave = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
      if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      paves.push(g)
    }
    const e = c.epaisseur
    const x = -W / 2
    const hf = Math.min(c.hauteurFente, H - 0.3)
    pave(x - e, W / 2, -0.2, 0, -L, 0) // sol (jusque sous les fentes)
    pave(x - e, W / 2, H, H + 0.2, -L, 0) // plafond
    pave(W / 2, W / 2 + 0.2, 0, H, -L, 0) // paroi pleine
    // Paroi à fentes : trumeaux pleins entre les fentes, linteau au-dessus de chacune. Le premier
    // trumeau commence un rien derrière le plan du mur de la salle : sinon leurs faces se
    // superposent et scintillent au bord de l'ouverture
    let bord = -0.005
    for (let k = 0; k < fentes.nombre; k++) {
      const zc = fentes.premiere - k * c.pas
      pave(x - e, x, 0, H, zc + c.fente / 2, bord)
      pave(x - e, x, hf, H, zc - c.fente / 2, zc + c.fente / 2)
      bord = zc - c.fente / 2
    }
    pave(x - e, x, 0, H, -L, bord)
    const g = mergeGeometries(paves)
    paves.forEach((p) => p.dispose())
    return g
  }, [W, H, L, c.epaisseur, c.fente, c.pas, c.hauteurFente, fentes])
  useEffect(() => () => geometrie.dispose(), [geometrie])

  const pierre = useMemo(() => {
    const m = new THREE.MeshBasicMaterial()
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform mat4 uPlacement;\nvarying vec3 vPosPierre;\nvarying vec3 vNormPierre;\nvarying vec3 vLocal;\nvarying vec3 vNormLocal;',
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vLocal = transformed;
          vNormLocal = normal;
          vPosPierre = (uPlacement * vec4(transformed, 1.0)).xyz;
          vNormPierre = mat3(uPlacement) * normal;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vLocal;\nvarying vec3 vNormLocal;\n${GLSL_PIERRE}\n${GLSL_FENTES}\n${GLSL_ECLAIRAGE}`,
        )
        .replace(
          'vec3 outgoingLight = reflectedLight.indirectDiffuse;',
          'vec3 outgoingLight = couleurCouloir(normalize(vNormLocal)) * pierre(vPosPierre, vNormPierre) * eclairageCouloir(vLocal, normalize(vNormLocal));',
        )
    }
    m.customProgramCacheKey = () => 'couloir-v4'
    return m
  }, [uniforms])

  const rayons = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          varying vec3 vLocal;
          varying vec3 vCamera;
          void main() {
            vLocal = position;
            vCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          ${GLSL_FENTES}
          uniform vec3 uSoleil;
          uniform float uBrume;
          uniform float uLongueur;
          uniform float uHauteur;
          varying vec3 vLocal;
          varying vec3 vCamera;

          void main() {
            // Segment caméra → paroi, limité au volume intérieur du couloir
            vec3 d = vLocal - vCamera;
            vec3 inv = 1.0 / d;
            vec3 mini = vec3(-uDemiLargeur, 0.0, -uLongueur);
            vec3 maxi = vec3(uDemiLargeur, uHauteur, 0.0);
            vec3 t0 = (mini - vCamera) * inv;
            vec3 t1 = (maxi - vCamera) * inv;
            vec3 tmin = min(t0, t1);
            vec3 tmax = max(t0, t1);
            float entree = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
            float sortie = min(min(tmax.x, tmax.y), min(tmax.z, 1.0));
            if (sortie <= entree) discard;
            // Marche le long du rayon, décalée au hasard par pixel (pas de bandes)
            const int N = 32;
            float pas = (sortie - entree) / float(N);
            float decalage = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            float somme = 0.0;
            for (int i = 0; i < N; i++) {
              vec3 q = vCamera + d * (entree + (float(i) + decalage) * pas);
              somme += soleilFentes(q, 0.0);
            }
            float longueur = somme * pas * length(d);
            // Plus lumineux quand on regarde vers le soleil (diffusion vers l'avant)
            float face = pow(max(dot(normalize(d), -uSoleilDir), 0.0), 3.0);
            float lum = (1.0 - exp(-longueur * uBrume)) * (0.5 + 1.5 * face);
            gl_FragColor = vec4(uSoleil * lum, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [uniforms],
  )

  // Volume des rayons : l'intérieur du couloir, un rien en retrait des parois
  const volume = useMemo(() => {
    const g = new THREE.BoxGeometry(W - 0.02, H - 0.02, L - 0.02)
    g.translate(0, H / 2, -L / 2)
    return g
  }, [W, H, L])

  const dehors = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3e2' }), [])
  dehors.color.set('#fff3e2').multiplyScalar(c.dehors)
  // Au bout, la porte de la salle suivante : une lueur, remplacée par la vraie salle pendant un passage
  const lueur = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.04, 0.032) }), [])

  return (
    <group position={placement.position} rotation-y={placement.rotationY}>
      <mesh geometry={geometrie} material={pierre} />
      {/* Le dehors, vu par les fentes : une paroi ensoleillée (sans dépasser dans les salles) */}
      <mesh material={dehors} position={[-W / 2 - c.epaisseur - 1.5, H / 2 + 2, -L / 2]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[L, H + 6]} />
      </mesh>
      <mesh material={lueur} position={[0, H / 2, -L]} visible={!traverse}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh geometry={volume} material={rayons} renderOrder={5} frustumCulled={false} />
    </group>
  )
}

/** Fraction de soleil reçue en un point, à travers les fentes de la paroi (x < 0). */
const GLSL_FENTES = /* glsl */ `
uniform vec3 uSoleilDir;
uniform float uDemiLargeur;
uniform float uEpaisseur;
uniform float uHautFente;
uniform float uPas;
uniform float uFente;
uniform float uPremiere;
uniform float uNombre;

// flouPixel : taille d'un pixel à l'écran (m), pour adoucir les bords trop fins, qui scintilleraient
float soleilFentes(vec3 p, float flouPixel) {
  vec3 l = -uSoleilDir; // vers le soleil
  float lum = 1.0;
  // Le rayon doit passer par l'ouverture sur les deux faces de la paroi (intérieure, extérieure)
  for (int i = 0; i < 2; i++) {
    float x0 = -uDemiLargeur - (i == 0 ? 0.0 : uEpaisseur);
    if (p.x <= x0 + 0.001) continue;
    float t = (x0 - p.x) / l.x;
    vec3 h = p + t * l;
    float flou = 0.004 + t * 0.012 + flouPixel; // pénombre : le bord s'adoucit avec la distance
    float v = 1.0 - smoothstep(uHautFente - flou, uHautFente + flou, h.y);
    float k = clamp(floor((uPremiere - h.z) / uPas + 0.5), 0.0, uNombre - 1.0);
    float ecart = abs(h.z - (uPremiere - k * uPas));
    lum *= v * (1.0 - smoothstep(uFente * 0.5 - flou, uFente * 0.5 + flou, ecart));
  }
  return lum;
}
`

/** Lumière reçue par les parois : soleil des fentes, rebonds, lumière venue des salles. */
const GLSL_ECLAIRAGE = /* glsl */ `
uniform vec3 uSoleil;
uniform float uAmbiance;
uniform float uRebond;
uniform float uLumierePorte;
uniform float uFonduPorte;
uniform float uLongueur;
uniform float uHauteur;
uniform vec3 uCouleurSol;
uniform vec3 uCouleurMur;
uniform vec3 uCouleurPlafond;

vec3 couleurCouloir(vec3 n) {
  return n.y > 0.5 ? uCouleurSol : (n.y < -0.5 ? uCouleurPlafond : uCouleurMur);
}

uniform sampler2D uLightmapSalle;
uniform float uEchelleSalle;
uniform vec4 uRaccordSol;
uniform vec4 uRaccordPlafond;
uniform vec4 uRaccordMur;
uniform vec3 uRaccordActif;
uniform float uFonduRaccord;

// Coins assombris (la lumière diffuse y entre moins), comme dans le précalcul de la salle
float coin(float d) {
  return d < -0.01 ? 1.0 : mix(0.5, 1.0, smoothstep(0.0, 1.0, d));
}
float occlusionCouloir(vec3 p, vec3 n) {
  float ao = 1.0;
  if (n.y < 0.5) ao *= coin(p.y);
  if (n.y > -0.5) ao *= coin(uHauteur - p.y);
  if (n.x < 0.5) ao *= coin(p.x + uDemiLargeur);
  if (n.x > -0.5) ao *= coin(uDemiLargeur - p.x);
  return ao;
}

vec3 eclairageCouloir(vec3 p, vec3 n) {
  float direct = max(dot(n, -uSoleilDir), 0.0) * soleilFentes(p, length(fwidth(p)) * 0.7);
  // La lumière des salles entre par les deux portes et s'éteint vite
  float portes = exp(-max(-p.z, 0.0) / uFonduPorte) + exp(-max(p.z + uLongueur, 0.0) / uFonduPorte);
  // Rebonds : un peu de la lumière des taches de soleil, plus vers le bas
  float rebond = uRebond * (0.55 + 0.45 * n.y) * (0.7 + 0.3 * smoothstep(4.0, 0.0, p.y));
  // Lumière diffuse un peu chaude (rebonds sur la pierre), atténuée dans les coins
  vec3 diffus = vec3(1.0, 0.84, 0.68) * (uAmbiance + uLumierePorte * portes + rebond) * occlusionCouloir(p, n);
  // Surfaces qui prolongent celles de la salle : au seuil, la lumière précalculée de la salle
  // le long de la ligne de raccord (segment A → B de sa lightmap), fondue avec la profondeur
  bool sol = n.y > 0.5, plafond = n.y < -0.5, mur = !sol && !plafond && n.x < -0.5;
  float actif = sol ? uRaccordActif.x : (plafond ? uRaccordActif.y : (mur ? uRaccordActif.z : 0.0));
  if (actif > 0.5) {
    vec4 r = sol ? uRaccordSol : (plafond ? uRaccordPlafond : uRaccordMur);
    float t = mur ? p.y / uHauteur : (p.x + uDemiLargeur) / (2.0 * uDemiLargeur);
    vec3 salle = decodeLightmap(texture2D(uLightmapSalle, mix(r.xy, r.zw, clamp(t, 0.0, 1.0))).rgb) * uEchelleSalle;
    diffus = mix(salle, diffus, smoothstep(0.0, uFonduRaccord, -p.z));
  }
  return diffus + uSoleil * direct;
}
`

/**
 * Lignes de raccord entre la salle et le couloir, dans la lightmap de la salle : pour le sol,
 * le plafond et le mur qui se prolonge (côté droit, la porte étant au bord de son mur), les
 * coordonnées de lightmap des deux bouts du seuil, prises 5 cm à l'intérieur de la salle.
 * null quand la salle n'a pas de surface à cet endroit (porte au milieu d'un mur, par exemple).
 */
function raccordsSalle(scene: THREE.Object3D, config: SalleConfig, nomAtlas: string, porte: Porte) {
  const W = porte.largeur
  const H = porte.hauteur
  const m = 0.05
  const versSalle = matricePlacement(placementCouloir(porte))
  const segment = (nom: string, a: [number, number, number], b: [number, number, number]) => {
    if (config.matieres[nom]?.lightmap !== nomAtlas) return null
    const ua = uvLightmap(scene, nom, new THREE.Vector3(...a).applyMatrix4(versSalle))
    const ub = uvLightmap(scene, nom, new THREE.Vector3(...b).applyMatrix4(versSalle))
    return ua && ub ? new THREE.Vector4(ua.x, ua.y, ub.x, ub.y) : null
  }
  return {
    sol: segment('Sol', [-W / 2 + m, 0, m], [W / 2 - m, 0, m]),
    plafond: segment('Plafond', [-W / 2 + m, H, m], [W / 2 - m, H, m]),
    mur: segment('Mur', [W / 2, m, m], [W / 2, H - m, m]),
  }
}

/** Coordonnées de lightmap du point `q` (repère de la salle), posé sur une surface de la matière `nom`. */
function uvLightmap(scene: THREE.Object3D, nom: string, q: THREE.Vector3): THREE.Vector2 | null {
  scene.updateMatrixWorld(true)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const triangle = new THREE.Triangle()
  const plan = new THREE.Plane()
  let trouve: THREE.Vector2 | null = null
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (trouve || !mesh.isMesh || (mesh.material as THREE.Material).name !== nom) return
    const { position, uv } = mesh.geometry.attributes
    const index = mesh.geometry.index
    if (!uv) return
    const n = index ? index.count : position.count
    const sommet = (i: number) => (index ? index.getX(i) : i)
    for (let i = 0; i < n; i += 3) {
      const [i0, i1, i2] = [sommet(i), sommet(i + 1), sommet(i + 2)]
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld)
      triangle.set(a, b, c)
      if (Math.abs(triangle.getPlane(plan).distanceToPoint(q)) > 0.01 || !triangle.containsPoint(q)) continue
      trouve = THREE.Triangle.getInterpolation(
        q, a, b, c,
        new THREE.Vector2(uv.getX(i0), uv.getY(i0)),
        new THREE.Vector2(uv.getX(i1), uv.getY(i1)),
        new THREE.Vector2(uv.getX(i2), uv.getY(i2)),
        new THREE.Vector2(),
      ) as THREE.Vector2
      return
    }
  })
  return trouve
}
