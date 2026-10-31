import { versionne } from '../../version'
import type { SalleConfig } from '../types'
import { salleProvisoireBleue } from '../provisoire/config'
import lightmapRotonde from '../provisoire/rotonde-lightmap.json'
import lightmapMobilierRotonde from '../provisoire/rotonde-lightmap-mobilier.json'

/**
 * La rotonde de « La maladie de Huntington » (plan de Ludovic du 30/10, plans/planCercleColonne.svg ;
 * plan coté et aperçu : plans/salle-rotonde.html ; décisions des 30 et 31/10 dans JOURNAL.md).
 * Construite et précalculée par blender/rotonde.py, puis `chaine.sh RES rotonde`.
 * - même carré de 40 m, mêmes portes dans les angles et mêmes couloirs que la salle provisoire ;
 * - rotonde de 40 m tangente aux murs, pans coupés à 45° vers les portes ;
 * - 8 colonnes rondes de 1,5 m sur un cercle de 13 m (pas dans les axes) ;
 * - coupole de 10 m de rayon au-dessus de l'œuvre, jusqu'à 24,5 m, et oculus de 11 m centré, avec ses lames ;
 *   soleil propre à la salle, presque vertical (4° vers le nord, 3° vers l'ouest) ;
 * - au milieu de chaque mur, un pilastre et sa fente en L (de 3 m du sol au plafond, puis 5 m au
 *   plafond), au fond lumineux (matière « Fente ») ;
 * - quatre bancs en arc de 6,5 à 7,2 m du centre, et le socle de Huntington.
 * L'ancienne salle de Huntington reste disponible : salleProvisoireBleue (provisoire/config.ts).
 */
export const salleRotonde: SalleConfig = {
  ...salleProvisoireBleue,
  id: 'rotonde',
  titre: 'Salle 2 — Huntington, rotonde',
  modele: versionne('/models/rotonde-salle.glb'),
  lightmaps: {
    salle: { image: versionne('/models/rotonde-salle-lightmap.ktx2'), ...lightmapRotonde },
    mobilier: { image: versionne('/models/rotonde-salle-lightmap-mobilier.ktx2'), ...lightmapMobilierRotonde },
  },
  // Mêmes couleurs que les albédos de rotonde.py (et la salle bleue de Huntington)
  matieres: {
    ...salleProvisoireBleue.matieres,
    Fente: { couleur: '#eef3ff', lumineuse: 2.5 }, // FENTE_LUEUR dans rotonde.py
  },
  // Vue d'arrivée à 11 m, devant les colonnes (décision du 30/10) : le recul par défaut y tient
  transition: undefined,
  parcours: { ...salleProvisoireBleue.parcours, rayonLointain: 11 },
  soleil: {
    // Blender (-tan 3°, tan 4°, -1) normalisé → site (x, z, -y)
    direction: [-0.0522, -0.9962, -0.0697],
    // Oculus de 11 m, bord à 24,5 m (sous son conduit de 3 m, qui masque un peu le faisceau en biais)
    puits: [-0.08, 24.5, -0.1],
    ouverture: [10.7, 10.7],
    forme: 'rond',
    hautVolume: 23.3, // sous la coupole (23,5 m au droit du bord du volume, à 6,8 m de l'axe)
    angle: 10,
    // Vides entre les lames (VIDES, LAME_E, LAME_H dans rotonde.py), d'ouest en est
    lames: {
      vides: [[-5.5, -3.73], [-3.48, -2.53], [-2.28, -0.38], [-0.13, 0.95], [1.2, 2.83], [3.08, 3.9], [4.15, 5.5]],
      bas: 26,
      haut: 27.5,
      douceur: 2.5,
    },
    force: 5,
    couleur: '#eef3ff',
  },
  ciel: [{ centre: [0, 27.5, 0], taille: [11, 11] }], // haut de l'oculus (les fentes sont fermées)
  // Portes au fond des pans coupés : on y va par l'axe du pan coupé, puis le milieu du carré de l'angle
  // (dans l'axe de la porte, à 6 m, la caméra traversait le pan coupé et voyait au travers du mur)
  portes: salleProvisoireBleue.portes.map((p) =>
    p.id === 'entree' ? { ...p, chemin: [[-13.5, 0, 13.5], [-18, 0, 18]] } : p.id === 'sortie' ? { ...p, chemin: [[13.5, 0, -13.5], [18, 0, -18]] } : p,
  ),
  // Les 8 colonnes (rayon 0,75 m), avec 0,6 m de marge
  obstacles: [
    { centre: [11.26, -6.50], rayon: 1.35 }, { centre: [6.50, -11.26], rayon: 1.35 }, { centre: [-6.50, -11.26], rayon: 1.35 }, { centre: [-11.26, -6.50], rayon: 1.35 }, { centre: [-11.26, 6.50], rayon: 1.35 }, { centre: [-6.50, 11.26], rayon: 1.35 }, { centre: [6.50, 11.26], rayon: 1.35 }, { centre: [11.26, 6.50], rayon: 1.35 },
  ],
}
