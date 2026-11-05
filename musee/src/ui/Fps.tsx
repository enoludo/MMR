import { useEffect, useRef } from 'react'

/**
 * Compteur d'images par seconde (05/11, demande de Ludovic), en bas à gauche, affiché avec le panneau
 * de réglages (touche M). Mis à jour deux fois par seconde : images par seconde et pire image de la
 * période (en millisecondes : un à-coup se voit là, pas dans la moyenne). Écrit hors de React.
 */
export function Fps() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let debut = performance.now()
    let precedente = debut
    let images = 0
    let pire = 0
    let id = 0
    const boucle = (t: number) => {
      images++
      pire = Math.max(pire, t - precedente)
      precedente = t
      if (t - debut >= 500) {
        const ips = Math.round((images * 1000) / (t - debut))
        const el = ref.current
        if (el) {
          el.textContent = `${ips} images/s · pire ${Math.round(pire)} ms`
          el.dataset.niveau = ips >= 50 ? 'bon' : ips >= 30 ? 'moyen' : 'faible'
        }
        debut = t
        images = 0
        pire = 0
      }
      id = requestAnimationFrame(boucle)
    }
    id = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(id)
  }, [])

  return <div ref={ref} className="fps" aria-hidden="true" />
}
