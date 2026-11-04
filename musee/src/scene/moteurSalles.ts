import * as THREE from 'three'
import { resolutionMax } from '../resolution'

/**
 * Moteur de rendu des salles, créé une fois et gardé d'une salle à l'autre (comme celui de la
 * spirale, rendererPartage dans SpiralGallery.js). Créer un contexte WebGL figeait la page ≈ 0,13 s
 * (jusqu'à 0,24 s avec ses extensions) à chaque entrée dans une salle, en plein rangement de la
 * grille (mesuré sur le site construit le 04/11). Il est créé pendant l'écran d'accueil (main.tsx),
 * où cet arrêt ne se voit pas, ou à défaut à l'entrée dans la première salle.
 *
 * Experience le passe au Canvas de React Three Fiber, qui garde son propre <canvas> (caché) et
 * dessine dans celui de ce moteur, posé juste après. Deux salles montées en même temps (retour
 * vers la spirale, puis clic sur une autre œuvre avant le démontage de la première) : la seconde
 * a son propre moteur, comme avant (`moteurLibre`).
 */
let moteur: THREE.WebGLRenderer | null = null
let utilisateurs = 0

export function moteurSalles() {
  if (!moteur) {
    // Réglages du Canvas de React Three Fiber (Experience) : anticrénelage dans les effets (SMAA)
    moteur = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
    // React Three Fiber coupe le contexte d'un moteur fourni quand la salle est démontée : il doit rester
    moteur.forceContextLoss = () => {}
    moteur.domElement.style.display = 'block'
    // Toutes les extensions activées tout de suite : la première demande de certaines (formats
    // compressés des lightmaps, KTX2Loader) figeait encore la page ≈ 0,08 s à l'entrée dans la salle
    const gl = moteur.getContext()
    gl.getSupportedExtensions()?.forEach((e) => gl.getExtension(e))
    // À la taille que la première salle demandera (la fenêtre, en résolution pleine) : agrandir le
    // canvas à l'entrée (300 × 150 px au départ) figeait la page ≈ 60 ms (mesuré le 04/11)
    moteur.setPixelRatio(resolutionMax())
    moteur.setSize(window.innerWidth, window.innerHeight)
  }
  return moteur
}

/** Le moteur partagé n'est utilisé par aucune salle montée */
export const moteurLibre = () => utilisateurs === 0

/** Une salle montée utilise le moteur partagé ; renvoie de quoi le rendre (à son démontage) */
export function prendreMoteur() {
  utilisateurs++
  return () => {
    utilisateurs--
  }
}
