import { Link } from 'react-router-dom'
import { EnTete } from '../ui/EnTete'

/**
 * Exemple de page « classique » : du vrai HTML, lisible par les moteurs de recherche.
 */
export function APropos() {
  return (
    <div className="page-classique">
      <EnTete />
      <article className="page">
        <h1>À propos du musée</h1>
        <p className="page__chapo">
          Texte provisoire. Le Musée des Maladies Rares propose une visite virtuelle
          de salles d'exposition consacrées aux maladies rares.
        </p>
        <p>
          <Link to="/" className="pilule">Voir la collection</Link>
        </p>
      </article>
    </div>
  )
}
