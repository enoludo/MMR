import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { UniformsReflet } from './pierre'

/** Calque réservé à ce qui se reflète au sol (la sculpture et ses lumières). */
export const CALQUE_REFLET = 1

/** Sculptures chargées (une par salle) : chaque passe de reflet ne montre que la sienne. */
const sculptures = new Set<THREE.Object3D>()

/** Uniforms partagés entre la passe de reflet et les matières du sol. */
export function creerUniformsReflet(): UniformsReflet {
  return {
    tReflet: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTexelReflet: { value: new THREE.Vector2(1, 1) },
    uForceReflet: { value: 0.16 },
    uFlouReflet: { value: 10 },
  }
}

/** Uniforms de la sculpture : occlusion (précalculée par sommet) et mode « reflet ». */
export type UniformsSculpture = {
  uOcclusion: { value: number }
  uOcclusionDirecte: { value: number }
  uReflet: { value: number }
  uLongueurReflet: { value: number }
}

/**
 * Prépare le matériau de la sculpture :
 * - occlusion ambiante par sommet (attribut _occlusion, calculé avec le sol : voir
 *   blender/occlusion.mjs). Elle assombrit les creux et surtout le bas des pieds,
 *   qui reçoivent moins de lumière du ciel : la sculpture « pèse » sur le sol ;
 * - mode reflet : la couleur s'éteint avec la hauteur, l'alpha porte cette atténuation.
 */
export function preparerSculpture(m: THREE.MeshStandardMaterial, u: UniformsSculpture) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _occlusion;\nvarying float vOcc;\nvarying float vHauteur;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvOcc = _occlusion;\nvHauteur = (modelMatrix * vec4(transformed, 1.0)).y;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vOcc;\nvarying float vHauteur;\nuniform float uOcclusion;\nuniform float uOcclusionDirecte;\nuniform float uReflet;\nuniform float uLongueurReflet;',
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        {
          float occ = mix(1.0, vOcc, uOcclusion);
          reflectedLight.indirectDiffuse *= occ;
          reflectedLight.indirectSpecular *= occ;
          float occD = mix(1.0, occ, uOcclusionDirecte);
          reflectedLight.directDiffuse *= occD;
          reflectedLight.directSpecular *= occD;
        }`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        `if (uReflet > 0.5) {
          float f = exp(-max(vHauteur, 0.0) / uLongueurReflet);
          gl_FragColor = vec4(gl_FragColor.rgb * f, f);
        }
        #include <tonemapping_fragment>`,
      )
  }
  m.customProgramCacheKey = () => 'sculpture-ao-reflet'
  m.needsUpdate = true
}

/**
 * Passe de reflet, à chaque image : la sculpture est rendue depuis la caméra
 * symétrique par rapport au sol (y = 0), à mi-résolution, dans une image que le sol
 * lit à la position de chaque pixel. Les éléments posés devant (les pieds) masquent
 * naturellement le reflet, puisque le sol n'est dessiné que là où il est visible.
 * Pendant un passage, deux salles sont chargées : la sculpture de l'autre salle est
 * masquée le temps de la passe (sinon elle se refléterait sur ce sol-ci).
 */
export function PasseReflet({
  sculpture,
  materiaux,
  uSol,
  uSculpture,
}: {
  sculpture: THREE.Object3D
  materiaux: THREE.MeshStandardMaterial[]
  uSol: UniformsReflet
  uSculpture: UniformsSculpture
}) {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    sculptures.add(sculpture)
    return () => {
      sculptures.delete(sculpture)
    }
  }, [sculpture])
  const masquees = useMemo<THREE.Object3D[]>(() => [], [])

  const { cible, camReflet, symetrie } = useMemo(() => {
    const cible = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
    cible.texture.minFilter = cible.texture.magFilter = THREE.LinearFilter
    cible.texture.generateMipmaps = false
    const camReflet = new THREE.PerspectiveCamera()
    camReflet.matrixAutoUpdate = false
    camReflet.matrixWorldAutoUpdate = false
    camReflet.layers.set(CALQUE_REFLET)
    return { cible, camReflet, symetrie: new THREE.Matrix4().makeScale(1, -1, 1) }
  }, [])

  useEffect(() => {
    uSol.tReflet.value = cible.texture
    return () => cible.dispose()
  }, [cible, uSol])

  const taille = useMemo(() => new THREE.Vector2(), [])
  const fond = useMemo(() => new THREE.Color(), [])

  useFrame(({ scene, camera }) => {
    if (uSol.uForceReflet.value <= 0) return

    // Taille : la moitié de l'image affichée (suit le DPR adaptatif)
    gl.getDrawingBufferSize(taille)
    const w = Math.max(1, Math.round(taille.x / 2))
    const h = Math.max(1, Math.round(taille.y / 2))
    if (cible.width !== w || cible.height !== h) cible.setSize(w, h)
    uSol.uResolution.value.copy(taille)
    uSol.uTexelReflet.value.set(1 / w, 1 / h)

    // Caméra symétrique (même projection : un point reflété tombe au même pixel)
    const cam = camera as THREE.PerspectiveCamera
    cam.updateMatrixWorld()
    camReflet.projectionMatrix.copy(cam.projectionMatrix)
    camReflet.projectionMatrixInverse.copy(cam.projectionMatrixInverse)
    camReflet.matrixWorld.multiplyMatrices(symetrie, cam.matrixWorld)
    camReflet.matrixWorldInverse.copy(camReflet.matrixWorld).invert()

    // La symétrie inverse le sens des faces : on dessine les faces arrière
    const fondScene = scene.background
    const alpha = gl.getClearAlpha()
    gl.getClearColor(fond)
    const ombres = gl.shadowMap.autoUpdate
    scene.background = null
    gl.shadowMap.autoUpdate = false
    for (const m of materiaux) m.side = THREE.BackSide
    uSculpture.uReflet.value = 1
    masquees.length = 0
    for (const o of sculptures) {
      if (o !== sculpture && o.visible) {
        o.visible = false
        masquees.push(o)
      }
    }

    gl.setRenderTarget(cible)
    gl.setClearColor(0x000000, 0)
    gl.clear()
    gl.render(scene, camReflet)
    gl.setRenderTarget(null)

    for (const o of masquees) o.visible = true
    uSculpture.uReflet.value = 0
    for (const m of materiaux) m.side = THREE.FrontSide
    gl.shadowMap.autoUpdate = ombres
    scene.background = fondScene
    gl.setClearColor(fond, alpha)
  }, -1)

  return null
}
