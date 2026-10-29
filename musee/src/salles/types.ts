export type Vec3 = [number, number, number]

/** Étape de la visite : un point de vue particulier, hors du cercle, avec un texte. */
export interface Etape {
  id: string
  /** Libellé court du bouton */
  libelle: string
  /** Titre et paragraphes du popup (provisoires) */
  titre: string
  texte: string[]
  /** Position de l'œil */
  position: Vec3
  /** Point regardé */
  cible: Vec3
  /** Champ de vision (°) propre à l'étape ; sinon celui du réglage « Rendu » */
  focale?: number
}

/** Le parcours principal : un cercle invisible autour de l'œuvre, parcouru en scrollant. */
export interface Parcours {
  /** Centre du cercle (axe de l'œuvre), en [x, z] */
  centre: [number, number]
  /** Le cercle (invisible) de la visite */
  rayon: number
  /** Vue d'arrivée dans la salle : un cercle plus lointain, d'où l'on voit toute l'œuvre */
  rayonLointain: number
  /** Cercle réduit, autour de l'œuvre : on y va (et on en revient) en cliquant sur l'œuvre */
  rayonProche: number
  /** Hauteur de l'œil sur le cercle */
  hauteurYeux: number
  /** Angle de départ (radians) : 0 = côté +Z (sud), où l'on entre */
  angleDepart: number
  /** Hauteur du point regardé sur l'axe : souris en haut → bas, souris en bas → haut (inversé) */
  regard: { bas: number; haut: number }
}

/**
 * Porte d'une salle : une ouverture rectangulaire dans un mur, par où l'on passe d'une
 * salle à l'autre. Derrière, le couloir (scene/Couloir.tsx) est construit en direct ;
 * ce que le précalcul de Blender contient au-delà du plan de la porte est masqué.
 */
export interface Porte {
  /** Entrée (on arrive par elle en venant de l'œuvre précédente) ou sortie (vers l'œuvre suivante) */
  id: 'entree' | 'sortie' | 'impasse-ouest' | 'impasse-est'
  /** Milieu du seuil, au sol, dans le plan du mur */
  position: Vec3
  /** Direction horizontale vers l'extérieur de la salle (vers le couloir) */
  direction: Vec3
  largeur: number
  hauteur: number
  /**
   * Couloir derrière la porte : côté des fentes en partant de la salle (gauche par défaut), et
   * fente zénithale le long de la paroi opposée, entre deux distances au seuil (m).
   */
  couloir?: {
    fentes?: 'gauche' | 'droite'
    fenteZenithale?: [number, number]
    /** Impasse : fermé au bout, sans passage (il enrichit l'environnement : fentes, lumière) */
    ferme?: boolean
    /** Direction du soleil du couloir (°, depuis le nord, 90 = est), si elle diffère du réglage commun */
    azimut?: number
  }
}

/** Description complète d'une salle : ajouter une salle = ajouter un fichier de ce type. */
export interface SalleConfig {
  id: string
  titre: string
  /** Géométrie de la salle (GLB, UV = lightmap) */
  modele: string
  /** Lumières précalculées dans Blender (voir blender/lightmap.py), par atlas */
  lightmaps: Record<string, { image: string; echelle: number; k: number }>
  /** Matières (noms des matériaux Blender) : couleur, et atlas de lightmap utilisé. Le grain est procédural. */
  matieres: Record<string, { couleur: string; lightmap: string }>
  /** `echelle` : agrandissement du modèle (le même que ECHELLE_OEUVRE dans blender/salle.py) */
  /** `reflet` : false pour une œuvre sur socle (pas de reflet au sol) */
  sculpture: {
    modele: string
    position: Vec3
    rotationY: number
    echelle?: number
    reflet?: boolean
    /** Lueur au pied du socle : rayon du pied en retrait (m, voir GORGE_R dans blender/salle.py) et couleur */
    lueur?: { rayon: number; couleur: string }
  }
  /**
   * Portes de la salle : une entrée et une sortie. « Œuvre suivante » part par la sortie et
   * arrive par l'entrée de la salle suivante ; « Œuvre précédente », l'inverse.
   */
  portes: Porte[]
  parcours: Parcours
  /** Les étapes, accessibles par les boutons */
  etapes: Etape[]
  /** Soleil entrant par le puits : mêmes valeurs que dans blender/salle.py */
  soleil: {
    /** Direction de propagation (repère du site) */
    direction: Vec3
    /**
     * Section du faisceau au plafond : son centre et ses côtés [x, z]. Plus étroite que le puits
     * quand le soleil est en biais (la paroi du puits en masque une partie) : voir config.
     */
    puits: Vec3
    ouverture: [number, number]
    /** Taille apparente du soleil (°) : flou des bords de la lumière (SOLEIL_ANGLE dans blender/salle.py) */
    angle: number
    /**
     * Lames en haut du puits, parallèles à z (nord-sud) : intervalles [x0, x1] des vides entre
     * elles (et les parois), et hauteurs du bas et du haut des lames. Elles découpent le faisceau.
     * `douceur` : taille apparente du soleil (°) pour leurs bandes dans l'air, plus petite que
     * `angle` pour qu'elles restent lisibles.
     */
    lames?: { vides: [number, number][]; bas: number; haut: number; douceur?: number }
    /** Éclairement (W/m²) du soleil dans Blender */
    force: number
    couleur: string
  }
  /**
   * Ambiance de couleur, en plus des couleurs des matières et du soleil : lumière d'ambiance de
   * l'œuvre (ciel en haut, rebonds en bas) et lumière diffuse des couloirs. Par défaut : chaude.
   */
  ambiance?: { ciel: string; sol: string; couloir: string }
  /** Ouvertures sur le ciel (vues depuis l'intérieur) : centre et taille [x, z] */
  ciel: { centre: Vec3; taille: [number, number] }[]
}
