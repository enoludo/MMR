# Passation — pavillon de « Souffle d'éclats » (suite)

Rédigée le 07/11/2026 au soir par Claude Code, à la demande de Ludovic (« fais-moi une passation, enregistre,
git, github »).

À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture) et le haut de `JOURNAL.md` (entrée du
07/11, détaillée point par point). Une nouvelle session n'a **ni l'historique des conversations ni la
mémoire** des précédentes : tout est dans `CLAUDE.md`, `JOURNAL.md` et ce fichier. La passation précédente
(06/11 : intégration du GLB du collègue) reste lisible dans l'historique Git.

---

## 1. Où en est-on (07/11 au soir)

- **Branche `salle-pavillon`** : tout le travail du pavillon y est enregistré et, **depuis le 07/11 au soir et
  à la demande de Ludovic, envoyé sur GitHub** (`origin/salle-pavillon`). Elle n'est **ni fusionnée dans la
  branche principale ni en ligne** : ne le faire que sur demande explicite de Ludovic.
- **Branche principale** `claude/spirale-interactive-gallery-b4mzwd` : inchangée depuis le 06/11 (`61e2d83`),
  en ligne sur le labo. La branche du pavillon contient tout ce qu'elle a (fusionnée le 06/11).
- Deux fichiers modifiés à côté, **jamais mis dans un commit sans demande de Ludovic** : `plans/plan-salle.ai`
  et `src/salles/points-de-vue.json`. Attention : ce dernier contient peut-être des points de vue du pavillon
  réglés par Ludovic (touche V) ; lui demander avant la prochaine fusion ou mise en ligne.
- Tout est « à voir » ou « vu », rien n'est « validé » (statuts dans `JOURNAL.md`).

## 2. Le pavillon aujourd'hui

- **Œuvre** : poumons du collègue de Ludovic (`blender/sculpture-souffle/poumons.glb`, source 3ds Max) mis à
  la taille et à la place par `blender/poumons.py` (→ `poumons.blend` pour le précalcul, `poumons-raw.glb`,
  puis `public/models/poumons.glb` compressé avec `--prune-attributes false` : la couleur de sommet
  « dansVerre » sert à la déformation des artères). Flottante, `sculpture.position` [0, 0,8, 0],
  `rotationY` −45, sans reflet au sol (essayé, refusé).
- **Matière** : verre d'`scene/OeuvreVerre.tsx` (touche M « Verre · Salle 3 », réglages de Ludovic dans
  `reglages.json`), bronches incandescentes comme une résistance (`scene/incandescence.ts`), lueur rouge de
  l'œuvre sur la salle (`lueurOeuvre` de la config). Faisceaux dans l'air refusés : la lumière reste dans le
  verre.
- **Espace central** (`blender/pavillon.py`) : plafond à 12 m (`H_INT`), ouvertures sur toute la hauteur
  (`H_OUV` 12, plus de linteaux), **puits de lumière** de 4,4 m au-dessus de l'œuvre (`PUITS_D`), gris
  froids (`COULEURS_CENTRE`), rubans bleu / beige au pied des murs, anneau suspendu à 6 m avec 8 projecteurs,
  8 bornes, anneau bas de mise à distance, cartel sur pupitre côté sud-ouest (`CARTEL_ANGLE` 225°), bancs
  retirés (`BANCS_ACTIFS = False`), joints du sol dessinés par le site (`joints` de la config).
- **Éclairage réglable en direct puis figé** (en dev) : touche M « Éclairage » (`scene/EclairageDirect.tsx`),
  bouton « Figer » en tête : écrit `src/salles/pavillon/eclairage.json` et lance le calcul de la lumière
  par le serveur de dev (`/__eclairage`, ≈ 20 min, journal `blender/salle-pavillon/figer.log`). Les valeurs
  enregistrées par « Enregistrer les réglages de cette salle » priment au rechargement.
- **Flou de la salle, œuvre nette** (`scene/FlouSalle.ts`, Huntington et Souffle) : essai, à voir.
- **Fiches** Maladie (sarcoïdose) et Manifeste (« Oppression », titre proposé par Claude) rédigées.
- **Couloirs (fin du 07/11)** : tous les couloirs entre deux salles ont les mêmes réglages, **6 fentes de 1 m
  tous les 2 m** (choix de Ludovic), dossier « Couloir · couloirs entre salles » de la touche M
  (`salles/couloirs.ts`, clé `couloirs` de `reglages.json`) ; les impasses gardent ceux de leur salle. Flash
  du couloir à l'arrivée dans Huntington corrigé (couloir traversé gardé visible à l'image de l'arrivée,
  réglages posés avant le premier dessin, paroi ensoleillée factice derrière les fentes en fondu selon la
  caméra). Vérifié image par image de Souffle vers Huntington et retour.

## 3. Reste à faire

1. **Vérifier les passages Huntington ↔ Seuil** après les changements des couloirs (pas refait depuis) :
   fentes, lumière, aucun flash à l'arrivée.
2. **Captures de « Souffle d'éclats »** (transition, cartouches, vignette, vidéos du survol) : faites par
   Ludovic le 07/11, **avant** les derniers changements de la salle (ouvertures à 12 m, bancs retirés,
   éclairage) : à refaire quand la salle sera arrêtée (touche V, « Faire les captures », « Vidéo du survol »).
3. **Points de vue** Maladie et Manifeste du pavillon à régler (touche V) ; cercles de la navigation à revoir.
4. **Textes** : citer la source de la prévalence (⁽¹⁾ dans le texte reçu), faire valider le titre
   « Oppression ».
5. **Fluidité** : réfraction, incandescence et flou de la salle n'ont pas de place dans l'échelle des
   renoncements (`src/renoncements.ts`) ; le test de la machine est calé sur Huntington. Mesurer le pavillon
   sur une machine plus faible et sur mobile.
6. **Ombre de la statue** pour le pavillon : `blender/ombre-statue.sh` ne connaît que `seuil` et `rotonde`.
7. **À reporter sur la branche principale** avant une mise en ligne sans le pavillon : la barre de défilement
   masquée du premier écran (`.salle-accueil`, `style.css`) et les corrections des couloirs (flash, réglages
   communs), faites sur cette branche.
8. Avis de Ludovic sur tout ce qui est « à voir » dans `JOURNAL.md` du 07/11.

## 4. Outils

- **Blender** : `/Applications/Blender.app/Contents/MacOS/Blender -b --python-use-system-env -P script.py --
  arguments`. Pillow est installé dans `blender/.pylib` (hors Git), à passer dans `PYTHONPATH`.
- **Lumière du pavillon** : bouton « Figer » de la touche M « Éclairage », ou `pavillon.py 2048 768 512` puis
  `blender/chaine.sh 2048 pavillon` (≈ 20 min). Ne pas mesurer la fluidité pendant un calcul.
- **Navigateur intégré** : serveur de dev `preview_start` nom `dev`, site construit `apercu` (port 4173). Il
  doit être visible et au premier plan. Ludovic peut cliquer dedans pendant les essais : recharger si un
  passage part tout seul.
- **Mise au point des passages** : `__visite.etat.duree = 1e7` puis `__visite.etat.t` (0 → 1) ;
  enregistrement image par image en enveloppant `requestAnimationFrame` (lire l'image après le rendu de R3F).

## 5. Rappels pratiques

- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **Géométrie impeccable** (décision de Ludovic) : inspecter ouvertures, puits, portes et raccords salle /
  couloir avec la lumière définitive.
- **React Three Fiber :** un objet monté pendant un passage doit recevoir ses réglages dans `useLayoutEffect`
  (un `useEffect` arrive après la première image : flash).
- **Ludovic :** répondre en français, court ; montrer des captures ; étapes numérotées et concrètes quand il
  doit agir ; ne marquer « validé » que sur son accord explicite ; enregistrer dans Git, envoyer sur GitHub
  ou mettre en ligne seulement à sa demande ; à la fin de chaque session, une entrée en haut de `JOURNAL.md`.
