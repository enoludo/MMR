import type { SalleConfig } from './salles/types'
import { salleProvisoire, salleProvisoireBleue } from './salles/provisoire/config'
import { reglagesTransition } from './entree'

/**
 * Ce qu'affiche la salle (maquette Figma, écrans 445:275, 447:602, 448:911) :
 * le premier écran (info), ou l'un des deux popups qu'on ouvre depuis lui.
 */
export type Onglet = 'info' | 'maladie' | 'manifeste'

/** Contenu du popup Maladie. */
export interface TexteMaladie {
  titre: string
  paragraphes: string[]
  /** Chiffres clés (« Personnes concernées », « Gène en cause »…) */
  chiffres?: { libelle: string; valeur: string }[]
  /** Lien du bouton « En savoir plus » (bouton masqué sans lien) */
  lien?: string
}

/**
 * Une œuvre de la collection : une carte de la spirale d'accueil, et une salle 3D.
 * Ajouter une œuvre = ajouter une entrée ici (et son image dans public/assets/images).
 */
export interface Oeuvre {
  id: string
  titre: string
  /** Maladie traitée (lien Maladie du premier écran) */
  maladie: string
  /** Image de la carte, dans la spirale */
  image: string
  /**
   * Capture de la vue d'entrée de la salle (outils/capture.ts), sans extension : la profondeur
   * (-profondeur.png) et les réglages (.json) donnent la parallaxe de la transition depuis la spirale
   */
  vueEntree?: string
  mecene?: { nom: string; lien?: string }
  /** Partenaire : logo sous « Avec le soutien de » (à défaut, le nom du mécène) */
  partenaire?: { nom: string; logo?: string }
  maladieTexte: TexteMaladie
  /** Paragraphes du manifeste ; un retour à la ligne (\n) dans un paragraphe est conservé */
  manifeste: string[]
  /** Salle 3D où l'œuvre est exposée */
  salle: SalleConfig
  /** Point de vue de la caméra pour chaque onglet : id d'une étape de la salle, ou null = tour libre */
  vues: Record<Onglet, string | null>
}

const A_VENIR = ['Texte à venir.']
const maladieAVenir = (titre: string): TexteMaladie => ({ titre, paragraphes: A_VENIR })

/** Pour les tests, toutes les œuvres sont exposées dans la salle provisoire. */
const VUES_PROVISOIRES: Oeuvre['vues'] = { info: null, maladie: 'main', manifeste: 'visage' }

export const oeuvres: Oeuvre[] = [
  {
    id: 'le-seuil-des-proportions',
    titre: 'Le seuil des proportions',
    maladie: 'Acromégalie',
    // Capture de sa salle (vue d'entrée, outils/capture.ts) ; l'ancien visuel : /assets/images/geant-de-marbre.webp
    image: '/assets/captures/le-seuil-des-proportions.webp',
    vueEntree: '/assets/captures/le-seuil-des-proportions',
    mecene: { nom: 'Fondation Delorme-Vasseur' },
    partenaire: { nom: 'Recordati', logo: '/assets/logos/recordati.svg' },
    // Textes et chiffres de la maquette Figma (chiffres et lien à faire valider)
    maladieTexte: {
      titre: 'Acromégalie',
      paragraphes: [
        "L'acromégalie est une maladie hormonale rare due à une production excessive et prolongée d'hormone de croissance (GH) par l'hypophyse, le plus souvent causée par une petite tumeur bénigne (adénome hypophysaire).",
      ],
      chiffres: [
        { libelle: 'Personnes concernées', valeur: '1/2 000 000' },
        { libelle: 'Gène en cause', valeur: 'ACVR1' },
      ],
      lien: 'https://www.orpha.net/fr/disease/detail/963',
    },
    manifeste: [
      "La monumentalité place le visiteur face à un corps devenu impossible à ignorer. Au sein de cette silhouette, les mains, les pieds et la mâchoire dépassent progressivement leur juste mesure. Ces disproportions localisées traduisent la manière dont l'acromégalie transforme lentement le corps, sans le faire grandir en hauteur.",
      "Ici, le corps ne grandit plus en hauteur, il change d'échelle.\nDans l'acromégalie, l'excès d'hormone de croissance transforme lentement les contours, les mains, les pieds, les traits du visage s'élargissent au fil des années. L'œuvre révèle cette métamorphose progressive, longtemps discrète, jusqu'au moment où la mesure du corps devient impossible à ignorer.",
    ],
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'la-maladie-de-huntington',
    titre: 'La maladie de Huntington',
    maladie: 'Maladie de Huntington',
    // Capture de sa salle (vue d'entrée, outils/capture.ts) ; l'ancien visuel : /assets/images/la-maladie-de-huntington.webp
    image: '/assets/captures/la-maladie-de-huntington.webp',
    vueEntree: '/assets/captures/la-maladie-de-huntington',
    maladieTexte: maladieAVenir('Maladie de Huntington'),
    manifeste: A_VENIR,
    salle: salleProvisoireBleue, // ambiance bleutée, comme sa vignette
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'l-entre-deux',
    titre: "L'entre-deux",
    maladie: '',
    image: '/assets/images/l-entre-deux.webp',
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'l-erosion-silencieuse',
    titre: "L'érosion silencieuse",
    maladie: '',
    image: '/assets/images/boucles-sans-titre.webp',
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'le-filtre-imparfait',
    titre: 'Le filtre imparfait',
    maladie: '',
    image: '/assets/images/le-filtre-imparfait.webp',
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'souffle-d-eclats',
    titre: "Souffle d'éclats",
    maladie: '',
    image: '/assets/images/souffle-declats.webp',
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
]

export const lienOeuvre = (o: Oeuvre) => `/oeuvre/${o.id}`

/**
 * Cartes de la spirale d'accueil (format attendu par src/accueil/gallery).
 * Même ordre que l'ancien cards.json de la galerie, pour garder la même composition.
 */
export const cartesSpirale = [...oeuvres.slice(1), oeuvres[0]].map((o) => ({
  id: o.id,
  image: o.image,
  title: o.titre,
  cta: 'Découvrir',
  link: lienOeuvre(o),
  /** Une capture de salle est montrée agrandie (×2 par défaut) dans sa carte (effet de masque des transitions) */
  zoom: o.vueEntree ? reglagesTransition(o.salle).zoomCarte : 1,
}))
