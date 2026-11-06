import { useEffect, useRef, useState } from 'react'
import { charge, coutEchantillons, coutEstime, departMachine, machine } from '../performances'
import { arbitrages, couperArbitrages, resolutionMin } from '../resolution'
import { NIVEAU_MAX, RENONCEMENTS } from '../renoncements'

/**
 * Arbitrages de la résolution (06/11, demande de Ludovic : comprendre pourquoi l'image devient
 * pixelisée), en bas à gauche avec le panneau de réglages (touche M) : résultat du test de la
 * machine, résolution conseillée et son coût estimé, plancher, état de chaque canvas, journal des
 * décisions avec leur raison, et l'interrupteur marche / arrêt des arbitrages (resolution.ts).
 */
const f2 = (x: number) => x.toFixed(2).replace('.', ',')

export function Arbitrages() {
  const [actifs, setActifs] = useState(arbitrages.actifs)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ecrire = () => {
      const el = ref.current
      if (!el) return
      const lignes: string[] = []
      if (machine.facteur === null) lignes.push('Test de la machine : pas encore fait')
      else {
        const f = machine.facteur
        lignes.push(
          `Test au chargement : ${machine.mesure?.toFixed(3).replace('.', ',')} ms (M1 de référence : 0,12) → carte ${f >= 1 ? `${f2(f)} fois plus lente` : `${f2(1 / f)} fois plus rapide`} que le M1`,
        )
      }
      if (machine.carte) lignes.push(`Carte graphique : ${machine.carte}`)
      lignes.push(`Échantillons ×${charge.echantillons} : coût par pixel ×${f2(coutEchantillons())}`)
      const d = departMachine()
      const ips = (r: number, e: number) => Math.round(1000 / coutEstime(r, e))
      const max = Math.min(window.devicePixelRatio || 1, 2)
      lignes.push(
        `Estimation Huntington, pire point de vue, résolution ${f2(max)} : ${ips(max, charge.echantillons)} images/s en ×${charge.echantillons}, ${ips(max, 2)} en ×2, ${ips(max, 1)} en ×1`,
      )
      lignes.push(`Départ conseillé : ${d.niveau ? `sans ${RENONCEMENTS.slice(0, d.niveau).join(', ')}` : 'tout'}, résolution ${f2(d.ratio)}`)
      lignes.push(`Résolution minimale : ${f2(resolutionMin())} (touche M « Rendu »)`)
      lignes.push(`Écran : ${window.innerWidth} × ${window.innerHeight}, résolution pleine ${f2(max)}`)
      lignes.push('Règles : sous 30 images/s, une marche de plus ; tout renoncé et sous 24, résolution plus basse ; 2 s à 45 ou plus, on reprend')
      for (const [nom, e] of Object.entries(arbitrages.etat)) {
        lignes.push(
          `${nom === 'salle' ? 'Salle' : 'Spirale'} : résolution ${f2(e.ratio)}` +
            (e.ips !== null ? ` · ${Math.round(e.ips)} images/s` : '') +
            (e.niveau !== null ? ` · ${e.niveau ? `sans ${RENONCEMENTS.slice(0, e.niveau).join(', ')} (${e.niveau}/${NIVEAU_MAX})` : 'tout est là'}` : '') +
            (e.essais ? ` · ${e.essais} reprise(s) ratée(s) sur 3` : ''),
        )
      }
      const journal = arbitrages.journal.slice(0, 10).map((j) => `${j.heure} ${j.quoi === '—' ? '' : `[${j.quoi}] `}${j.texte}`)
      el.textContent = [...lignes, '', 'Décisions (la plus récente en haut) :', ...(journal.length ? journal : ['aucune'])].join('\n')
    }
    ecrire()
    const id = window.setInterval(ecrire, 500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="arbitrages">
      <button
        type="button"
        className="arbitrages__interrupteur"
        data-actif={actifs}
        onClick={() => {
          couperArbitrages(actifs)
          setActifs(!actifs)
        }}
      >
        Arbitrages : {actifs ? 'marche' : 'arrêt (tout, pleine résolution)'}
      </button>
      <div ref={ref} className="arbitrages__texte" />
    </div>
  )
}
