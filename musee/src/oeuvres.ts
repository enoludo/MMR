import type { SalleConfig } from './salles/types'
import { salleProvisoire } from './salles/provisoire/config'
import { salleRotonde } from './salles/rotonde/config'
import { avecPointsDeVue } from './salles/pointsDeVue'
import { avecCouleurs } from './salles/couleurs'
import { reglagesTransition } from './entree'
import { existe, versionLegere, versionne } from './version'

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
  /**
   * Bouton « En savoir plus » : son lien, ou null pour un bouton sans lien (le site est une
   * démo, demande de Ludovic du 03/11) ; pas de bouton si absent
   */
  lien?: string | null
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
  /** Visuel de l'œuvre, sur la carte « Œuvre suivante » des salles (à défaut, l'image de la carte) */
  vignette?: string
  /** Vignette des flèches précédente / suivante tirée de la capture de la vue initiale (<vueEntree>-vignette.webp), si elle existe */
  vignetteVue?: string
  /** Musique de la salle, en boucle (ui/Musique.tsx ; à défaut, celle de la spirale) */
  musique?: string
  /**
   * Capture de la vue d'entrée de la salle (outils/capture.ts), sans extension : la profondeur
   * (-profondeur.png) et les réglages (.json) donnent la parallaxe de la transition depuis la spirale
   */
  vueEntree?: string
  /**
   * Vidéos du survol de la vignette dans la grille : de l'image de la carte à la vue Maladie, et la
   * même à l'envers (`__visite.capturerSurvol(id)` ou bouton de la vue libre, outils/capture.ts ;
   * voir videosSurvol)
   */
  survol?: { aller: string; retour: string }
  /** Photos des cartouches Maladie et Manifeste du premier écran (à défaut, l'image de la carte) */
  cartouches?: Partial<Record<'maladie' | 'manifeste', string>>
  mecene?: { nom: string; lien?: string }
  /**
   * Partenaire : logo sous « Avec le soutien de » (à défaut, le nom du mécène) ; `largeur` : celle du
   * logo sur ordinateur (px, sa largeur dans la maquette ; 162 par défaut, Recordati), réduite d'autant
   * sur mobile
   */
  partenaire?: { nom: string; logo?: string; largeur?: number }
  maladieTexte: TexteMaladie
  /** Titre du manifeste, sous « Manifeste » dans sa cartouche */
  manifesteTitre?: string
  /** Paragraphes du manifeste ; un retour à la ligne (\n) dans un paragraphe est conservé */
  manifeste: string[]
  /** Salle 3D où l'œuvre est exposée */
  salle: SalleConfig
  /** Point de vue de la caméra pour chaque onglet : id d'une étape de la salle, ou null = tour libre */
  vues: Record<Onglet, string | null>
}

const A_VENIR = ['Texte à venir.']

/** Vidéos du survol de la vignette (outils/capture.ts, capturerSurvol) */
const videosSurvol = (id: string): Oeuvre['survol'] => ({
  aller: versionne(`/assets/captures/${id}-survol.mp4`),
  retour: versionne(`/assets/captures/${id}-survol-retour.mp4`),
})
const maladieAVenir = (titre: string): TexteMaladie => ({ titre, paragraphes: A_VENIR })

/**
 * Photos des cartouches : les points de vue des popups Maladie et Manifeste, photographiés
 * dans la salle (`__visite.capturerCartouches(id)`, outils/capture.ts)
 */
const capturesCartouches = (id: string): Oeuvre['cartouches'] => ({
  maladie: versionne(`/assets/captures/${id}-maladie.webp`),
  manifeste: versionne(`/assets/captures/${id}-manifeste.webp`),
})

/** Pour les tests, toutes les œuvres sont exposées dans la salle provisoire. */
const VUES_PROVISOIRES: Oeuvre['vues'] = { info: null, maladie: 'main', manifeste: 'visage' }

export const oeuvres: Oeuvre[] = [
  {
    id: 'le-seuil-des-proportions',
    titre: 'Le seuil des proportions',
    maladie: 'Acromégalie',
    // Capture de sa salle (vue d'entrée, outils/capture.ts) ; l'ancien visuel : /assets/images/geant-de-marbre.webp
    image: versionne('/assets/captures/le-seuil-des-proportions.webp'),
    vignette: versionne('/assets/images/geant-de-marbre.webp'),
    // « Melancholy Dreamscape », ViraMiller (Pixabay, licence Pixabay : sans mention obligatoire)
    musique: versionne('/assets/musiques/le-seuil-des-proportions.m4a'),
    vueEntree: '/assets/captures/le-seuil-des-proportions',
    cartouches: capturesCartouches('le-seuil-des-proportions'),
    survol: videosSurvol('le-seuil-des-proportions'),
    mecene: { nom: 'Fondation Delorme-Vasseur' },
    partenaire: { nom: 'Recordati', logo: versionne('/assets/logos/recordati.svg') },
    // Textes et chiffres de la maquette Figma (chiffres et lien à faire valider)
    maladieTexte: {
      titre: 'Acromégalie',
      paragraphes: [
        "L'acromégalie est une maladie hormonale rare due à une production excessive et prolongée d'hormone de croissance (GH) par l'hypophyse, le plus souvent causée par une petite tumeur bénigne (adénome hypophysaire).",
      ],
      // Maquette 471:511 (« Traitemennt » et « O » corrigés)
      chiffres: [
        { libelle: 'Personnes concernées', valeur: '1/2M' },
        { libelle: 'Gène en cause', valeur: 'ACVR1' },
        { libelle: "Mal diagnostiqué d'abord", valeur: '9/10' },
        { libelle: 'Traitement curatif', valeur: '0' },
      ],
      lien: null, // démo : bouton sans lien (fiche Orphanet de l'acromégalie : …/disease/detail/963)
    },
    manifesteTitre: 'Métamorphose', // maquettes Figma 477:973 et 477:2158
    // Maquette 477:2158 : le second paragraphe seulement, d'un seul tenant
    manifeste: [
      "Ici, le corps ne grandit plus en hauteur, il change d'échelle. Dans l'acromégalie, l'excès d'hormone de croissance transforme lentement les contours, les mains, les pieds, les traits du visage s'élargissent au fil des années. L'œuvre révèle cette métamorphose progressive, longtemps discrète, jusqu'au moment où la mesure du corps devient impossible à ignorer.",
    ],
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'la-maladie-de-huntington', // adresse et noms des fichiers gardés (captures, musique, vidéos)
    titre: 'La Chorée de Huntington', // titre reçu par Ludovic le 06/11 (« La maladie de Huntington » avant)
    maladie: 'Maladie de Huntington',
    // Capture de sa salle (vue d'entrée, outils/capture.ts) ; l'ancien visuel : /assets/images/la-maladie-de-huntington.webp
    image: versionne('/assets/captures/la-maladie-de-huntington.webp'),
    vignette: versionne('/assets/images/la-maladie-de-huntington.webp'),
    // « Ambient Atmospheric Cinematic Ethereal Piano », Denis-Pavlov-Music (Pixabay, licence Pixabay : sans mention obligatoire)
    musique: versionne('/assets/musiques/la-maladie-de-huntington.m4a'),
    vueEntree: '/assets/captures/la-maladie-de-huntington',
    cartouches: capturesCartouches('la-maladie-de-huntington'),
    survol: videosSurvol('la-maladie-de-huntington'),
    // Logo de la maquette 538:1536 (06/11), à sa taille de la maquette ; en blanc, comme Recordati (choix
    // de Ludovic, 06/11 ; en couleurs : fondation-groupama.svg)
    partenaire: { nom: 'Fondation Groupama', logo: versionne('/assets/logos/fondation-groupama-blanc.svg'), largeur: 152 },
    // Proposé par Claude le 03/11, accepté par Ludovic avec un bouton sans lien (le site est une démo) ;
    // prévalence et « 0 » traitement curatif à faire vérifier
    maladieTexte: {
      titre: 'Huntington', // sous « La maladie » ; « Maladie de Huntington » passait sur deux lignes
      paragraphes: [
        'La maladie de Huntington est une maladie neurologique héréditaire rare qui détruit peu à peu certains neurones du cerveau : mouvements involontaires, troubles cognitifs et psychiatriques apparaissent souvent entre 30 et 50 ans.',
      ],
      chiffres: [
        { libelle: 'Personnes concernées', valeur: '1/10 000' },
        { libelle: 'Gène en cause', valeur: 'HTT' },
        { libelle: 'Risque de transmission', valeur: '1/2' },
        { libelle: 'Traitement curatif', valeur: '0' },
      ],
      lien: null, // démo : bouton sans lien
    },
    // Manifeste reçu par Ludovic le 06/11 ; titre en un mot proposé par Claude, comme « Métamorphose »
    manifesteTitre: 'Fragmentation',
    manifeste: [
      'Notre œuvre, « La Chorée de Huntington », représente la dégradation progressive des fonctions cognitives et motrices, tout en mettant en avant l’individualité et l’humanité de chaque patient à travers une sculpture complète en mouvement.',
    ],
    // Rotonde (31/10, essais) ; pour revenir à la salle carrée bleutée : salleProvisoireBleue (provisoire/config.ts)
    salle: salleRotonde,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'l-entre-deux',
    titre: "L'entre-deux",
    maladie: '',
    image: versionne('/assets/images/l-entre-deux.webp'),
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'l-erosion-silencieuse',
    titre: "L'érosion silencieuse",
    maladie: '',
    image: versionne('/assets/images/boucles-sans-titre.webp'),
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'le-filtre-imparfait',
    titre: 'Le filtre imparfait',
    maladie: '',
    image: versionne('/assets/images/le-filtre-imparfait.webp'),
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
  {
    id: 'souffle-d-eclats',
    titre: "Souffle d'éclats",
    maladie: '',
    image: versionne('/assets/images/souffle-declats.webp'),
    maladieTexte: maladieAVenir('À venir'),
    manifeste: A_VENIR,
    salle: salleProvisoire,
    vues: VUES_PROVISOIRES,
  },
]

// Points de vue réglés en vue libre (touche V, salles/pointsDeVue.ts) : ils remplacent ceux des configs
for (const o of oeuvres) o.salle = avecPointsDeVue(o.salle, o.vues)
// Couleurs réglées à la touche M et enregistrées (src/salles/reglages.json) ; propres à chaque salle
for (const o of oeuvres) o.salle = avecCouleurs(o.salle)

// Flèches précédente / suivante : la vue initiale de la salle quand elle a été capturée (outils/capture.ts)
for (const o of oeuvres) {
  const v = o.vueEntree && `${o.vueEntree}-vignette.webp`
  if (v && existe(v)) o.vignetteVue = versionne(v)
}

export const lienOeuvre = (o: Oeuvre) => `/oeuvre/${o.id}`

/**
 * Salles ouvertes à la visite (demande de Ludovic, 02/11). Les autres œuvres restent dans la
 * collection (spirale, grille, flèches des salles), avec leurs boutons d'accès désactivés ; leur
 * adresse ramène à l'accueil (main.tsx, PageOeuvre).
 */
const SALLES_OUVERTES = new Set(['le-seuil-des-proportions', 'la-maladie-de-huntington'])
export const salleOuverte = (id: string) => SALLES_OUVERTES.has(id)

/**
 * Musique de la spirale et des salles qui n'ont pas la leur : « Ambient Abstract (Extended) »,
 * Siarhei_Korbut (Pixabay, licence Pixabay : sans mention obligatoire)
 */
export const musiqueSpirale = versionne('/assets/musiques/spirale.m4a')

/**
 * Cartes de la spirale d'accueil (format attendu par src/accueil/gallery), dans l'ordre des
 * œuvres : « Le seuil des proportions », « La maladie de Huntington », puis les autres (demande
 * de Ludovic du 04/11 ; c'est aussi l'ordre des cases de la grille et des flèches des salles).
 */
export const cartesSpirale = oeuvres.map((o) => ({
  id: o.id,
  // Carte de 960 × 540 px : la version légère de la capture suffit (décodage trois fois plus court)
  image: versionLegere(o.image),
  /** Image de la transition (ui/ToileTransition) */
  imageTransition: o.image,
  title: o.titre,
  /** Vue Grille : étiquettes sous la vignette (mécène ou partenaire en rouge, maladie) */
  etiquettes: [
    ...(o.partenaire ? [{ texte: o.partenaire.nom, mecene: true }] : []),
    ...(o.maladie ? [{ texte: o.maladie }] : []),
  ],
  cta: 'Découvrir',
  link: lienOeuvre(o),
  /** Salle ouverte à la visite : sinon « Découvrir » et le clic dans la grille sont désactivés */
  ouverte: salleOuverte(o.id),
  /** Vue Grille : vidéo au survol de la vignette */
  survol: o.survol,
  /** Une capture de salle est montrée agrandie (×2 par défaut) dans sa carte (effet de masque des transitions) */
  zoom: o.vueEntree ? reglagesTransition(o.salle).zoomCarte : 1,
}))
