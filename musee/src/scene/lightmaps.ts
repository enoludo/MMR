import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

/**
 * Lightmaps des salles, décodées hors du fil principal (ImageBitmap) : avec des images HTML,
 * le décodage avait lieu à l'envoi à la carte graphique, près de 0,1 s bloquée par lightmap
 * à l'arrivée dans une salle. Octets lus tels quels (encodage logarithmique, décodé dans les
 * shaders), sans retournement (convention glTF) : comme avant, avec flipY = false et NoColorSpace.
 * Une seule texture par fichier, partagée par la salle et ses couloirs.
 *
 * Format KTX2 (blender/ktx2.mjs) : compressé, la carte graphique le lit tel quel (pas de
 * décodage, niveaux de détail fournis) : envoi sans arrêt de l'image, 4 fois moins de mémoire.
 * Transcodé dans des workers par le module Basis de three (public/basis-<version>, à recopier
 * de node_modules/three/examples/jsm/libs/basis si three change de version).
 */
const TRANSCODEUR = '/basis-0.186.1/'

const reglerChargeur = (chargeur: THREE.Loader) =>
  (chargeur as THREE.ImageBitmapLoader).setOptions({
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })

const estKtx2 = (url: string) => url.split('?')[0].endsWith('.ktx2')

const textures = new WeakMap<object, THREE.Texture>()

function texture(image: ImageBitmap | THREE.CompressedTexture) {
  let t = textures.get(image)
  if (!t) {
    t = (image as THREE.CompressedTexture).isCompressedTexture ? (image as THREE.CompressedTexture) : new THREE.Texture(image)
    t.flipY = false
    t.colorSpace = THREE.NoColorSpace
    t.channel = 0
    t.needsUpdate = true
    textures.set(image, t)
  }
  return t
}

/** Une lightmap (suspend le composant jusqu'au chargement). */
export function useLightmap(url: string) {
  const gl = useThree((s) => s.gl)
  const ktx2 = estKtx2(url)
  // Les deux chargeurs sont appelés à chaque fois (règle des hooks), un seul reçoit une adresse
  const compressee = useLoader(KTX2Loader, ktx2 ? url : [], (l) => (l as KTX2Loader).setTranscoderPath(TRANSCODEUR).detectSupport(gl))
  const bitmap = useLoader(THREE.ImageBitmapLoader, ktx2 ? [] : url, reglerChargeur)
  return texture((ktx2 ? compressee : bitmap) as ImageBitmap | THREE.CompressedTexture)
}

/** Plusieurs lightmaps ; la liste ne doit pas changer de longueur (une par atlas de la salle). */
export function useLightmaps(urls: string[]) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return urls.map((url) => useLightmap(url))
}

/**
 * Téléchargement à l'avance (hors du canvas, depuis la spirale aussi) : les KTX2 ne sont
 * transcodés qu'une fois le moteur de rendu connu, on ne fait ici que remplir le cache du navigateur.
 */
export function prechargerLightmaps(urls: string[]) {
  for (const url of urls) {
    if (estKtx2(url)) fetch(url).catch(() => {})
    else useLoader.preload(THREE.ImageBitmapLoader, url, reglerChargeur)
  }
}
