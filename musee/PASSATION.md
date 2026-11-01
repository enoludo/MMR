# Passation — avant de retravailler la statue de « La maladie de Huntington »

Rédigée le 01/11/2026 par Claude Code, à la fin de la session « vue Grille de la page d'accueil ». À lire
après `CLAUDE.md` (contexte, décisions de Ludovic, architecture détaillée) et le haut de `JOURNAL.md`
(détail de chaque changement, avec son statut). Remplace la passation « avant de reprendre l'animation des
titres de la spirale », toujours lisible dans l'historique Git.

---

## 1. Prochaine tâche : la statue de « La maladie de Huntington »

**Demande de Ludovic (01/11) :** retravailler la statue pour être **plus fidèle à l'image de référence** :
les **proportions du corps** et les **détails « plaques »**, travaillés plus finement.

**Image de référence :** `public/assets/images/la-maladie-de-huntington.webp` (l'ancien visuel de l'œuvre,
aujourd'hui la vignette des flèches précédente / suivante). La regarder en grand avant tout : silhouette
dansée qui se défait, plaques anguleuses, éclats qui s'envolent du haut du corps.

**La statue aujourd'hui :** `blender/huntington.py` (modélisée par Claude le 29/10, d'après cette vignette).
- Squelette posé à la main (dictionnaire `J` : bassin, buste, tête, bras, jambes en mètres, Z en haut,
  l'œuvre regarde vers -Y), os `OS` avec un rayon au début et à la fin.
- Chaque membre est un volume anguleux (enveloppe convexe de points tirés au hasard, `random.seed(7)`),
  couvert de plaques un peu décollées (jointures sombres), éclats autour du haut du corps.
- Une seule matière, couleurs par sommet : `BRONZE`, `OR` (plaques), `JOINT`.
- Silhouette de **2,70 m** (décision de Ludovic, 29/10), sur un **socle rond de 80 cm** (1,2 m de rayon) à
  gorge lumineuse : le socle est dans la salle (`rotonde.py` / `salle.py`), pas dans `huntington.py`.
- Lancer : `/Applications/Blender.app/Contents/MacOS/Blender -b --python-use-system-env -P blender/huntington.py -- aperçu.png`
  (l'aperçu PNG permet de comparer à la référence sans passer par le site).

**Pistes pour être plus fidèle :**
- Comparer côte à côte l'aperçu et la référence, à la même focale et sous le même angle (vue d'arrivée
  cadrée comme la vignette, 6,3 m dans l'ancienne salle) ; corriger d'abord les proportions (longueur des
  membres, largeur des épaules et du bassin, taille de la tête, cambrure), puis la pose.
- Plaques plus fines : plus nombreuses et plus petites, découpées en facettes plutôt qu'en volumes
  convexes, jointures plus régulières, épaisseur visible sur les bords ; garder un nombre de triangles
  raisonnable pour le site (le GLB fait aujourd'hui 95 Ko).
- Montrer des aperçus à Ludovic à chaque étape (face, trois-quarts, profil) avant de lancer le reste de la
  chaîne, qui est long.

**Après la modélisation (tout cela dépend de la forme de la statue) :**
1. Compression vers le site : `gltf-transform optimize … --compress meshopt --simplify false`, puis
   `occlusion.mjs … 0.005` → `public/models/huntington.glb` (détail : `blender/README.md`, étape 1 bis).
2. **Lumière de la rotonde à recalculer** (l'ombre et l'occlusion de la statue sont dans ses lightmaps) :
   `rotonde.py 2048 768 256` puis `blender/chaine.sh 2048 rotonde` (≈ 40 min ; lancer en arrière-plan).
3. **Captures à refaire**, salle ouverte, avec la vue libre (touche V, bouton « Faire les captures ») :
   image de la transition depuis la spirale et la grille, vignette des flèches, photos des cartouches
   Maladie et Manifeste.
4. Revoir les points de vue Maladie et Manifeste si la pose change (touche V).

## 2. Où en est-on

**Git :** tout est enregistré et envoyé sur GitHub (`enoludo/MMR`, branche
`claude/spirale-interactive-gallery-b4mzwd`).

**En ligne :** le labo `mmr-lab` (https://mmr-lab.labs.cubedesigners.com/) est toujours à la version du
30/10 : **rien du 31/10 et du 01/11 n'est en ligne**.

**Fait le 01/11** (tout est « à voir » dans le journal, sauf ce qui a été abandonné) :
1. **Titres de la spirale qui se croisent** au changement de carte.
2. **Vue Grille** de la page d'accueil : la spirale se déroule en grille (`gallery/Grille.js`), fond noir,
   légendes sous les vignettes, défilement.
3. **Grille → salle :** la grille se range en spirale (la vignette cliquée en dernier, au centre), le zoom
   part à 69 % du rangement. **Salle → grille :** retour de la spirale, puis la spirale se range en grille
   avant la fin de la réduction (75 %), la vignette de l'œuvre la première. La grille revient défilée comme
   on l'a quittée. Les essais de pile au centre et de retour en courbe ont été abandonnés.
4. **Préchargement au survol** d'une vignette (0,2 s) : plus de saccade au clic.
5. **Barre de recherche** en bas de la vue Grille (maquette « SearchBar » 58:455) : **affichée seulement**,
   la saisie et les menus Tags / Mécènes ne filtrent pas encore.
6. **Flèches de la spirale et champs de la recherche qui se chassent** au changement de vue (effet des
   titres).
7. Corrections : dédoublement de l'image pendant le zoom vers une salle (carte 3D réaffichée sous l'image),
   lettres des titres qui traversaient leur masque quand le titre était caché.

## 3. Où trouver quoi

| Sujet | Fichiers |
|---|---|
| Statue de Huntington | `blender/huntington.py`, `blender/sculpture-huntington/`, `public/models/huntington.glb`, `src/salles/rotonde/config.ts` (`sculpture`) |
| Rotonde (lumière précalculée) | `blender/rotonde.py`, `blender/chaine.sh`, `blender/salle-rotonde/`, `public/models/rotonde-*` |
| Vue Grille | `src/accueil/gallery/Grille.js` (réglages, cases, légendes, `rangsDepuis`), `src/accueil/gallery/SpiralGallery.js` (`grille`, `versGrille`, `carteCachee`), `src/accueil/Accueil.tsx` (`changerVue`, `ouvrirDepuisGrille`, `allerSpirale`, `retourGrille`) |
| Transitions spirale ou grille ↔ salle | `src/transition.ts` (`entrer`, `carteVivante`), `src/ui/Transition.tsx`, `src/ui/ToileTransition.ts` |
| Recherche, flèches qui se chassent | `src/accueil/Accueil.tsx` (`.recherche`, `.masque`, `SORTIE_PILULES`), `src/style.css` |
| Captures | `src/outils/capture.ts`, `src/ui/VueLibre.tsx` |

## 4. Points ouverts (détail dans `CLAUDE.md`)

- **À montrer à Ludovic :** toute la vue Grille et ses transitions, les réglages de départ (touche M
  « Grille » : « vers une salle : départ du zoom », « retour : départ de la grille »).
- **Recherche et filtres** à relier à la grille (et l'étiquette « thème », absente des données).
- Une image d'environ 0,1 s reste au premier dessin d'une salle (matières du reflet, des ombres et des
  effets compilées à ce moment-là), pendant le rangement de la grille.
- Rotonde : bruit de la lumière sur les colonnes, approche de la porte d'entrée, lumière de l'œuvre.
- Mobile, chiffres du popup Maladie, bundle de 1,3 Mo : inchangés.
- Ménage : `~/MMR/_to_delete/`, `musee/_a_supprimer/`, les zips et « Claude outputs » à la racine de `MMR`.

## 5. Rappels pratiques

- **Serveur de développement :** `npm run dev` (http://localhost:5173).
- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
  Mesurer les performances sur la version compilée (`npm run build` puis `npx vite preview`), onglet du
  navigateur intégré **au premier plan** (un onglet en arrière-plan ralentit tout).
- **Navigateur intégré :** masqué, il fige les animations. `gsap.globalTimeline.timeScale(0.05)` ralentit
  les transitions, mais pas le rangement de la grille (horloge propre). Leva se pilote depuis la console
  avec `levaStore` (importé depuis l'adresse de `leva.js` relevée dans `performance.getEntriesByType('resource')`).
- **Blender :** scripts lancés avec le Blender de l'application (commande dans `CLAUDE.md`) ; les calculs
  longs en arrière-plan.
- **Mettre en ligne sur le labo :** `npm run build`, copier `dist/` sans `.htaccess` ni les lightmaps WebP,
  ajouter une copie de `index.html` dans `oeuvre/<id>/` pour chaque œuvre et dans `a-propos/`, zipper, puis
  `lab_upload_zip` (labo `mmr-lab`, `clean: true`).
- **Ludovic :** répondre en français, court ; montrer des captures ; ne marquer « validé » que sur son
  accord explicite ; enregistrer dans Git ou mettre en ligne seulement à sa demande.
