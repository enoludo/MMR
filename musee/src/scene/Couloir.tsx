import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLightmap } from './lightmaps'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Porte, SalleConfig } from '../salles/types'
import { GLSL_PIERRE, textureBruit, uniformsOmbres } from './pierre'
import { LONGUEUR_COULOIR, matricePlacement, placementArrivee, placementCouloir, sallesPretes } from './passage'
import { store } from '../store'
import { GLSL_SORTIE, uSortie } from './Effets'
import { useReglagesSalle } from '../reglages'
import { AMBIANCE_CHAUDE, PARTIE_COULEURS, schemaCouleurs } from '../salles/couleurs'
import { couloirsEntreSalles } from '../salles/couloirs'

/**
 * Couloir entre deux salles, derrière la porte (références : references/couloir).
 *
 * Plongé dans la pénombre, il reçoit un soleil bas par une suite de fentes verticales
 * percées dans une de ses parois : la lumière dessine des bandes douces en travers du sol
 * et sur la paroi d'en face, et des rayons dans l'air. Le long de l'autre paroi, une fente
 * zénithale (le prolongement de celle de la salle) laisse tomber le soleil de la salle.
 * Le soleil du couloir est donné dans le repère de la salle (il vient de l'est) : le même
 * couloir, vu depuis ses deux salles, est éclairé de la même façon.
 *
 * Tout est calculé en direct, sans précalcul : pour chaque point, le shader suit le
 * rayon vers le soleil et regarde s'il passe par une fente (les fentes sont régulières,
 * le calcul est exact). Le flou des bords grandit avec la distance à la fente, comme une
 * vraie pénombre. Les réglages (touche M, « Couloir ») s'appliquent immédiatement.
 *
 * Repère du couloir : origine au seuil de la porte, axe −z vers l'extérieur de la salle,
 * x de −largeur/2 (paroi à fentes) à +largeur/2 (fente zénithale). Il est aussi haut que la
 * porte. Quand les fentes doivent être à droite, le couloir est retourné (placementCouloir).
 * `traverse` : on le traverse en ce moment ; la vraie salle remplace la lueur du bout.
 *
 * Raccord avec la salle : le sol, le plafond et le mur qui se prolongent dans le couloir
 * (la porte est au bord de son mur) reprennent, au seuil, la lumière précalculée de la salle
 * au même endroit (sa lightmap), puis passent en quelques mètres à celle du couloir. Depuis le
 * 07/11, de même au bout, avec la salle voisine (RaccordBout).
 *
 * Un même couloir, vu de ses deux salles (07/11, saut de lumière à l'arrivée signalé par Ludovic) :
 * pendant un passage on traverse le couloir de la salle de départ ; à l'arrivée, il est remplacé par
 * celui de la salle d'arrivée. Les deux doivent être identiques : réglages « Couloir » de la salle
 * dont c'est la sortie (`reglagesDuCouloir`), raccords aux deux bouts, paroi ensoleillée du dehors
 * absente si l'une des deux salles a un vrai dehors.
 */
/** Durée du fondu de la lueur du bout, au départ d'un passage (s) */
const FONDU_LUEUR = 0.6
/** Lueur au seuil du couloir traversé : de 0 à 1 entre ces distances de la caméra au bout du couloir, dans la salle d'arrivée (m) */
const LUEUR_SEUIL: [number, number] = [2, 9]

/** Fente zénithale du couloir : largeur et profondeur (FENTE, FENTE_P dans blender/salle.py) */
const FENTE_ZENITHALE: [number, number] = [0.9, 3]

export function Couloir({
  config,
  porte,
  traverse,
  voisine,
}: {
  config: SalleConfig
  porte: Porte
  traverse: boolean
  /**
   * Salle au bout du couloir (œuvre suivante par la sortie, précédente par l'entrée ; aucune pour
   * une impasse) : les couleurs (pierre, lumière diffuse, soleil des fentes) passent de celles de la
   * salle à celles de la voisine le long du couloir
   */
  voisine?: SalleConfig
}) {
  const c = useReglagesSalle(reglagesDuCouloir(config, porte, voisine), 'Couloir', {
    soleil: { value: 1.2, min: 0, max: 4, step: 0.01 },
    hauteurSoleil: { value: 32, min: 5, max: 75, step: 1, label: 'hauteur du soleil (°)' },
    // D'où vient le soleil, depuis le nord dans le sens horaire (90 = est). Une paroi épaisse ne
    // laisse passer qu'un soleil presque face à elle (sinon la fente est « bouchée »)
    azimut: { value: 60, min: 0, max: 180, step: 1, label: 'direction du soleil (°, 90 = est)' },
    douceur: { value: 0.08, min: 0, max: 0.2, step: 0.002, label: 'douceur des bords (m par m)' },
    zenithal: { value: 1.2, min: 0, max: 4, step: 0.01, label: 'soleil de la fente zénithale' },
    ambiance: { value: 0.0015, min: 0, max: 0.05, step: 0.0005 },
    rebond: { value: 0.012, min: 0, max: 0.1, step: 0.001, label: 'rebonds' },
    portes: { value: 0.012, min: 0, max: 0.5, step: 0.001, label: 'lumière des portes' },
    fonduPorte: { value: 2.5, min: 0.3, max: 8, step: 0.1, label: 'portée de la lumière des portes (m)' },
    raccord: { value: 4, min: 0.5, max: 12, step: 0.1, label: 'raccord avec la salle (m)' },
    rayons: { value: 0.14, min: 0, max: 0.3, step: 0.005, label: 'rayons dans l’air' },
    dehors: { value: 1, min: 0, max: 3, step: 0.05, label: 'lumière du dehors' },
    fente: { value: 1, min: 0.05, max: 1.5, step: 0.01, label: 'largeur des fentes (m)' },
    nombre: { value: 6, min: 1, max: 12, step: 1, label: 'nombre de fentes' },
    pas: { value: 2, min: 0.6, max: 4, step: 0.05, label: 'écart des fentes (m)' },
    epaisseur: { value: 0.5, min: 0.1, max: 2, step: 0.05, label: 'épaisseur de la paroi (m)' },
    hauteurFente: { value: 14, min: 1, max: 20, step: 0.1, label: 'hauteur des fentes (m)' },
    // Passage d'une ambiance de couleur à l'autre, entre ces deux distances au seuil (m)
    debutAmbiance: { value: 2, min: 0, max: 14, step: 0.1, label: 'ambiance de la salle voisine : début (m)' },
    finAmbiance: { value: 12, min: 0, max: 14, step: 0.1, label: 'ambiance de la salle voisine : fin (m)' },
  })
  const autre = voisine ?? config
  // Couleurs de la salle (touche M, « Couleurs », appliquées à sa config par Salle) : le couloir les suit
  const couleurs = useReglagesSalle(config, PARTIE_COULEURS, schemaCouleurs(config))

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

  // Fentes régulières, centrées dans la longueur (6 × 1 m tous les 2 m : 1,5 m plein aux bouts)
  const fentes = useMemo(
    () => ({ nombre: c.nombre, pas: c.pas, premiere: -(L - (c.nombre - 1) * c.pas) / 2 }),
    [L, c.nombre, c.pas],
  )
  const ferme = !!porte.couloir?.ferme
  const azimut = porte.couloir?.azimut ?? c.azimut

  // Fente zénithale le long de la paroi pleine (+x) : [début, fin] en z (vers l'extérieur, z < 0)
  const zenithale = porte.couloir?.fenteZenithale
  const zenith = useMemo(() => new THREE.Vector2(-(zenithale?.[1] ?? 0), -(zenithale?.[0] ?? 0)), [zenithale])

  // Passage du repère de la salle à celui du couloir (rotation, symétrie) pour les directions
  const versCouloir = useMemo(
    () => new THREE.Matrix3().setFromMatrix4(matricePlacement(placementCouloir(porte))).invert(),
    [porte],
  )

  const uniforms = useMemo(
    () => ({
      // Texture de la pierre : celle des salles (réduite de moitié le 31/10, Salle.tsx)
      uGrain: { value: 0.025 },
      uVoile: { value: 0.0175 },
      uNuances: { value: 0.035 },
      uBruit: { value: textureBruit },
      uK: { value: atlas.k },
      uSoleilDir: { value: new THREE.Vector3() },
      uSoleil: { value: new THREE.Color() },
      uDouceur: { value: 0.05 },
      // Fente zénithale : soleil de la salle (repère du couloir), étendue en z, largeur et profondeur
      uZenithDir: { value: new THREE.Vector3(...config.soleil.direction).normalize().applyMatrix3(versCouloir) },
      uZenithSoleil: { value: new THREE.Color() },
      uZenith: { value: zenith },
      uZenithActif: { value: zenithale ? 1 : 0 },
      uZenithLargeur: { value: FENTE_ZENITHALE[0] },
      uZenithProfondeur: { value: FENTE_ZENITHALE[1] },
      uZenithFlou: { value: Math.tan(THREE.MathUtils.degToRad(config.soleil.angle)) / 2 },
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
      uTeinteDiffus: { value: new THREE.Color(config.ambiance?.couloir ?? new THREE.Color(1, 0.88, 0.76)) },
      uCouleurMur: { value: new THREE.Color(config.matieres.Mur?.couleur ?? '#c4bcb1') },
      uCouleurPlafond: { value: new THREE.Color(config.matieres.Plafond?.couleur ?? '#bcb6af') },
      // Les mêmes, pour la salle voisine (au bout du couloir)
      uCouleurSol2: { value: new THREE.Color(autre.matieres.Sol?.couleur ?? '#a29b95') },
      uTeinteDiffus2: { value: new THREE.Color(autre.ambiance?.couloir ?? new THREE.Color(1, 0.88, 0.76)) },
      uCouleurMur2: { value: new THREE.Color(autre.matieres.Mur?.couleur ?? '#c4bcb1') },
      uCouleurPlafond2: { value: new THREE.Color(autre.matieres.Plafond?.couleur ?? '#bcb6af') },
      uSoleil2: { value: new THREE.Color() },
      uZenithSoleil2: { value: new THREE.Color() },
      uFonduAmbiance: { value: new THREE.Vector2(2, 12) },
      uPlacement: { value: matricePlacement(placementCouloir(porte)) },
      uLightmapSalle: { value: lightmap },
      // Courbe des ombres de la salle (touche M « Salle », pierre.ts), suivie au raccord
      ...uniformsOmbres(config.id),
      uEchelleSalle: { value: atlas.echelle },
      uRaccordSol: { value: raccords.sol ?? new THREE.Vector4() },
      uRaccordPlafond: { value: raccords.plafond ?? new THREE.Vector4() },
      uRaccordMur: { value: raccords.mur ?? new THREE.Vector4() },
      uRaccordActif: { value: new THREE.Vector3(+!!raccords.sol, +!!raccords.plafond, +!!raccords.mur) },
      uCoteMur: { value: raccords.coteMur || 1 },
      uFonduRaccord: { value: 4 },
      // Raccord au bout, avec la salle voisine (RaccordBout ; éteint tant qu'elle n'est pas chargée)
      ...uniformsBout(),
    }),
    [L, W, H, config.matieres, config.soleil, autre, porte, atlas, lightmap, raccords, versCouloir, zenith, zenithale],
  )

  // Avant la première image (useLayoutEffect) : un couloir monté à l'arrivée d'un passage (celui de la porte
  // d'arrivée) était dessiné une fois sans soleil ni ambiance, noir (flash vu par Ludovic le 07/11)
  useLayoutEffect(() => {
    const h = THREE.MathUtils.degToRad(c.hauteurSoleil)
    const a = THREE.MathUtils.degToRad(azimut)
    // Direction de propagation dans le repère de la salle (x = est, −z = nord), puis du couloir
    uniforms.uSoleilDir.value
      .set(-Math.sin(a) * Math.cos(h), -Math.sin(h), Math.cos(a) * Math.cos(h))
      .applyMatrix3(versCouloir)
      .normalize()
    uniforms.uCouleurSol.value.set(config.matieres.Sol?.couleur ?? '#a29b95')
    uniforms.uCouleurMur.value.set(config.matieres.Mur?.couleur ?? '#c4bcb1')
    uniforms.uCouleurPlafond.value.set(config.matieres.Plafond?.couleur ?? '#bcb6af')
    uniforms.uTeinteDiffus.value.set(config.ambiance?.couloir ?? AMBIANCE_CHAUDE.couloir)
    uniforms.uCouleurSol2.value.set(autre.matieres.Sol?.couleur ?? '#a29b95')
    uniforms.uCouleurMur2.value.set(autre.matieres.Mur?.couleur ?? '#c4bcb1')
    uniforms.uCouleurPlafond2.value.set(autre.matieres.Plafond?.couleur ?? '#bcb6af')
    uniforms.uTeinteDiffus2.value.set(autre.ambiance?.couloir ?? AMBIANCE_CHAUDE.couloir)
    uniforms.uSoleil.value.set(config.soleil.couleur).multiplyScalar(c.soleil)
    uniforms.uZenithSoleil.value.set(config.soleil.couleur).multiplyScalar(c.zenithal)
    uniforms.uSoleil2.value.set(autre.soleil.couleur).multiplyScalar(c.soleil)
    uniforms.uZenithSoleil2.value.set(autre.soleil.couleur).multiplyScalar(c.zenithal)
    uniforms.uFonduAmbiance.value.set(c.debutAmbiance, Math.max(c.finAmbiance, c.debutAmbiance + 0.01))
    uniforms.uDouceur.value = c.douceur
    uniforms.uAmbiance.value = c.ambiance
    uniforms.uRebond.value = c.rebond * c.soleil
    uniforms.uLumierePorte.value = c.portes
    uniforms.uFonduPorte.value = c.fonduPorte
    uniforms.uFonduRaccord.value = c.raccord
    uniforms.uBrume.value = c.rayons
    uniforms.uEpaisseur.value = c.epaisseur
    uniforms.uHautFente.value = Math.min(c.hauteurFente, H - 0.3)
    uniforms.uPas.value = fentes.pas
    uniforms.uFente.value = c.fente
    uniforms.uPremiere.value = fentes.premiere
    uniforms.uNombre.value = fentes.nombre
  }, [uniforms, c, fentes, H, versCouloir, config, autre, couleurs, azimut])

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
    const [fz, pz] = FENTE_ZENITHALE
    // Raccords avec les salles, aux deux bouts. Une paroi du couloir prolonge un mur de la salle
    // (même plan) : elle s'arrête pile sur le seuil, et une collerette cachée derrière son plan
    // bouche la jointure (sinon on voit le dehors à travers, en pointillés). L'autre paroi bute
    // contre le mur de la salle, perpendiculaire : elle s'arrête 1 cm avant, pour que son chant
    // ne se superpose pas à ce mur (scintillement). Au bout, la salle d'arrivée a sa porte au bord
    // opposé de son mur : les rôles des deux parois s'inversent.
    const prolongeSeuil = raccords.coteMur // +1 : la paroi +x prolonge le mur de la salle
    const RETRAIT = 0.01
    const COL = 0.3 // longueur des collerettes, côté salle
    const debut = (cote: number) => (cote === prolongeSeuil ? 0 : -RETRAIT) // au seuil (z = 0)
    const fin = (cote: number) => (ferme || cote === -prolongeSeuil ? -L : -L + RETRAIT) // au bout (z = -L)
    const fenteAuSeuil = zenithale && zenith.y > -0.01
    const fenteAuBout = zenithale && zenith.x < -L + 0.01

    pave(x - e, W / 2 + 0.2, -0.2, 0, -L, 0) // sol (jusque sous les parois)
    // Plafond, ouvert le long de la paroi pleine par la fente zénithale, et sa paroi intérieure
    if (zenithale) {
      const [z0, z1] = [zenith.x, zenith.y]
      pave(x - e, W / 2 - fz, H, H + 0.2, -L, 0)
      pave(W / 2 - fz, W / 2 + 0.2, H, H + 0.2, -L, z0)
      pave(W / 2 - fz, W / 2 + 0.2, H, H + 0.2, z1, 0)
      pave(W / 2 - fz - 0.2, W / 2 - fz, H, H + pz, z0, z1)
      // Extrémités : fermées, sauf du côté d'une salle, où la fente continue dans celle de la salle
      if (!fenteAuBout) pave(W / 2 - fz, W / 2, H, H + pz, z0 - 0.2, z0)
      if (!fenteAuSeuil) pave(W / 2 - fz, W / 2, H, H + pz, z1, z1 + 0.2)
    } else {
      pave(x - e, W / 2 + 0.2, H, H + 0.2, -L, 0)
    }
    // Paroi pleine, d'un seul tenant jusqu'en haut de la fente zénithale (au-dessus du plafond,
    // hors de la fente, elle est cachée)
    pave(W / 2, W / 2 + 0.2, 0, H + (zenithale ? pz : 0), fin(1), debut(1))
    // Paroi à fentes : trumeaux pleins entre les fentes, linteau au-dessus de chacune (qui empiète
    // de 2 cm sur les trumeaux : pas de jointure ouverte entre eux)
    let bord = debut(-1)
    for (let k = 0; k < fentes.nombre; k++) {
      const zc = fentes.premiere - k * fentes.pas
      pave(x - e, x, 0, H, zc + c.fente / 2, bord)
      pave(x - e, x, hf, H, zc - c.fente / 2 - 0.02, zc + c.fente / 2 + 0.02)
      bord = zc - c.fente / 2
    }
    pave(x - e, x, 0, H, fin(-1), bord)

    // Collerettes, derrière les surfaces qui prolongent celles des salles, aux deux bouts
    const collerettes = (z0: number, z1: number, prolonge: number, fente: boolean) => {
      pave(x - e, W / 2 + 0.2, -0.2, -RETRAIT, z0, z1) // sous le sol
      pave(x - e, fente ? W / 2 - fz - 0.2 : W / 2 + 0.2, H + RETRAIT, H + 0.2, z0, z1) // sur le plafond
      if (prolonge === 1) pave(W / 2 + RETRAIT, W / 2 + 0.2, 0, H + (fente ? pz : 0), z0, z1)
      else pave(x - e, x - RETRAIT, 0, H, z0, z1)
      if (fente) pave(W / 2 - fz - 0.2, W / 2 - fz - RETRAIT, H, H + pz, z0, z1) // derrière la paroi intérieure de la fente
    }
    if (prolongeSeuil) {
      collerettes(0, COL, prolongeSeuil, !!fenteAuSeuil)
      if (!ferme) collerettes(-L - COL, -L, -prolongeSeuil, !!fenteAuBout)
    }
    // Impasse : fermée au bout par un mur plein
    if (ferme) pave(x - e, W / 2 + 0.2, -0.2, H + 0.2, -L - 0.3, -L)
    const g = mergeGeometries(paves)
    paves.forEach((p) => p.dispose())
    return g
  }, [W, H, L, c.epaisseur, c.fente, c.hauteurFente, fentes, zenithale, zenith, raccords.coteMur, ferme])
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
          'vec3 outgoingLight = couleurCouloir(normalize(vNormLocal), ambianceVoisine(vLocal)) * pierre(vPosPierre, vNormPierre) * eclairageCouloir(vLocal, normalize(vNormLocal));',
        )
    }
    m.customProgramCacheKey = () => 'couloir-v8'
    return m
  }, [uniforms])

  const rayons = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, ...uSortie },
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
          ${GLSL_SORTIE}
          uniform vec3 uSoleil;
          uniform vec3 uSoleil2;
          uniform vec3 uZenithSoleil;
          uniform vec3 uZenithSoleil2;
          uniform float uBrume;
          uniform float uLongueur;
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
            float sommeZ = 0.0;
            // Couleur du soleil le long du rayon (celle de la salle, puis de la voisine)
            vec3 teinte = vec3(0.0);
            vec3 teinteZ = vec3(0.0);
            for (int i = 0; i < N; i++) {
              vec3 q = vCamera + d * (entree + (float(i) + decalage) * pas);
              float f = ambianceVoisine(q);
              float s = soleilFentes(q, 0.0);
              float sz = soleilZenith(q, 0.0);
              somme += s;
              sommeZ += sz;
              teinte += s * mix(uSoleil, uSoleil2, f);
              teinteZ += sz * mix(uZenithSoleil, uZenithSoleil2, f);
            }
            teinte /= max(somme, 1e-4);
            teinteZ /= max(sommeZ, 1e-4);
            float longueur = somme * pas * length(d);
            // Plus lumineux quand on regarde vers le soleil (diffusion vers l'avant)
            float face = pow(max(dot(normalize(d), -uSoleilDir), 0.0), 3.0);
            float lum = (1.0 - exp(-longueur * uBrume)) * (0.5 + 1.5 * face);
            float faceZ = pow(max(dot(normalize(d), -uZenithDir), 0.0), 3.0);
            float lumZ = (1.0 - exp(-sommeZ * pas * length(d) * uBrume)) * (0.5 + 1.5 * faceZ);
            gl_FragColor = vec4(versSortie(teinte * lum + teinteZ * lumZ), 1.0);
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

  const dehors = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3e2', transparent: true }), [])
  const meshDehors = useRef<THREE.Mesh>(null)
  dehors.color.set('#fff3e2').multiplyScalar(c.dehors)
  // Au bout, la porte de la salle suivante : une lueur, remplacée par la vraie salle pendant un passage.
  // En fondu dans les deux sens (07/11, sauts vus par Ludovic) : au départ, elle s'efface une fois la salle
  // d'arrivée prête (cachée le temps de sa préparation) ; à l'arrivée, le couloir traversé est remplacé par
  // celui de la salle d'arrivée, dont la lueur cache la salle quittée : la même lueur, posée au seuil du
  // couloir traversé, apparaît pendant qu'on s'éloigne dans la salle d'arrivée.
  const lueur = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.04, 0.032), transparent: true }), [])
  const lueurSeuil = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.04, 0.032), transparent: true, opacity: 0, side: THREE.DoubleSide }),
    [],
  )
  const groupe = useRef<THREE.Group>(null)
  const meshBout = useRef<THREE.Mesh>(null)
  const meshSeuil = useRef<THREE.Mesh>(null)
  const fondu = useRef({ bout: 1, camera: new THREE.Vector3() })
  useFrame(({ camera }, dt) => {
    const g = groupe.current
    if (!g || !meshBout.current || !meshSeuil.current) return
    const f = fondu.current
    const passage = store.get().passage
    // Couloir traversé, gardé une image après l'arrivée (Navigation.arriver) : son bout donne sur la salle d'arrivée
    const visee = traverse && (!passage || sallesPretes.has(passage.cle)) ? 0 : 1
    f.bout = visee < f.bout ? Math.max(visee, f.bout - Math.min(dt, 0.05) / FONDU_LUEUR) : visee
    lueur.opacity = f.bout
    meshBout.current.visible = !ferme && f.bout > 0.001
    // Au seuil : selon l'avancée de la caméra dans la salle d'arrivée, au-delà du bout du couloir
    const zc = traverse ? g.worldToLocal(f.camera.copy(camera.position)).z : 0
    lueurSeuil.opacity = traverse ? THREE.MathUtils.smoothstep(-L - zc, LUEUR_SEUIL[0], LUEUR_SEUIL[1]) : 0
    meshSeuil.current.visible = lueurSeuil.opacity > 0.001
    // Paroi ensoleillée derrière les fentes, selon où est la caméra (07/11) : effacée du côté d'une salle qui a un
    // vrai dehors (pavillon : on la verrait par ses baies, et ce dehors se voit par les fentes), en fondu le long du
    // couloir. Avant, elle était absente dès que l'une des deux salles avait un dehors : vu de l'autre salle, le
    // dehors visible par les fentes disparaissait avec le pavillon à l'arrivée d'un passage (traits lumineux)
    if (meshDehors.current) {
      const zd = g.worldToLocal(f.camera.copy(camera.position)).z
      const vu = (d?: boolean) => (d ? 0 : 1)
      const visible = THREE.MathUtils.lerp(vu(config.dehors), vu((voisine ?? config).dehors), THREE.MathUtils.smoothstep(-zd, 0, L))
      dehors.opacity = visible
      meshDehors.current.visible = visible > 0.001
    }
  })
  // Le ciel vu par la fente zénithale (comme celui de la salle, Salle.tsx)
  const ciel = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.9, 3.4), side: THREE.DoubleSide }), [])

  return (
    <group ref={groupe} position={placement.position} rotation-y={placement.rotationY} scale-x={placement.miroir ? -1 : 1} userData={{ couloirTraverse: traverse }}>
      <mesh geometry={geometrie} material={pierre} />
      {/* Le dehors, vu par les fentes : une paroi ensoleillée (sans dépasser dans les salles), effacée du côté d'une
          salle qui a un vrai dehors (voir useFrame) */}
      <mesh ref={meshDehors} material={dehors} position={[-W / 2 - c.epaisseur - 1.5, H / 2 + 2, -L / 2]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[L, H + 6]} />
      </mesh>
      {zenithale && (
        // Un peu au-dessus du haut de la fente et un peu plus grand qu'elle (voir Ciel, Salle.tsx)
        <mesh material={ciel} position={[W / 2 - FENTE_ZENITHALE[0] / 2, H + FENTE_ZENITHALE[1] + 0.05, (zenith.x + zenith.y) / 2]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[FENTE_ZENITHALE[0] + 0.4, zenith.y - zenith.x + 0.4]} />
        </mesh>
      )}
      <mesh ref={meshBout} material={lueur} position={[0, H / 2, -L]} visible={!ferme}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh ref={meshSeuil} material={lueurSeuil} position={[0, H / 2, -0.02]} visible={false}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh geometry={volume} material={rayons} renderOrder={5} frustumCulled={false} />
      {voisine && !ferme && (
        <Suspense fallback={null}>
          <RaccordBout porte={porte} voisine={voisine} uniforms={uniforms as unknown as UniformsBout} />
        </Suspense>
      )}
    </group>
  )
}

/**
 * Réglages « Couloir » d'un couloir. Entre deux salles : réglages communs (salles/couloirs.ts), pour qu'un
 * couloir soit le même vu de ses deux salles et que tous se ressemblent. Une impasse : ceux de sa salle.
 */
export function reglagesDuCouloir(config: SalleConfig, porte: Porte, voisine?: SalleConfig) {
  return voisine && !porte.couloir?.ferme ? couloirsEntreSalles : config
}

/** Porte de la salle voisine qui donne sur ce couloir */
const porteEnFace = (porte: Porte, voisine: SalleConfig) => {
  const id = porte.id === 'sortie' ? 'entree' : 'sortie'
  return voisine.portes.find((p) => p.id === id) ?? voisine.portes[0]
}

const uniformsBout = () => ({
  uLightmapBout: { value: null as THREE.Texture | null },
  uKBout: { value: 1 },
  uEchelleBout: { value: 1 },
  uOmbresBout: { value: 1 },
  uPivotBout: { value: 1 },
  uRaccordSolBout: { value: new THREE.Vector4() },
  uRaccordPlafondBout: { value: new THREE.Vector4() },
  uRaccordMurBout: { value: new THREE.Vector4() },
  uRaccordActifBout: { value: new THREE.Vector3() },
  uCoteMurBout: { value: 1 },
  uMiroirBout: { value: 1 },
})
type UniformsBout = ReturnType<typeof uniformsBout>

/**
 * Raccord du bout du couloir avec la salle voisine, comme celui du seuil : sa lumière précalculée
 * au seuil de sa porte. Chargée à part (Suspense) : le couloir s'affiche sans l'attendre.
 * Le couloir vu depuis la voisine a son seuil à notre bout (z' = −L − z) ; x' = ±x selon les
 * symétries des deux couloirs (uMiroirBout).
 */
function RaccordBout({ porte, voisine, uniforms }: { porte: Porte; voisine: SalleConfig; uniforms: UniformsBout }) {
  const nomAtlas = voisine.matieres.Mur?.lightmap ?? 'salle'
  const atlas = voisine.lightmaps[nomAtlas]
  const gltf = useGLTF(voisine.modele)
  const lightmap = useLightmap(atlas.image)
  const enFace = porteEnFace(porte, voisine)
  const raccords = useMemo(() => raccordsSalle(gltf.scene, voisine, nomAtlas, enFace), [gltf.scene, voisine, nomAtlas, enFace])
  const miroir = useMemo(() => {
    // Point du couloir (notre repère) → notre salle → salle voisine posée au bout → repère du couloir vu d'elle
    const versNotreSalle = matricePlacement(placementCouloir(porte))
    const voisineDansNotre = matricePlacement(placementArrivee(porte, enFace))
    const versLeSien = matricePlacement(placementCouloir(enFace)).invert().multiply(voisineDansNotre.clone().invert()).multiply(versNotreSalle)
    const a = new THREE.Vector3(0, 0, -LONGUEUR_COULOIR / 2).applyMatrix4(versLeSien)
    const b = new THREE.Vector3(1, 0, -LONGUEUR_COULOIR / 2).applyMatrix4(versLeSien)
    return b.x - a.x < 0 ? -1 : 1
  }, [porte, enFace])
  useLayoutEffect(() => {
    uniforms.uLightmapBout.value = lightmap
    uniforms.uKBout.value = atlas.k
    uniforms.uEchelleBout.value = atlas.echelle
    if (raccords.sol) uniforms.uRaccordSolBout.value.copy(raccords.sol)
    if (raccords.plafond) uniforms.uRaccordPlafondBout.value.copy(raccords.plafond)
    if (raccords.mur) uniforms.uRaccordMurBout.value.copy(raccords.mur)
    uniforms.uCoteMurBout.value = raccords.coteMur || 1
    uniforms.uMiroirBout.value = miroir
    uniforms.uRaccordActifBout.value.set(+!!raccords.sol, +!!raccords.plafond, +!!raccords.mur)
    return () => {
      uniforms.uRaccordActifBout.value.set(0, 0, 0)
    }
  }, [uniforms, voisine, lightmap, atlas, raccords, miroir])
  // Courbe des ombres de la voisine (touche M « Salle · <voisine> »), suivie en direct
  const ombres = uniformsOmbres(voisine.id)
  useFrame(() => {
    uniforms.uOmbresBout.value = ombres.uOmbres.value
    uniforms.uPivotBout.value = ombres.uPivot.value
  })
  return null
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
uniform float uDouceur;
uniform vec3 uZenithDir;
uniform vec2 uZenith;
uniform float uZenithActif;
uniform float uZenithLargeur;
uniform float uZenithProfondeur;
uniform float uZenithFlou;
uniform float uHauteur;
uniform vec2 uFonduAmbiance;

// Part de l'ambiance de la salle voisine (0 au seuil → 1 vers le bout du couloir)
float ambianceVoisine(vec3 p) {
  return smoothstep(uFonduAmbiance.x, uFonduAmbiance.y, -p.z);
}

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
    float flou = 0.004 + t * uDouceur + flouPixel; // pénombre : le bord s'adoucit avec la distance
    float v = 1.0 - smoothstep(uHautFente - flou, uHautFente + flou, h.y);
    float k = clamp(floor((uPremiere - h.z) / uPas + 0.5), 0.0, uNombre - 1.0);
    float ecart = abs(h.z - (uPremiere - k * uPas));
    lum *= v * (1.0 - smoothstep(uFente * 0.5 - flou, uFente * 0.5 + flou, ecart));
  }
  return lum;
}

// Soleil de la salle tombé par la fente zénithale (le long de la paroi +x) : le rayon vers le
// soleil doit passer par l'ouverture au plafond et en haut de la fente
float soleilZenith(vec3 p, float flouPixel) {
  if (uZenithActif < 0.5) return 0.0;
  vec3 l = -uZenithDir;
  float lum = 1.0;
  for (int i = 0; i < 2; i++) {
    float hy = i == 0 ? uHauteur : uHauteur + uZenithProfondeur;
    if (p.y >= hy) return 0.0;
    float t = (hy - p.y) / l.y;
    vec3 h = p + t * l;
    float flou = 0.01 + t * uZenithFlou + flouPixel;
    float ex = uDemiLargeur - uZenithLargeur;
    lum *= smoothstep(ex - flou, ex + flou, h.x) * (1.0 - smoothstep(uDemiLargeur - flou, uDemiLargeur + flou, h.x));
    lum *= smoothstep(uZenith.x - flou, uZenith.x + flou, h.z) * (1.0 - smoothstep(uZenith.y - flou, uZenith.y + flou, h.z));
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
uniform vec3 uCouleurSol;
uniform vec3 uTeinteDiffus;
uniform vec3 uCouleurMur;
uniform vec3 uCouleurPlafond;
uniform vec3 uCouleurSol2;
uniform vec3 uTeinteDiffus2;
uniform vec3 uCouleurMur2;
uniform vec3 uCouleurPlafond2;
uniform vec3 uSoleil2;
uniform vec3 uZenithSoleil2;

vec3 couleurCouloir(vec3 n, float f) {
  return n.y > 0.5 ? mix(uCouleurSol, uCouleurSol2, f)
    : (n.y < -0.5 ? mix(uCouleurPlafond, uCouleurPlafond2, f) : mix(uCouleurMur, uCouleurMur2, f));
}

uniform sampler2D uLightmapSalle;
uniform float uEchelleSalle;
uniform vec4 uRaccordSol;
uniform vec4 uRaccordPlafond;
uniform vec4 uRaccordMur;
uniform vec3 uRaccordActif;
uniform float uCoteMur;
uniform float uFonduRaccord;
uniform vec3 uZenithSoleil;
uniform sampler2D uLightmapBout;
uniform float uKBout;
uniform float uEchelleBout;
uniform float uOmbresBout;
uniform float uPivotBout;
uniform vec4 uRaccordSolBout;
uniform vec4 uRaccordPlafondBout;
uniform vec4 uRaccordMurBout;
uniform vec3 uRaccordActifBout;
uniform float uCoteMurBout;
uniform float uMiroirBout;

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
  float flouPixel = length(fwidth(p)) * 0.7;
  float f = ambianceVoisine(p);
  float direct = max(dot(n, -uSoleilDir), 0.0) * soleilFentes(p, flouPixel);
  vec3 zenith = mix(uZenithSoleil, uZenithSoleil2, f) * max(dot(n, -uZenithDir), 0.0) * soleilZenith(p, flouPixel);
  // La lumière des salles entre par les deux portes et s'éteint vite
  float portes = exp(-max(-p.z, 0.0) / uFonduPorte) + exp(-max(p.z + uLongueur, 0.0) / uFonduPorte);
  // Rebonds : un peu de la lumière des taches de soleil, plus vers le bas
  float rebond = uRebond * (0.55 + 0.45 * n.y) * (0.7 + 0.3 * smoothstep(4.0, 0.0, p.y));
  // Lumière diffuse un peu chaude (rebonds sur la pierre), atténuée dans les coins
  vec3 diffus = mix(uTeinteDiffus, uTeinteDiffus2, f) * (uAmbiance + uLumierePorte * portes + rebond) * occlusionCouloir(p, n);
  // Surfaces qui prolongent celles de la salle : au seuil, la lumière précalculée de la salle
  // le long de la ligne de raccord (segment A → B de sa lightmap), fondue avec la profondeur
  bool sol = n.y > 0.5, plafond = n.y < -0.5, mur = !sol && !plafond && n.x * uCoteMur < -0.5;
  float actif = sol ? uRaccordActif.x : (plafond ? uRaccordActif.y : (mur ? uRaccordActif.z : 0.0));
  if (actif > 0.5) {
    vec4 r = sol ? uRaccordSol : (plafond ? uRaccordPlafond : uRaccordMur);
    float t = mur ? p.y / uHauteur : (p.x + uDemiLargeur) / (2.0 * uDemiLargeur);
    vec3 salle = courbeOmbres(decodeLightmap(texture2D(uLightmapSalle, mix(r.xy, r.zw, clamp(t, 0.0, 1.0))).rgb) * uEchelleSalle);
    float fondu = smoothstep(0.0, uFonduRaccord, -p.z);
    diffus = mix(salle, diffus, fondu);
    // La lumière précalculée de la salle contient déjà la lueur de la fente zénithale : celle du
    // couloir arrive en fondu, sinon elle s'ajoute au seuil (marche de luminosité)
    zenith *= fondu;
  }
  // Au bout, la même chose avec la salle voisine, dans le repère du couloir vu d'elle (x' = ±x)
  float xb = uMiroirBout * p.x;
  bool murBout = !sol && !plafond && uMiroirBout * n.x * uCoteMurBout < -0.5;
  float actifBout = sol ? uRaccordActifBout.x : (plafond ? uRaccordActifBout.y : (murBout ? uRaccordActifBout.z : 0.0));
  if (actifBout > 0.5) {
    vec4 r = sol ? uRaccordSolBout : (plafond ? uRaccordPlafondBout : uRaccordMurBout);
    float t = murBout ? p.y / uHauteur : (xb + uDemiLargeur) / (2.0 * uDemiLargeur);
    vec3 v = texture2D(uLightmapBout, mix(r.xy, r.zw, clamp(t, 0.0, 1.0))).rgb;
    vec3 x = (exp(v * log(1.0 + uKBout)) - 1.0) / uKBout * uEchelleBout;
    float l = max((x.r + x.g + x.b) / 3.0, 1e-6);
    vec3 voisine = l < uPivotBout ? x * (uPivotBout * pow(l / uPivotBout, uOmbresBout) / l) : x;
    float fondu = smoothstep(0.0, uFonduRaccord, p.z + uLongueur);
    diffus = mix(voisine, diffus, fondu);
    zenith *= fondu;
  }
  return diffus + mix(uSoleil, uSoleil2, f) * direct + zenith;
}
`

/**
 * Lignes de raccord entre la salle et le couloir, dans la lightmap de la salle : pour le sol,
 * le plafond et le mur qui se prolonge (la porte étant au bord de son mur), les
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
  // Le mur qui se prolonge est d'un côté ou de l'autre selon la porte (et la symétrie du couloir)
  const murDroite = segment('Mur', [W / 2, m, m], [W / 2, H - m, m])
  const murGauche = murDroite ? null : segment('Mur', [-W / 2, m, m], [-W / 2, H - m, m])
  return {
    sol: segment('Sol', [-W / 2 + m, 0, m], [W / 2 - m, 0, m]),
    plafond: segment('Plafond', [-W / 2 + m, H, m], [W / 2 - m, H, m]),
    mur: murDroite ?? murGauche,
    coteMur: murDroite ? 1 : murGauche ? -1 : 0,
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
