import type { SalleConfig } from '../types'
import lightmapSalle from './lightmap.json'
import lightmapMobilier from './lightmap-mobilier.json'

/**
 * Salle 1 (provisoire) — en attendant le design définitif.
 * Construite par script dans Blender (voir blender/salle.py) :
 * salle carrée de 30 × 30 m (24 m avant le 28/10), 20 m sous plafond, en calcaire.
 * - un puits de lumière carré (5 m) au-dessus de l'œuvre : le soleil y entre en biais ;
 * - une fente zénithale le long du mur ouest : lumière de ciel rasante ;
 * - l'œuvre monumentale de 10 m (modèle de 8 m agrandi), posée à même le sol (sans socle) ;
 * - deux portes de 4 m de large, jusqu'au plafond, sur deux murs opposés, chacune au bord
 *   droit de son mur (vu de l'intérieur) : l'entrée au sud, la sortie au nord.
 *
 * Repère du site (three.js) : Y vers le haut. Blender (x, y, z) = site (x, z, -y).
 */
export const salleProvisoire: SalleConfig = {
  id: 'provisoire',
  titre: 'Salle 1 — Le géant',
  modele: '/models/salle.glb',
  lightmaps: {
    salle: { image: '/models/salle-lightmap.webp', ...lightmapSalle },
    mobilier: { image: '/models/salle-lightmap-mobilier.webp', ...lightmapMobilier },
  },
  // Couleur de chaque matière = albédo utilisé dans Blender (même rendu des rebonds)
  matieres: {
    Mur: { couleur: '#c4bcb1', lightmap: 'salle' },
    Sol: { couleur: '#a29b95', lightmap: 'salle' },
    Plafond: { couleur: '#bcb6af', lightmap: 'salle' },
    SolCentre: { couleur: '#a29b95', lightmap: 'mobilier' }, // sol autour de l'œuvre, lightmap fine
    Banc: { couleur: '#b3aca2', lightmap: 'mobilier' },
  },

  sculpture: {
    modele: '/models/sculpture.glb',
    position: [0, -0.015, 0], // à même le sol, enfoncée de 1,5 cm (voir ENFONCE dans blender/salle.py)
    rotationY: 0,
    echelle: 1.25, // 8 m → 10 m (ECHELLE_OEUVRE dans blender/salle.py)
  },

  // Portes de 4 × 20 m (PORTE_L, PORTE_H dans blender/salle.py), au bord droit de leur mur
  portes: [
    { id: 'entree', position: [-13, 0, 15], direction: [0, 0, 1], largeur: 4, hauteur: 20 },
    { id: 'sortie', position: [13, 0, -15], direction: [0, 0, -1], largeur: 4, hauteur: 20 },
  ],

  // Parcours : cercle invisible autour de l'œuvre (rayon réglable avec la touche M)
  parcours: {
    centre: [0, 0],
    rayon: 9, // juste derrière les bancs (≈ 7,5–8 m du centre)
    rayonLointain: 13, // vue d'arrivée : toute l'œuvre de 10 m tient à l'écran
    rayonProche: 5.5, // cercle réduit, entre les bancs et l'œuvre
    hauteurYeux: 1.7,
    angleDepart: 0, // face à l'œuvre, côté sud
    regard: { bas: 2.5, haut: 7.1 }, // 2 → 5,7 m pour l'œuvre de 8 m, mis à l'échelle de l'œuvre de 10 m
  },

  // Étapes (textes provisoires)
  etapes: [
    {
      id: 'face',
      libelle: 'Face au géant',
      titre: 'Face au géant',
      texte: [
        "Texte provisoire. À six mètres de l'œuvre, on mesure son échelle : dix mètres de haut, posés à même le sol.",
        'Le regard monte naturellement vers le visage, au-dessus de nous.',
      ],
      position: [1.25, 1.7, 6.25],
      cible: [0.69, 9, -0.75], // le visage
    },
    {
      id: 'visage',
      libelle: 'Le visage',
      titre: 'À hauteur du visage',
      texte: [
        "Texte provisoire. Au pied du géant, le regard monte vers son visage, à neuf mètres du sol.",
      ],
      position: [0.9, 1.7, 5.5], // popup Manifeste : à hauteur d'yeux, en s'approchant
      cible: [0.69, 9, -0.75],
    },
    {
      id: 'main',
      libelle: 'La main',
      titre: 'La grande main',
      texte: [
        'Texte provisoire. Face à la main, démesurée par rapport au reste du corps.',
      ],
      position: [-1.9, 1.7, 6], // popup Maladie : à hauteur d'yeux, de face, en s'approchant
      cible: [-2.75, 3.13, 0.38], // la grande main, côté ouest
    },
  ],

  soleil: {
    // Blender (-0.1572, 0.0983, -0.9827) → site (x, z, -y)
    direction: [-0.1572, -0.9827, -0.0983],
    puits: [0, 20, 0],
    taillePuits: 5,
    force: 6,
    couleur: '#ffdcae',
  },

  ciel: [
    { centre: [0, 25, 0], taille: [5, 5] }, // haut du puits
    { centre: [-14.55, 23, 0], taille: [0.9, 25] }, // haut de la fente
  ],
}
