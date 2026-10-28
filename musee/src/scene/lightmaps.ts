import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Lightmaps des salles, décodées hors du fil principal (ImageBitmap) : avec des images HTML,
 * le décodage avait lieu à l'envoi à la carte graphique, près de 0,1 s bloquée par lightmap
 * à l'arrivée dans une salle. Octets lus tels quels (encodage logarithmique, décodé dans les
 * shaders), sans retournement (convention glTF) : comme avant, avec flipY = false et NoColorSpace.
 * Une seule texture par fichier, partagée par la salle et ses couloirs.
 */
const reglerChargeur = (chargeur: THREE.Loader) =>
  (chargeur as THREE.ImageBitmapLoader).setOptions({
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })

const textures = new WeakMap<ImageBitmap, THREE.Texture>()

function texture(image: ImageBitmap) {
  let t = textures.get(image)
  if (!t) {
    t = new THREE.Texture(image)
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
  return texture(useLoader(THREE.ImageBitmapLoader, url, reglerChargeur) as ImageBitmap)
}

/** Plusieurs lightmaps ; la liste ne doit pas changer de longueur (une par atlas de la salle). */
export function useLightmaps(urls: string[]) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return urls.map((url) => useLightmap(url))
}

export function prechargerLightmaps(urls: string[]) {
  for (const url of urls) useLoader.preload(THREE.ImageBitmapLoader, url, reglerChargeur)
}
