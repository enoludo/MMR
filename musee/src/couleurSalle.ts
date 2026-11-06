import type { Oeuvre } from './oeuvres'
import { versionLegere } from './version'
import { extractMoodColor } from './accueil/gallery/cardColor.js'

/**
 * Couleur de fond de la spirale propre à une œuvre (demande de Ludovic, 05/11 : fond des panneaux du
 * bas des salles sur mobile) : même calcul que la spirale (`extractMoodColor`, sur la même image que
 * sa carte, `versionLegere`), y compris quand on arrive directement dans la salle. Une fois par œuvre.
 */
const couleurs = new Map<string, Promise<string>>()

export function couleurSpirale(oeuvre: Oeuvre): Promise<string> {
  let couleur = couleurs.get(oeuvre.id)
  if (!couleur) {
    couleur = new Promise((ok) => {
      const image = new Image()
      image.onload = () => {
        const { r, g, b } = extractMoodColor(image)
        ok(`rgb(${r}, ${g}, ${b})`)
      }
      image.onerror = () => ok('')
      image.src = versionLegere(oeuvre.image)
    })
    couleurs.set(oeuvre.id, couleur)
  }
  return couleur
}
