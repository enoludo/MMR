import { versionne } from '../../version'
import type { SalleConfig } from '../types'
import { salleProvisoire } from '../provisoire/config'
import lightmapPavillon from '../provisoire/pavillon-lightmap.json'
import lightmapMobilierPavillon from '../provisoire/pavillon-lightmap-mobilier.json'
import eclairagePavillon from './eclairage.json'
import lumieresPavillon from './lumieres.json'

/**
 * Le pavillon de « Souffle d'éclats » (plan de Ludovic du 05/11, plans/Fichier 2.svg ; plan coté et
 * aperçu : plans/salle-pavillon.html ; décisions du 05/11 dans JOURNAL.md).
 * Construit et précalculé par blender/pavillon.py, puis `chaine.sh RES pavillon`.
 * - même carré de 40 m, mêmes portes dans les angles et mêmes couloirs que la salle provisoire ;
 * - grande salle à 17,5 m, sans puits ni fentes ; murs de 1,6 m percés de 8 baies de 10 × 14 m
 *   (huisseries en acier noir, sans vitre dans le site) ; soleil bas du sud-est (30°) ;
 * - espace central couvert à 6 m (carré sur la pointe, murs de 2,45 m, deux ouvertures de 5,66 m au
 *   nord-est et au sud-ouest), sans lampe au plafond depuis le 05/11 (demande de Ludovic) : éclairé par ses
 *   ouvertures, quatre projecteurs discrets dans ses angles et la lueur de l'œuvre (comptée dans la lumière
 *   précalculée, bleu et rouge réduits le 05/11) ;
 * - l'œuvre flotte au centre, sans socle (retiré le 05/11) ; plus de bancs (07/11), cartel dans l'axe des ouvertures ;
 * - dehors simple et lumineux (sol clair, ciel), vu par les baies.
 * Lumière précalculée ramenée à l'exposition du site (3,4) : voir ECHELLE dans pavillon.py.
 */
export const sallePavillon: SalleConfig = {
  ...salleProvisoire,
  id: 'pavillon',
  titre: "Salle 3 — Souffle d'éclats, pavillon",
  modele: versionne('/models/pavillon-salle.glb'),
  lightmaps: {
    salle: { image: versionne('/models/pavillon-salle-lightmap.ktx2'), ...lightmapPavillon },
    mobilier: { image: versionne('/models/pavillon-salle-lightmap-mobilier.ktx2'), ...lightmapMobilierPavillon },
  },
  // Mêmes couleurs que les albédos de pavillon.py ; les matières lumineuses reprennent ses émissions
  matieres: {
    Mur: { couleur: '#c1bcb4', lightmap: 'salle' },
    Sol: { couleur: '#a09b96', lightmap: 'salle' },
    Plafond: { couleur: '#bab6b1', lightmap: 'salle' },
    // Dedans de l'espace central : gris froids, sol et plafond sombres, puits clair (06/11, puits de lumière d'après
    // references/souffle ; mêmes couleurs que COULEURS_CENTRE de pavillon.py)
    SolCentre: { couleur: '#4b5059', lightmap: 'mobilier' },
    Banc: { couleur: '#8e959f', lightmap: 'mobilier' },
    MurCentre: { couleur: '#7c8694', lightmap: 'mobilier' },
    PlafondCentre: { couleur: '#3b3f47', lightmap: 'mobilier' },
    Puits: { couleur: '#a3a9b1', lightmap: 'mobilier' },
    Cartel: { couleur: '#d6d2ca', lightmap: 'mobilier' }, // plaque du cartel sur pupitre (07/11)
    // Lentilles des projecteurs de l'anneau suspendu et bandes des bornes (07/11, pavillon.py), sans lightmap
    Lampe: { couleur: '#fff0dc', lumineuse: 1 },
    Borne: { couleur: '#ffd7a3', lumineuse: 1 },
    Acier: { couleur: '#1e1e1e', lumineuse: 1 }, // huisseries des baies, sans lightmap
    Dehors: { couleur: '#d9d2c6', lumineuse: 0.6 }, // sol du dehors, clair (demande de Ludovic)
    Ciel: { couleur: '#c9d6e6', lumineuse: 0.5 },
  },
  // Poumons de verre, flottant (pied à 1,15 m du sol, sans socle depuis le 05/11) ; face avant vers la vue d'arrivée.
  // Depuis le 06/11, modèle du collègue de Ludovic (blender/poumons.py ; avant : blender/souffle.py, souffle.glb)
  sculpture: {
    modele: versionne('/models/poumons.glb'),
    verre: true,
    position: [0, 0.8, 0],
    rotationY: -45,
    // Pas de reflet au sol (essayé le 07/11, retiré à la demande de Ludovic ; OeuvreVerre sait le dessiner)
    reflet: false,
  },
  faisceau: false,
  // Éclairage de l'espace central réglable en direct puis figé (touche M « Éclairage », en dev ; 07/11)
  eclairage: { reglages: eclairagePavillon, lumieres: lumieresPavillon, atlas: 'mobilier' },
  // Joints du sol de l'espace central (repère d'échelle, 07/11) : dalles de 1,2 × 0,6 m alignées sur ses murs (45°)
  // Lueur rouge de l'œuvre sur la salle, qui suit les variations des bronches (07/11) ; centre de l'œuvre
  lueurOeuvre: { position: [0, 2.8, 0], couleur: '#ff2a10', force: 0.15, portee: 3 },
  joints: { matieres: ['SolCentre'], longueur: 1.2, largeur: 0.6, joint: 0.008, force: 0.6, angle: 45 },
  // Halo : la salle est sombre (sans lampes) et l'œuvre peu exposée ; il démarre plus bas pour que les vaisseaux
  // rayonnent, comme sur l'image
  effets: { courbe: 'aces', halo: 0.35, seuilHalo: 0.3 },
  // Flou de la salle autour de l'œuvre, qui reste nette (07/11, essai demandé par Ludovic ; scene/FlouSalle.ts)
  flouSalle: { actif: true, flouPres: 22, pres: 2.5, flouLoin: 4, loin: 9, debut: 2.5, progression: 10, haut: 4.75 },
  dehors: true,
  // Vue d'arrivée dans l'espace central, à 8,5 m, depuis l'ouverture sud-ouest (décision du 05/11). Poumons de
  // 3,4 m de large, de 1,15 à 4,75 m du sol (trachée comprise) : cercle à 5,5 m (dans les bancs), réduit à 3,5 m
  parcours: {
    centre: [0, 0],
    rayon: 5.5,
    rayonLointain: 8.5,
    rayonProche: 3.5,
    hauteurYeux: 1.7,
    angleDepart: -Math.PI / 4, // sud-ouest
    regard: { bas: 1.8, haut: 4 },
  },
  // Points de vue des popups, du côté de la face avant (sud-ouest) : Maladie vers les bronches d'un poumon,
  // Manifeste face aux deux poumons ; à régler en vue libre (touche V)
  etapes: [
    { id: 'face', libelle: "Face à l'œuvre", titre: "Face à l'œuvre", texte: ['Texte provisoire.'], position: [-3.5, 1.7, 3.5], cible: [0, 2.8, 0] },
    { id: 'visage', libelle: 'Les poumons', titre: 'Les poumons', texte: ['Texte provisoire.'], position: [-4.1, 1.7, 2.9], cible: [0, 3, 0] },
    { id: 'main', libelle: 'Les vaisseaux', titre: 'Les vaisseaux', texte: ['Texte provisoire.'], position: [-1.6, 1.7, 2.9], cible: [-0.5, 2.9, 0.4] },
  ],
  soleil: {
    // Blender (-cos 30°/√2, cos 30°/√2, -sin 30°) → site (x, z, -y) ; il n'éclaire pas d'œuvre ici
    direction: [-0.6124, -0.5, -0.6124],
    puits: [0, 17.5, 0],
    ouverture: [1, 1],
    angle: 5,
    force: 1.77,
    couleur: '#fff1dc',
  },
  ciel: [],
  obstacles: [],
  // On entre et on sort par les ouvertures de l'espace central (sud-ouest et nord-est)
  portes: salleProvisoire.portes.map((p) =>
    p.id === 'entree'
      ? { ...p, chemin: [[-9.6, 0, 9.6], [-13.5, 0, 13.5], [-18, 0, 16]] }
      : p.id === 'sortie'
        ? { ...p, chemin: [[9.6, 0, -9.6], [13.5, 0, -13.5], [18, 0, -16]] }
        : p,
  ),
}
