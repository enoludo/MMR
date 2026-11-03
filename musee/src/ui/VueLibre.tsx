import { Fragment, useRef, useState } from 'react'
import type { Oeuvre } from '../oeuvres'
import type { Vec3 } from '../salles/types'
import {
  appliquerPointDeVue,
  flouDeLaVue,
  pointsDeVue,
  vueEnCours,
  type NomPointDeVue,
  type PointDeVue,
  type ReglageFlou,
} from '../salles/pointsDeVue'
import { store, useEtat } from '../store'
import { volLibre } from '../scene/VolLibre'
import { reglagesNavigation } from '../scene/Navigation'
import { reglagesTransition } from '../entree'

/**
 * Panneau de la vue libre (touche V, développement seulement, voir scene/VolLibre.tsx) : on se place,
 * puis on enregistre la vue comme position initiale, vue Maladie ou vue Manifeste de la salle
 * (salles/points-de-vue.json, appliqués aussitôt à la visite). Les captures partent de ces vues.
 * Chaque vue a aussi sa profondeur de champ (case « flou » et ses réglages, scene/Effets.tsx).
 */
const NOMS: { nom: NomPointDeVue; libelle: string }[] = [
  { nom: 'initiale', libelle: 'Position initiale' },
  { nom: 'maladie', libelle: 'Vue Maladie' },
  { nom: 'manifeste', libelle: 'Vue Manifeste' },
]

/** Réglages de la profondeur de champ d'une vue (voir salles/pointsDeVue.ts) */
const CURSEURS_FLOU: { cle: 'flou' | 'nettete' | 'miseAuPoint'; libelle: string; min: number; max: number; pas: number }[] = [
  { cle: 'flou', libelle: 'flou maximal', min: 0, max: 8, pas: 0.1 },
  { cle: 'nettete', libelle: 'zone nette (m)', min: 0.2, max: 20, pas: 0.1 },
  { cle: 'miseAuPoint', libelle: 'mise au point (m, 0 = point regardé)', min: 0, max: 30, pas: 0.1 },
]

/** Point regardé : sur la ligne du regard, là où elle passe au plus près de l'axe de l'œuvre */
function cibleDuRegard(position: Vec3, direction: Vec3, centre: [number, number]): Vec3 {
  const [px, py, pz] = position
  const [dx, dy, dz] = direction
  const h = dx * dx + dz * dz
  let t = h > 1e-6 ? ((centre[0] - px) * dx + (centre[1] - pz) * dz) / h : 5
  if (t < 1) t = 5
  return [px + dx * t, py + dy * t, pz + dz * t]
}

/** La vue telle que la visite la montrera (la position initiale reste tournée vers l'axe de l'œuvre) */
function vueDansLaVisite(oeuvre: Oeuvre, nom: NomPointDeVue): PointDeVue | null {
  const c = oeuvre.salle
  if (nom === 'initiale') {
    const p = c.parcours
    const g = reglagesNavigation(c)
    const y = p.hauteurLointain ?? p.hauteurYeux
    const r = g.rayonLointain
    const regard = p.regardInitial ?? g.regardBas + (g.regardHaut - g.regardBas) * reglagesTransition(c).regard
    return {
      position: [p.centre[0] + r * Math.sin(p.angleDepart), y, p.centre[1] + r * Math.cos(p.angleDepart)],
      cible: [p.centre[0], regard, p.centre[1]],
    }
  }
  const e = c.etapes.find((x) => x.id === oeuvre.vues[nom])
  return e ? { position: e.position, cible: e.cible } : null
}

export function VueLibre({ oeuvre }: { oeuvre: Oeuvre }) {
  const libre = useEtat((e) => e.libre)
  const enCours = useEtat((e) => e.captures)
  useEtat((e) => e) // la vitesse s'affiche à jour
  const [message, setMessage] = useState('')
  const [popup, setPopup] = useState(volLibre.popup)
  const [, redessiner] = useState(0)
  const enregistrement = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  if (!libre && !enCours) return null
  const config = oeuvre.salle
  const enregistres = pointsDeVue[config.id] ?? {}

  async function enregistrer(nom: NomPointDeVue) {
    const { position, direction } = volLibre.vue()
    const point = { position, cible: cibleDuRegard(position, direction, config.parcours.centre) }
    const r = await fetch('/__points-de-vue', { method: 'POST', body: JSON.stringify({ salle: config.id, nom, point }) })
    if (!r.ok) return setMessage(`Échec : ${await r.text()}`)
    pointsDeVue[config.id] = { ...pointsDeVue[config.id], [nom]: point }
    appliquerPointDeVue(config, nom, point, oeuvre.vues)
    if (nom === 'initiale') reglagesNavigation(config).rayonLointain = config.parcours.rayonLointain
    setMessage(`${NOMS.find((n) => n.nom === nom)!.libelle} enregistrée.`)
    // La vignette des flèches montre la vue principale : refaite avec elle (œuvres qui ont leurs captures)
    if (nom === 'initiale' && oeuvre.vueEntree) {
      await enCapture('Position initiale enregistrée ; vignette des flèches en cours…', 'Position initiale enregistrée, vignette des flèches refaite.', async (visite) => {
        await visite.capturerVignette(oeuvre.id)
      })
    }
  }

  /**
   * Captures de l'œuvre (outils/capture.ts) depuis ses points de vue : image de la transition depuis
   * la spirale (vue d'entrée), vignette des flèches (vue initiale) et photos des cartouches (vues
   * Maladie et Manifeste).
   */
  const capturer = () =>
    enCapture(
      'Captures en cours… (une dizaine de secondes, ne touchez à rien)',
      'Captures faites. Les encarts et la vignette sont à jour ; l\'image de la transition depuis la spirale le sera au rechargement.',
      async (visite) => {
        await visite.capturer(oeuvre.id)
        await visite.capturerCartouches(oeuvre.id)
      },
    )

  /** Vidéo du survol de la vignette dans la grille (de la carte à la vue Maladie, outils/capture.ts) */
  const capturerSurvol = () =>
    enCapture(
      'Vidéo en cours… (une demi-minute, ne touchez à rien)',
      'Vidéo faite. Elle passera au survol de la vignette dans la grille, au rechargement.',
      async (visite) => {
        await visite.capturerSurvol(oeuvre.id)
      },
    )

  /**
   * Les captures demandent un canvas en 16:9 et la visite sur son anneau : la scène passe le temps
   * des captures à 1280 × 720 (2560 × 1440 sur un écran Retina, comme le mode d'emploi de
   * capture.ts), puis reprend sa taille. Les images refaites s'affichent tout de suite.
   */
  async function enCapture(
    pendant: string,
    fini: string,
    action: (visite: Record<string, (nom: string) => Promise<unknown>>) => Promise<void>,
  ) {
    const visite = (window as unknown as { __visite?: Record<string, (nom: string) => Promise<unknown>> }).__visite
    const scene = document.querySelector<HTMLElement>('.scene')
    if (!visite || !scene) return
    setMessage(pendant)
    store.set({ libre: false, captures: true })
    document.documentElement.classList.remove('vue-libre')
    scene.style.cssText = 'right:auto;bottom:auto;width:1280px;height:720px'
    try {
      const canvas = scene.querySelector('canvas')!
      for (let i = 0; i < 120 && Math.abs(canvas.width / canvas.height - 16 / 9) > 0.01; i++) {
        await new Promise(requestAnimationFrame)
      }
      // Sur l'anneau (la vue d'entrée de la capture ne s'applique que là), une fois arrivé
      const etat = (window as unknown as { __visite: { etat: { mode: string } } }).__visite.etat
      if (etat.mode !== 'cercle') (visite.retour as unknown as () => void)()
      for (let i = 0; i < 300 && etat.mode !== 'cercle'; i++) await new Promise(requestAnimationFrame)
      await new Promise((ok) => setTimeout(ok, 800))
      await action(visite)
      // Les encarts du premier écran montrent tout de suite les nouvelles photos (même adresse, sinon
      // le navigateur garde les anciennes) ; l'image de la transition, chargée à part, au rechargement
      const t = Date.now()
      const neuve = (adresse: string) => `${adresse.split(/[?&]t=/)[0]}${adresse.includes('?') ? '&' : '?'}t=${t}`
      if (oeuvre.vueEntree) oeuvre.vignetteVue = neuve(`${oeuvre.vueEntree}-vignette.webp`)
      const c = oeuvre.cartouches
      if (c) oeuvre.cartouches = { maladie: c.maladie && neuve(c.maladie), manifeste: c.manifeste && neuve(c.manifeste) }
      document.querySelectorAll<HTMLImageElement>(`img[src*="/assets/captures/${oeuvre.id}-"]`).forEach((img) => {
        img.src = neuve(img.getAttribute('src') ?? '')
      })
      setMessage(fini)
    } catch (e) {
      setMessage(`Échec des captures : ${e instanceof Error ? e.message : e}`)
    } finally {
      scene.style.cssText = ''
      store.set({ libre: true, captures: false })
      document.documentElement.classList.add('vue-libre')
    }
  }

  function revoir(nom: NomPointDeVue) {
    const v = vueDansLaVisite(oeuvre, nom)
    if (v) volLibre.aller(v.position, v.cible)
    vueEnCours.nom = nom // profondeur de champ de cette vue (voir Effets.tsx)
  }

  /**
   * Profondeur de champ à cette vue (scene/Effets.tsx) : appliquée tout de suite (on la voit en
   * déplaçant les curseurs), enregistrée avec les points de vue un instant après le dernier changement
   */
  function changerFlou(nom: NomPointDeVue, changement: Partial<ReglageFlou>) {
    const reglage = { ...flouDeLaVue(config, nom), ...changement }
    pointsDeVue[config.id] = { ...pointsDeVue[config.id], flou: { ...pointsDeVue[config.id]?.flou, [nom]: reglage } }
    vueEnCours.nom = nom
    redessiner((n) => n + 1)
    clearTimeout(enregistrement.current[nom])
    enregistrement.current[nom] = setTimeout(async () => {
      const r = await fetch('/__points-de-vue', { method: 'POST', body: JSON.stringify({ salle: config.id, nom, flou: reglage }) })
      if (!r.ok) return setMessage(`Échec : ${await r.text()}`)
      setMessage(`${NOMS.find((n) => n.nom === nom)!.libelle} : profondeur de champ enregistrée.`)
    }, 400)
  }

  return (
    <div className="vue-libre">
      <p className="vue-libre__titre">Vue libre · {config.titre}</p>
      <p className="vue-libre__aide">
        Z Q S D ou flèches : se déplacer · E / A : monter, descendre · glisser : regarder · molette : vitesse (
        {volLibre.vitesse.toFixed(1)} m/s) · V : revenir à la visite
      </p>
      {NOMS.map(({ nom, libelle }) => {
        const f = flouDeLaVue(config, nom)
        return (
          <Fragment key={nom}>
            <div className="vue-libre__ligne">
              <span>
                {libelle}
                <small>{enregistres[nom] ? 'réglée' : 'celle de la salle'}</small>
              </span>
              <label className="vue-libre__flou" title="Profondeur de champ (arrière-plan flou) à cette vue">
                <input type="checkbox" checked={f.actif} onChange={(e) => changerFlou(nom, { actif: e.target.checked })} />
                flou
              </label>
              <button type="button" onClick={() => revoir(nom)}>Revoir</button>
              <button type="button" className="vue-libre__principal" onClick={() => enregistrer(nom)}>Enregistrer ici</button>
            </div>
            {f.actif && (
              <div className="vue-libre__reglages">
                {CURSEURS_FLOU.map((c) => (
                  <label key={c.cle}>
                    <span>{c.libelle}</span>
                    <input
                      type="range"
                      min={c.min}
                      max={c.max}
                      step={c.pas}
                      value={f[c.cle]}
                      onChange={(e) => changerFlou(nom, { [c.cle]: Number(e.target.value) })}
                    />
                    <output>{c.cle === 'miseAuPoint' && f.miseAuPoint === 0 ? 'auto' : f[c.cle].toFixed(1)}</output>
                  </label>
                ))}
              </div>
            )}
          </Fragment>
        )
      })}
      <label className="vue-libre__case">
        <input
          type="checkbox"
          checked={popup}
          onChange={(e) => {
            volLibre.popup = e.target.checked
            setPopup(e.target.checked)
          }}
        />
        Cadrer comme avec un popup ouvert (Maladie, Manifeste)
      </label>
      {popup && <div className="vue-libre__popup">place du popup</div>}
      <div className="vue-libre__ligne">
        <span>
          Captures de l'œuvre
          <small>transition depuis la spirale, vignette des flèches, cartouches Maladie et Manifeste</small>
        </span>
        <button type="button" className="vue-libre__principal" onClick={capturer} disabled={enCours}>
          Faire les captures
        </button>
      </div>
      <div className="vue-libre__ligne">
        <span>
          Vidéo du survol
          <small>vignette de la grille : de la carte à la vue Maladie</small>
        </span>
        <button type="button" onClick={capturerSurvol} disabled={enCours}>
          Vidéo du survol
        </button>
      </div>
      <p className="vue-libre__note">
        La position initiale reste tournée vers l'axe de l'œuvre : « Revoir » la montre telle que la visite l'utilisera.
      </p>
      {message && <p className="vue-libre__message">{message}</p>}
    </div>
  )
}
