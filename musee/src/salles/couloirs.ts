import type { SalleConfig } from './types'
import { salleProvisoire } from './provisoire/config'

/**
 * Réglages communs à tous les couloirs entre deux salles (07/11, demande de Ludovic) : un couloir doit être
 * le même vu de ses deux salles (sinon sa relève à l'arrivée se voit), et tous se ressemblent. Une « salle »
 * de réglages seulement : dossier « Couloir · couloirs entre salles » de la touche M, valeurs sous la clé
 * `couloirs` de reglages.json (enregistrées avec celles de la salle où l'on est, ui/CopieReglages.tsx).
 * Fentes d'origine : 6 de 1 m, une tous les 2 m ; le reste repris du couloir du Seuil (06/11).
 * Les impasses gardent les réglages de leur salle.
 */
export const couloirsEntreSalles: SalleConfig = { ...salleProvisoire, id: 'couloirs', titre: 'couloirs entre salles' }
