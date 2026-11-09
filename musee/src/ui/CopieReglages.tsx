import { useEffect, useState } from 'react'
import { button, levaStore, useControls } from 'leva'
import { oeuvres } from '../oeuvres'
import { copierReglages, dossierSalle, ecouterMessages, lireReglages, signaler } from '../reglages'
import { store } from '../store'
import { couloirsEntreSalles } from '../salles/couloirs'

/**
 * Dossier « Transmettre », en tête du panneau (touche M) :
 * - « Copier tous les réglages » : toutes les valeurs du panneau, rangées par dossier, pour les
 *   transmettre (chaque dossier a aussi son bouton « copier ce dossier ») ;
 * - « Coller des réglages » : reprend dans le panneau des réglages copiés (par un collègue sur le
 *   labo, par exemple), pour les essayer puis les enregistrer ;
 * - en dev, « Enregistrer les réglages de cette salle » : tous ses dossiers (« … · <salle> »),
 *   écrits dans src/salles/reglages.json (voir src/reglages.ts).
 */
export function CopieReglages() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    let minuterie = 0
    ecouterMessages((m) => {
      setMessage(m)
      clearTimeout(minuterie)
      minuterie = window.setTimeout(() => setMessage(null), 3000)
    })
    return () => ecouterMessages(null)
  }, [])

  // Dans un dossier : seul l'ordre des dossiers se règle, et celui-ci passe en premier
  useControls(
    'Transmettre',
    {
      'Copier tous les réglages': button(() => {
        copierReglages().then(
          () => signaler('Réglages copiés : collez-les dans la conversation'),
          () => signaler('Copie impossible : autorisez le presse-papiers'),
        )
      }),
      'Coller des réglages': button(() => {
        void coller()
      }),
      ...(import.meta.env.DEV ? { 'Enregistrer les réglages de cette salle': button(() => void enregistrer()) } : {}),
    },
    { order: -1 },
  )

  return message ? <div className="copie-reglages">{message}</div> : null
}

/** Reprend des réglages copiés (format de copierReglages) : les dossiers absents du panneau sont signalés */
async function coller() {
  let texte: string | null = null
  try {
    texte = await navigator.clipboard.readText()
  } catch {
    // lecture du presse-papiers refusée : on demande le texte
  }
  if (!texte?.trim().startsWith('{')) texte = window.prompt('Collez ici les réglages copiés')
  if (!texte) return
  let reglages: Record<string, Record<string, unknown>>
  try {
    reglages = JSON.parse(texte).reglages
    if (!reglages || typeof reglages !== 'object') throw new Error()
  } catch {
    return signaler('Ce texte n’est pas une copie de réglages')
  }
  const panneau = levaStore.getData()
  let repris = 0
  const absents = new Set<string>()
  for (const [dossier, valeurs] of Object.entries(reglages)) {
    for (const [cle, valeur] of Object.entries(valeurs)) {
      const chemin = `${dossier}.${cle}`
      if (!(chemin in panneau)) {
        absents.add(dossier)
        continue
      }
      levaStore.setValueAtPath(chemin, valeur, true)
      repris++
    }
  }
  signaler(
    `${repris} réglages repris` +
      (absents.size ? ` ; absents du panneau (ouvrez la salle concernée) : ${[...absents].join(', ')}` : ''),
  )
}

/** Enregistre tous les dossiers de la salle où l'on est (serveur de dev, vite.config.ts) */
async function enregistrer() {
  const visite = store.get().salle
  const salle = visite && oeuvres.find((o) => o.id === visite.oeuvre)?.salle
  if (!salle) return signaler('Ouvrez une salle pour enregistrer ses réglages')
  // Avec ceux des couloirs entre salles (salles/couloirs.ts), réglables depuis toutes les salles
  for (const s of [salle, couloirsEntreSalles]) {
    const suffixe = dossierSalle('', s)
    const parties = Object.fromEntries(
      Object.entries(lireReglages((d) => d.endsWith(suffixe))).map(([dossier, v]) => [dossier.slice(0, -suffixe.length), v]),
    )
    if (s !== salle && !Object.keys(parties).length) continue
    const reponse = await fetch('/__reglages', { method: 'POST', body: JSON.stringify({ salle: s.id, reglages: parties }) })
    if (!reponse.ok) return signaler(`Enregistrement refusé : ${await reponse.text()}`)
  }
  signaler(`Réglages de « ${salle.titre} » enregistrés`)
}
