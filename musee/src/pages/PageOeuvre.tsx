import { useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Experience } from '../scene/Experience'
import { InterfaceSalle } from '../ui/InterfaceSalle'
import { lienOeuvre, oeuvres } from '../oeuvres'
import { nouvelleCle, store, useEtat } from '../store'

/**
 * Une œuvre : sa salle 3D et l'interface posée dessus.
 * L'adresse et la salle chargée dans la scène se suivent dans les deux sens :
 * - on arrive par une adresse (lien, retour du navigateur) : la scène charge la salle ;
 * - on arrive par le couloir (œuvre précédente / suivante) : l'adresse suit la scène.
 */
export function PageOeuvre({ id }: { id: string }) {
  const naviguer = useNavigate()
  const oeuvre = oeuvres.find((o) => o.id === id)
  const salle = useEtat((e) => e.salle)
  // Entrée depuis la spirale : la salle se prépare, invisible, pendant le zoom de la carte ;
  // retour vers la spirale : elle reste montée, invisible, le temps de la réduction (main.tsx)
  const enPreparation = useEtat(
    (e) => e.transition?.sens === 'entree' && (e.transition.phase === 'preparation' || e.transition.phase === 'zoom'),
  )
  const quittee = !useLocation().pathname.startsWith('/oeuvre/')
  const cachee = enPreparation || quittee

  useEffect(() => {
    const { salle, passage } = store.get()
    if (oeuvre && salle?.oeuvre !== oeuvre.id && !passage) store.set({ salle: { cle: nouvelleCle(), oeuvre: oeuvre.id } })
  }, [oeuvre])

  useEffect(() => {
    if (salle && salle.oeuvre !== id && !quittee) {
      const o = oeuvres.find((x) => x.id === salle.oeuvre)
      if (o) naviguer(lienOeuvre(o))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salle?.oeuvre])

  // En quittant les salles, on oublie la scène ; la spirale reviendra sur la dernière œuvre visitée
  useEffect(
    () => () => {
      const { salle, derniereOeuvre } = store.get()
      store.set({
        salle: null,
        passage: null,
        salleAffichee: null,
        sallePrete: null,
        derniereOeuvre: salle?.oeuvre ?? derniereOeuvre,
      })
    },
    [],
  )

  if (!oeuvre) return quittee ? null : <Navigate to="/" replace />
  // Pendant l'arrivée par le couloir, l'interface montre déjà l'œuvre de la scène
  const affichee = oeuvres.find((o) => o.id === salle?.oeuvre) ?? oeuvre
  return (
    <div className={cachee ? 'page-oeuvre--cachee' : undefined}>
      <div className="scene">
        <Experience />
      </div>
      <InterfaceSalle oeuvre={affichee} />
    </div>
  )
}
