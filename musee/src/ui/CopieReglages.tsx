import { useState } from 'react'
import { button, levaStore, useControls } from 'leva'

/**
 * Bouton « Copier les réglages » en tête du panneau (touche M) : copie toutes les valeurs du
 * panneau, rangées par dossier, pour que Ludovic les transmette (on les reporte ensuite comme
 * valeurs par défaut dans le code).
 */
export function CopieReglages() {
  const [message, setMessage] = useState<string | null>(null)

  // Dans un dossier : seul l'ordre des dossiers se règle, et celui-ci passe en premier
  useControls(
    'Transmettre',
    {
      'Copier les réglages': button(() => {
        const texte = JSON.stringify({ page: location.pathname, reglages: lireReglages() }, null, 2)
        copier(texte).then(
          () => afficher('Réglages copiés : collez-les dans la conversation'),
          () => afficher('Copie impossible : autorisez le presse-papiers'),
        )
      }),
    },
    { order: -1 },
  )

  function afficher(m: string) {
    setMessage(m)
    setTimeout(() => setMessage(null), 2500)
  }

  return message ? <div className="copie-reglages">{message}</div> : null
}

/** Valeurs du panneau, par dossier : { Couloir: { soleil: 1.2, … }, … } (sans les boutons) */
function lireReglages() {
  const reglages: Record<string, Record<string, unknown>> = {}
  for (const [chemin, entree] of Object.entries(levaStore.getData())) {
    if (!('value' in entree) || entree.type === 'BUTTON') continue
    const i = chemin.lastIndexOf('.')
    const dossier = i < 0 ? '(racine)' : chemin.slice(0, i)
    ;(reglages[dossier] ??= {})[chemin.slice(i + 1)] = entree.value
  }
  return reglages
}

/** Presse-papiers, avec repli pour les pages sans accès direct */
function copier(texte: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texte)
  return new Promise<void>((ok, echec) => {
    const zone = document.createElement('textarea')
    zone.value = texte
    document.body.append(zone)
    zone.select()
    const reussi = document.execCommand('copy')
    zone.remove()
    if (reussi) ok()
    else echec()
  })
}
