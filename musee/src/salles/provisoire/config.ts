import type { SalleConfig } from '../types'
import lightmapSalle from './lightmap.json'
import lightmapMobilier from './lightmap-mobilier.json'

/**
 * Salle 1 (provisoire) — en attendant le design définitif.
 * Construite par script dans Blender (voir blender/salle.py) :
 * salle carrée de 40 × 40 m (plan de Ludovic du 29/10 ; 30 m avant), 17,5 m sous plafond, en calcaire.
 * Plan coté : plans/salle-40.html (la salle de 30 m : plans/salle-refonte.html).
 * - quatre colonnes de 4 × 4 m dans les angles, quatre bancs en arc autour de l'œuvre (moulinet) ;
 * - un puits de lumière carré (10 m) au-dessus de l'œuvre, décalé de 2,6 m vers le sud et 2,1 m vers
 *   l'est : le soleil y entre en biais (10° vers le nord, 8° vers l'ouest), découpé en bandes par six lames ;
 *   par la fente zénithale, il effleure le mur ouest (longue lueur, sans atteindre le sol) ;
 * - quatre fentes zénithales de 28 m, une contre chaque mur ;
 * - l'œuvre monumentale de 10 m (modèle de 8 m agrandi), posée à même le sol (sans socle) ;
 * - quatre portes de 4 × 17,5 m, jusqu'au plafond, chacune au bord droit de son mur (vu de
 *   l'intérieur) : l'entrée au sud, la sortie au nord, et deux couloirs en impasse à l'ouest et à l'est.
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
    Mur: { couleur: '#c1bcb4', lightmap: 'salle' },
    Sol: { couleur: '#a09b96', lightmap: 'salle' },
    Plafond: { couleur: '#bab6b1', lightmap: 'salle' },
    SolCentre: { couleur: '#a09b96', lightmap: 'mobilier' }, // sol autour de l'œuvre, lightmap fine
    Banc: { couleur: '#b1aca5', lightmap: 'mobilier' },
  },

  sculpture: {
    modele: '/models/sculpture.glb',
    position: [0, -0.015, 0], // à même le sol, enfoncée de 1,5 cm (voir ENFONCE dans blender/salle.py)
    rotationY: 0,
    echelle: 1.25, // 8 m → 10 m (ECHELLE_OEUVRE dans blender/salle.py)
  },

  // Portes de 4 × 17,5 m (PORTE_L, PORTE_H dans blender/salle.py), au bord droit de leur mur.
  // Couloirs de 14 × 4 m, fentes dans la paroi qui prolonge un mur de la salle. Le couloir de
  // sortie est le couloir d'entrée de la salle suivante : fentes à l'est des deux côtés.
  portes: [
    {
      id: 'entree', position: [-18, 0, 20], direction: [0, 0, 1], largeur: 4, hauteur: 17.5,
      couloir: { fentes: 'gauche' },
    },
    {
      id: 'sortie', position: [18, 0, -20], direction: [0, 0, -1], largeur: 4, hauteur: 17.5,
      couloir: { fentes: 'droite' },
    },
    // Impasses : le soleil du couloir doit passer par leurs fentes (au nord, au sud)
    {
      id: 'impasse-ouest', position: [-20, 0, -18], direction: [-1, 0, 0], largeur: 4, hauteur: 17.5,
      couloir: { fentes: 'droite', ferme: true, azimut: 20 },
    },
    {
      id: 'impasse-est', position: [20, 0, 18], direction: [1, 0, 0], largeur: 4, hauteur: 17.5,
      couloir: { fentes: 'droite', ferme: true, azimut: 160 },
    },
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
    // Blender (-tan 8°, tan 10°, -1) normalisé → site (x, z, -y) : venant du sud et de l'est
    direction: [-0.1371, -0.9755, -0.172],
    // Puits de 10 × 10 m centré en (2,1, 2,6) (PUITS_X, PUITS_Y dans Blender), haut de 5 m : ses parois
    // sud et est masquent une partie du faisceau, qui fait 9,3 × 9,12 m au plafond, centré en (1,749, 2,16)
    puits: [1.749, 17.5, 2.159],
    ouverture: [9.3, 9.12],
    angle: 10,
    // Vides entre les lames (VIDES, LAME_E, LAME_H dans blender/salle.py), d'ouest en est
    lames: {
      vides: [[-2.9, -1.32], [-1.07, -0.22], [0.03, 1.73], [1.98, 2.95], [3.2, 4.66], [4.91, 5.64], [5.89, 7.1]],
      bas: 21,
      haut: 22.5,
      douceur: 2.5, // bandes dans l'air plus nettes que la lumière au sol (soleil de 10°)
    },
    force: 6,
    couleur: '#ffe1b8',
  },

  ciel: [
    { centre: [2.1, 22.5, 2.6], taille: [10, 10] }, // haut du puits
    // haut des fentes zénithales : ouest, est, nord, sud
    { centre: [-19.55, 20.5, 0], taille: [0.9, 28] },
    { centre: [19.55, 20.5, 0], taille: [0.9, 28] },
    { centre: [0, 20.5, -19.55], taille: [28, 0.9] },
    { centre: [0, 20.5, 19.55], taille: [28, 0.9] },
  ],
}

/**
 * La même salle dans une ambiance bleutée, celle de la vignette de « La maladie de Huntington »
 * (gris bleus, lumière blanche froide). Même géométrie et même lumière précalculée : seules les
 * couleurs changent (pierre plus bleue, qui refroidit la lumière chaude du précalcul ; soleil de
 * l'œuvre, faisceau et poussière plus froids ; ambiance de l'œuvre et des couloirs).
 */
export const salleProvisoireBleue: SalleConfig = {
  ...salleProvisoire,
  id: 'provisoire-bleue',
  titre: 'Salle 1 — ambiance bleutée',
  matieres: {
    Mur: { couleur: '#aabccb', lightmap: 'salle' },
    Sol: { couleur: '#8b9baa', lightmap: 'salle' },
    Plafond: { couleur: '#a4b5c4', lightmap: 'salle' },
    SolCentre: { couleur: '#8b9baa', lightmap: 'mobilier' },
    Banc: { couleur: '#9bacba', lightmap: 'mobilier' },
  },
  soleil: { ...salleProvisoire.soleil, couleur: '#eef3ff' },
  ambiance: { ciel: '#9fb6d6', sol: '#555f67', couloir: '#d6e2ee' },
}
