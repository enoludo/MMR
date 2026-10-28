import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { XIcon } from '@phosphor-icons/react'
import { IconeMenu, IconeSon, IconeSonCoupe } from './icones'
import { store, useEtat } from '../store'
import { sortir } from '../transition'

/**
 * Header commun à toutes les pages (maquette Figma, header 365:1320) :
 * logo à gauche, un élément centré propre à la page, son et menu à droite.
 * Le conteneur laisse passer les événements pointeur (scroll de la spirale,
 * regard dans la salle) : seuls ses boutons les captent.
 */
export function EnTete({ centre }: { centre?: ReactNode }) {
  const muet = useEtat((e) => e.muet)
  const menu = useEtat((e) => e.menu)
  // Depuis une salle, le retour à la collection passe par la transition vers la spirale
  const versCollection = (e: MouseEvent) => {
    store.set({ menu: false })
    if (sortir()) e.preventDefault()
  }

  return (
    <>
      <header className="entete">
        <Link to="/" className="entete__logo" aria-label="Musée des Maladies Rares, retour à la collection" onClick={versCollection}>
          <img src="/assets/logo-mmr.png" alt="Musée des Maladies Rares" />
        </Link>

        {centre && <div className="entete__centre">{centre}</div>}

        <div className="entete__actions">
          <button
            type="button"
            className="bouton-rond bouton-rond--discret"
            aria-pressed={muet}
            aria-label={muet ? 'Réactiver le son' : 'Couper le son'}
            onClick={() => store.set({ muet: !muet })}
          >
            {muet ? <IconeSonCoupe /> : <IconeSon />}
          </button>
          <button
            type="button"
            className="bouton-rond"
            aria-expanded={menu}
            aria-controls="menu-principal"
            aria-label={menu ? 'Fermer le menu' : 'Menu'}
            onClick={() => store.set({ menu: !menu })}
          >
            {menu ? <XIcon size={16} /> : <IconeMenu />}
          </button>
        </div>
      </header>

      <nav id="menu-principal" className={`menu ${menu ? 'menu--ouvert' : ''}`} aria-hidden={!menu}>
        <Link to="/" onClick={versCollection}>La collection</Link>
        <Link to="/a-propos" onClick={() => store.set({ menu: false })}>À propos</Link>
      </nav>
    </>
  )
}
