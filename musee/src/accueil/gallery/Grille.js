import { CONFIG } from '../config.js';

/**
 * Site React : vue Grille de la page d'accueil (maquette Figma « Grille » 58:207). Les cartes de la
 * spirale quittent leur place et se rangent en grille (SpiralGallery#update) ; ce fichier calcule les
 * cases, en pixels, et place sous chaque vignette son titre et ses étiquettes (HTML).
 *
 * Réglages (touche M, « Grille », Accueil.tsx) : colonnes, écart entre les vignettes (48 px, demande
 * de Ludovic du 01/11), marges ; durée du déroulé et décalage d'une carte à la suivante.
 */
export const reglagesGrille = {
  colonnes: 3,
  ecart: 12,
  /** Marge à gauche et à droite (24 px depuis le 03/11, réglage de Ludovic ; maquette : 72 px en 1680) */
  marge: 24,
  /** Haut de la première rangée (sous le header) et marge sous la dernière */
  haut: 96,
  bas: 120,
  /** Durée du déroulé (s) et décalage entre deux cartes (part de cette durée) */
  duree: 1.6,
  decalage: 0.08,
  /**
   * Clic sur une vignette (demande de Ludovic, 01/11) : le retour d'une salle à l'envers. La grille se
   * range en spirale (durée : `duree`), la vignette cliquée en dernier ; le zoom de sa carte part
   * quand le rangement en est là (0 → 1 : 0,69, comme au retour, où la grille part 0,5 s avant la fin
   * de la réduction).
   */
  departAller: 0.69,
  /**
   * Retour d'une salle en vue Grille : la spirale commence à se ranger en grille quand la photo de la
   * salle en est là de sa réduction dans la carte (0 → 1 ; demande de Ludovic, 01/11 : pas d'arrêt
   * sur la spirale). La photo suit sa carte et s'y fond pendant le déroulé.
   */
  departRetour: 0.75,
};

/** Sous la vignette : 16 px, le titre (24), 16 px, les étiquettes (24) */
const LEGENDE = 80;
const FORMAT = CONFIG.cardHeight / CONFIG.cardWidth;

/** Cases de la grille (pixels, en haut à gauche, sans le défilement) et hauteur de tout le contenu */
export function dispositionGrille(largeur, hauteur, n) {
  const r = reglagesGrille;
  const colonnes = largeur < 640 ? 1 : largeur < 1024 ? Math.min(2, r.colonnes) : r.colonnes;
  const marge = largeur < 640 ? 24 : r.marge;
  const l = (largeur - 2 * marge - (colonnes - 1) * r.ecart) / colonnes;
  const h = l * FORMAT;
  const pas = h + LEGENDE + r.ecart;
  const cases = [];
  for (let i = 0; i < n; i += 1) {
    const c = i % colonnes;
    const rangee = Math.floor(i / colonnes);
    cases.push({ x: marge + c * (l + r.ecart), y: r.haut + rangee * pas, l, h });
  }
  const rangees = Math.ceil(n / colonnes);
  const total = r.haut + rangees * pas - r.ecart + r.bas;
  return { cases, total, defilementMax: Math.max(0, total - hauteur) };
}

/** Avancée de la carte `i` sur `n` (0 → 1) quand le déroulé en est à `progres` : les cartes partent l'une après l'autre */
export function progresCarte(progres, i, n) {
  const d = reglagesGrille.decalage;
  const t = Math.min(1, Math.max(0, progres * (1 + d * (n - 1)) - d * i));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Rang de chaque vignette dans la cascade du déroulé, à partir de la vignette `devant` (0), puis les
 * autres de la plus proche à la plus éloignée dans la grille (allers-retours avec une salle)
 */
export function rangsDepuis(disposition, devant) {
  const c0 = disposition.cases[devant];
  const rangs = [];
  disposition.cases
    .map((c, i) => ({ i, d: Math.hypot(c.x - c0.x, c.y - c0.y) }))
    .sort((a, b) => a.d - b.d)
    .forEach((o, k) => {
      rangs[o.i] = k;
    });
  return rangs;
}

/** Titres et étiquettes sous les vignettes : un bloc par œuvre, déplacé à chaque image */
export class LegendesGrille {
  /** `racine` : l'élément .grille de la page (Accueil.tsx), vide, que cette classe remplit */
  constructor({ racine, cartes, ouvrir }) {
    this.racine = racine;
    this.blocs = cartes.map((carte) => {
      const bloc = document.createElement('a');
      // Salle fermée à la visite (oeuvres.ts) : la légende reste, sans lien
      bloc.className = `grille__legende${carte.ouverte === false ? ' grille__legende--fermee' : ''}`;
      if (carte.ouverte !== false) bloc.href = carte.link;
      bloc.tabIndex = -1;
      bloc.addEventListener('click', (e) => {
        e.preventDefault();
        ouvrir(carte.id);
      });
      const titre = document.createElement('h3');
      titre.className = 'grille__titre';
      titre.textContent = carte.title;
      bloc.append(titre);
      if (carte.etiquettes?.length) {
        const ligne = document.createElement('div');
        ligne.className = 'grille__etiquettes';
        for (const e of carte.etiquettes) {
          const etiquette = document.createElement('span');
          etiquette.className = `grille__etiquette${e.mecene ? ' grille__etiquette--mecene' : ''}`;
          etiquette.textContent = e.texte;
          ligne.append(etiquette);
        }
        bloc.append(ligne);
      }
      this.racine.append(bloc);
      return bloc;
    });
    this.visible = false;
  }

  /**
   * Place chaque légende sous sa case ; elle apparaît quand sa carte est presque arrivée
   * @param {number[] | null} [ordre] rang de chaque vignette dans la cascade du déroulé (SpiralGallery.grille.ordre)
   */
  placer(disposition, defilement, progres, ordre = null) {
    const n = this.blocs.length;
    const visible = progres > 0;
    if (visible !== this.visible) {
      this.racine.classList.toggle('grille--active', visible);
      this.visible = visible;
    }
    if (!visible) return;
    this.blocs.forEach((bloc, i) => {
      const c = disposition.cases[i];
      const p = progresCarte(progres, ordre ? ordre[i] : i, n);
      const opacite = Math.min(1, Math.max(0, (p - 0.75) / 0.25));
      bloc.style.width = `${c.l}px`;
      bloc.style.transform = `translate(${c.x}px, ${c.y + c.h + 16 - defilement + (1 - opacite) * 12}px)`;
      bloc.style.opacity = String(opacite);
      bloc.tabIndex = progres === 1 ? 0 : -1;
    });
  }

  dispose() {
    this.racine.replaceChildren();
    this.racine.classList.remove('grille--active');
  }
}
