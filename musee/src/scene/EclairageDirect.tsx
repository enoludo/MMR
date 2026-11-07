import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { button, useControls } from 'leva'
import * as THREE from 'three'
import type { EclairageSite, SalleConfig } from '../salles/types'
import { dossierSalle } from '../reglages'
import type { UniformsSalle } from './pierre'

/**
 * Éclairage réglé en direct, puis figé (07/11, demande de Ludovic ; pavillon de « Souffle d'éclats »).
 * En dev seulement, touche M « Éclairage · <salle> » :
 * - « aperçu en direct » : les matières de l'espace central (atlas `config.eclairage.atlas`) quittent leur lumière
 *   précalculée et sont éclairées dans le navigateur par les lumières de blender/pavillon.py, à la même place
 *   (src/salles/pavillon/lumieres.json, écrit par pavillon.py) : le disque du puits (vu au travers du trou du
 *   plafond) et les rubans au pied des murs. Aperçu approché : ni ombres ni lumière renvoyée (sauf un réglage
 *   « lumière renvoyée » uniforme), ni lueur de l'œuvre ;
 * - « Figer » : écrit les réglages dans src/salles/pavillon/eclairage.json (lu par pavillon.py, couleurs de
 *   l'espace central comprises : celles de « Couleurs · <salle> ») et lance le calcul de la lumière par le serveur
 *   de dev (vite.config.ts, /__eclairage : pavillon.py puis chaine.sh, ≈ 20 min). La page se recharge à la fin.
 * Unités : celles de pavillon.py (forces avant ECHELLE). Calé sur le calcul le 07/11 : rubans à 3 % près, flaque du
 * puits à 5 % près (resserrement du faisceau repris de Cycles) ; seule la lumière renvoyée est approchée.
 */

const MAX_RUBANS = 8

const SOMMETS = /* glsl */ `
  uniform mat4 uVersSalle;
  varying vec3 vPos;
  varying vec3 vNorm;
  void main() {
    vec4 p = modelMatrix * vec4(position, 1.0);
    vPos = (uVersSalle * p).xyz;
    vNorm = normalize(mat3(uVersSalle) * mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * p;
  }`

const FRAGMENTS = /* glsl */ `
  #define MAX_RUBANS ${MAX_RUBANS}
  uniform vec3 uAlbedo;
  uniform float uLumiere, uRebond;
  uniform vec3 uPuitsSource, uPuitsCouleur;
  uniform float uPuitsRayonSrc, uPuitsRayon, uPuitsH, uPuitsForce, uPuitsDemiAngle;
  uniform vec3 uRubA[MAX_RUBANS], uRubB[MAX_RUBANS], uRubAxe[MAX_RUBANS];
  uniform int uNbRubans;
  uniform float uRubForce, uRubPeriode, uRubMelange;
  uniform vec3 uRubCouleur, uRubCouleur2;
  varying vec3 vPos;
  varying vec3 vNorm;

  // Resserrement du faisceau d'une lampe « aire » de Cycles (spread) : grille de lamelles devant la lampe, qui
  // concentre la même puissance dans un cône (Cycles, area_light_spread_attenuation ; calé le 07/11 sur le calcul)
  float resserrement(float ce, float demiAngle) {
    if (demiAngle > 1.56) return 1.0;
    float tanDemi = tan(demiAngle);
    float normalisation = demiAngle > 0.05 ? 1.0 / (tanDemi - demiAngle) : 3.0 / (demiAngle * demiAngle * demiAngle);
    float tanA = sqrt(max(1.0 - ce * ce, 0.0)) / max(ce, 1e-4);
    return max((tanDemi - tanA) * normalisation, 0.0);
  }

  // Éclairement (W/m², unités de Blender) d'un point de lumière d'intensité i (W/sr, sur l'axe), lambertien autour
  // de son axe, resserré par le spread de Blender
  float eclairement(vec3 p, vec3 n, vec3 source, vec3 axe, float i, float demiAngle, float douceur) {
    vec3 l = source - p;
    float d2 = dot(l, l) + douceur;
    l *= inversesqrt(d2);
    float ce = dot(-l, axe);
    if (ce <= 0.0) return 0.0;
    return i * ce * resserrement(ce, demiAngle) * max(dot(n, l), 0.0) / d2;
  }

  void main() {
    vec3 n = normalize(vNorm) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 p = vPos;
    float e = 0.0;
    vec3 couleur = vec3(0.0);
    // Puits : disque de source tout en haut (13 points : le centre, deux couronnes), vu au travers du trou du plafond
    if (uPuitsForce > 0.0) {
      float ePuits = 0.0;
      for (int k = 0; k < 13; k++) {
        float a = float(k) * 1.0472 + (k > 6 ? 0.5236 : 0.0);
        float rk = k == 0 ? 0.0 : (k <= 6 ? 0.45 : 0.85);
        vec3 s = uPuitsSource + vec3(cos(a), 0.0, sin(a)) * uPuitsRayonSrc * rk;
        float vis = 1.0;
        if (p.y < uPuitsH - 0.01) {
          float t = (uPuitsH - p.y) / (s.y - p.y);
          vec2 h = p.xz + (s.xz - p.xz) * t;
          vis = 1.0 - smoothstep(uPuitsRayon - 0.08, uPuitsRayon + 0.08, length(h));
        }
        ePuits += vis * eclairement(p, n, s, vec3(0.0, -1.0, 0.0), uPuitsForce / 3.1416 / 13.0, uPuitsDemiAngle, 0.01);
      }
      couleur += uPuitsCouleur * ePuits;
    }
    // Rubans au pied des murs : points le long du ruban, au plus près du point éclairé (le reste du ruban,
    // plus loin, compte peu) ; leur écart est adouci pour ne pas faire de taches sur le mur tout proche
    for (int r = 0; r < MAX_RUBANS; r++) {
      if (r >= uNbRubans) break;
      vec3 ab = uRubB[r] - uRubA[r];
      float longueur = length(ab);
      float t0 = clamp(dot(p - uRubA[r], ab) / (longueur * longueur), 0.0, 1.0);
      vec3 eRuban = vec3(0.0);
      // 16 points de part et d'autre du plus proche, espacés de plus en plus (jusqu'à ± 6 m)
      for (int k = -8; k <= 8; k++) {
        float x = float(k) / 8.0;
        float decalage = sign(x) * x * x * 6.0;
        float pas = 12.0 * abs(x) / 8.0 + 0.09;
        float t = t0 + decalage / longueur;
        if (t < 0.0 || t > 1.0) continue;
        vec3 s = uRubA[r] + ab * t;
        // Alternance douce des deux couleurs le long du ruban (même formule que pavillon.py)
        float w = uRubMelange * (0.5 - 0.5 * cos(6.2832 * t * longueur / uRubPeriode));
        eRuban += mix(uRubCouleur, uRubCouleur2, w) * eclairement(p, n, s, uRubAxe[r], uRubForce * pas / 3.1416, 1.5708, 0.04);
      }
      couleur += eRuban;
    }
    // Lumière d'un mur lambertien : albédo × éclairement / π ; lumière renvoyée approchée par un fond uniforme
    vec3 lumiere = couleur / 3.1416 + vec3(uRebond);
    gl_FragColor = vec4(uAlbedo * lumiere * uLumiere, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

/** Réglages de la touche M, d'après ceux qui ont été figés (eclairage.json) */
function schema(r: EclairageSite) {
  return {
    direct: { value: false, label: 'aperçu en direct' },
    puitsActif: { value: r.puits.actif, label: 'puits' },
    puitsForce: { value: r.puits.force, min: 0, max: 20000, step: 50, label: 'force du puits' },
    puitsCouleur: { value: r.puits.couleur, label: 'couleur du puits' },
    puitsOuverture: { value: r.puits.ouverture, min: 5, max: 180, step: 1, label: 'ouverture (°)' },
    rubansActifs: { value: r.rubans.actif, label: 'rubans au pied des murs' },
    rubansForce: { value: r.rubans.force, min: 0, max: 400, step: 1, label: 'force des rubans (par m)' },
    rubansCouleur: { value: r.rubans.couleur, label: 'couleur des rubans' },
    rubansCouleur2: { value: r.rubans.couleur2 ?? '#e3c9a1', label: 'seconde couleur' },
    rubansMelange: { value: r.rubans.melange ?? 0, min: 0, max: 1, step: 0.01, label: 'alternance des couleurs' },
    rubansPeriode: { value: r.rubans.periode ?? 4, min: 0.5, max: 20, step: 0.1, label: 'longueur d’alternance (m)' },
    lueurBleu: { value: r.lueur.bleu, min: 0, max: 3, step: 0.01, label: 'lueur bleue de l’œuvre (calcul)' },
    lueurRouge: { value: r.lueur.rouge, min: 0, max: 3, step: 0.01, label: 'lueur rouge de l’œuvre (calcul)' },
    // Lumière renvoyée par la salle, uniforme (le calcul en donne ≈ 0,02 hors de la flaque, 07/11)
    rebond: { value: 0.02, min: 0, max: 0.2, step: 0.001, label: 'lumière renvoyée (aperçu)' },
  }
}
type Valeurs = { [K in keyof ReturnType<typeof schema>]: ReturnType<typeof schema>[K]['value'] }

type Etat = { etat: 'libre' | 'calcul' | 'fini' | 'erreur'; debut?: number; fin?: number; message?: string }
const texteEtat = (e: Etat) => {
  const heure = (t?: number) => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')
  if (e.etat === 'calcul') return `calcul en cours depuis ${Math.round((Date.now() - (e.debut ?? Date.now())) / 60000)} min`
  if (e.etat === 'fini') return `calcul fini à ${heure(e.fin)}`
  if (e.etat === 'erreur') return `erreur : ${e.message ?? 'voir figer.log'}`
  return 'rien en cours'
}

export function EclairageDirect({ config, scene, uSalle, lumiere }: {
  config: SalleConfig
  scene: THREE.Object3D
  uSalle: UniformsSalle
  lumiere: number
}) {
  const ecl = config.eclairage!
  const dossier = dossierSalle('Éclairage', config)
  const derniers = useRef<Valeurs | null>(null)
  const [v, regler] = useControls(dossier, () => ({
    ...schema(ecl.reglages),
    'Figer (calcul ≈ 20 min)': button(() => derniers.current && figer(config, derniers.current)),
    calcul: { value: 'rien en cours', editable: false, label: 'calcul' },
  }), [config.id]) as unknown as [Valeurs & { calcul: string }, (v: Record<string, unknown>) => void]
  useEffect(() => {
    derniers.current = v
  })

  // État du calcul, demandé au serveur de dev
  useEffect(() => {
    let fini = false
    const lire = async () => {
      try {
        const e = (await (await fetch('/__eclairage')).json()) as Etat
        if (!fini) regler({ calcul: texteEtat(e) })
      } catch {
        /* serveur de dev arrêté */
      }
    }
    lire()
    const minuterie = setInterval(lire, 10000)
    return () => {
      fini = true
      clearInterval(minuterie)
    }
  }, [regler])

  // Uniforms communs aux matières en direct (lumières), et une matière par matière de l'espace central
  const lumieres = useMemo(() => {
    const l = ecl.lumieres
    const vec = (t: number[]) => new THREE.Vector3(...t)
    const liste = (f: (i: number) => THREE.Vector3) => Array.from({ length: MAX_RUBANS }, (_, i) => f(i))
    return {
      uVersSalle: uSalle.uVersSalle,
      uLumiere: { value: 1 },
      uRebond: { value: 0 },
      uPuitsSource: { value: vec(l.puits.source) },
      uPuitsCouleur: { value: new THREE.Color() },
      uPuitsRayonSrc: { value: l.puits.rayonSource },
      uPuitsRayon: { value: l.puits.rayon },
      uPuitsH: { value: l.puits.hauteurOuverture },
      uPuitsForce: { value: 0 },
      uPuitsDemiAngle: { value: 0.3 },
      uRubA: { value: liste((i) => vec(l.rubans[i]?.a ?? [0, 0, 0])) },
      uRubB: { value: liste((i) => vec(l.rubans[i]?.b ?? [0, 0, 0])) },
      uRubAxe: { value: liste((i) => vec(l.rubans[i]?.axe ?? [0, 1, 0])) },
      uNbRubans: { value: Math.min(l.rubans.length, MAX_RUBANS) },
      uRubForce: { value: 0 },
      uRubCouleur: { value: new THREE.Color() },
      uRubCouleur2: { value: new THREE.Color() },
      uRubPeriode: { value: 4 },
      uRubMelange: { value: 0 },
    }
  }, [ecl.lumieres, uSalle])
  const matieres = useMemo(() => {
    const m: Record<string, THREE.ShaderMaterial> = {}
    for (const [nom, { lightmap }] of Object.entries(config.matieres)) {
      if (lightmap !== ecl.atlas) continue
      m[nom] = new THREE.ShaderMaterial({
        name: `${nom}Direct`,
        uniforms: { ...lumieres, uAlbedo: { value: new THREE.Color() } },
        vertexShader: SOMMETS,
        fragmentShader: FRAGMENTS,
        side: THREE.DoubleSide,
      })
    }
    return m
  }, [config.matieres, ecl.atlas, lumieres])
  useEffect(() => () => Object.values(matieres).forEach((m) => m.dispose()), [matieres])

  const echelle = ecl.lumieres.puits.echelle
  lumieres.uPuitsForce.value = v.puitsActif ? v.puitsForce * echelle : 0
  lumieres.uPuitsCouleur.value.set(v.puitsCouleur)
  lumieres.uPuitsDemiAngle.value = THREE.MathUtils.degToRad(v.puitsOuverture / 2)
  lumieres.uRubForce.value = v.rubansActifs ? v.rubansForce * echelle : 0
  lumieres.uRubCouleur.value.set(v.rubansCouleur)
  lumieres.uRubCouleur2.value.set(v.rubansCouleur2)
  lumieres.uRubPeriode.value = v.rubansPeriode
  lumieres.uRubMelange.value = v.rubansMelange
  lumieres.uRebond.value = v.rebond
  lumieres.uLumiere.value = lumiere

  // À chaque image : matières de l'espace central en direct ou précalculées (l'effet de Salle peut les remettre)
  useFrame(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.Material
      const nom = mat.name.replace(/Direct$/, '')
      const direct = matieres[nom]
      if (!direct) return
      if (v.direct && mat !== direct) {
        mesh.userData.matierePrecalculee = mat
        mesh.material = direct
      } else if (!v.direct && mat === direct && mesh.userData.matierePrecalculee) {
        mesh.material = mesh.userData.matierePrecalculee
      }
      if (v.direct) direct.uniforms.uAlbedo.value.set(config.matieres[nom].couleur)
    })
  })
  return null
}

/** Écrit les réglages (eclairage.json) et lance le calcul (serveur de dev) */
async function figer(config: SalleConfig, v: Valeurs) {
  const couleurs = Object.fromEntries(
    Object.entries(config.matieres)
      .filter(([, m]) => m.lightmap === config.eclairage!.atlas)
      .map(([nom, m]) => [nom, m.couleur]),
  )
  const reglages: EclairageSite = {
    puits: { actif: v.puitsActif, force: v.puitsForce, couleur: v.puitsCouleur, ouverture: v.puitsOuverture },
    rubans: {
      actif: v.rubansActifs, force: v.rubansForce, couleur: v.rubansCouleur,
      couleur2: v.rubansCouleur2, melange: v.rubansMelange, periode: v.rubansPeriode,
    },
    lueur: { bleu: v.lueurBleu, rouge: v.lueurRouge },
    couleurs,
  }
  if (!window.confirm('Figer ces réglages et lancer le calcul de la lumière (≈ 20 min) ?')) return
  const reponse = await fetch('/__eclairage', {
    method: 'POST',
    body: JSON.stringify({ salle: config.id, reglages }),
  })
  if (!reponse.ok) window.alert(`Calcul refusé : ${await reponse.text()}`)
}
