# Passation — reprise du pavillon de « Souffle d'éclats »

Rédigée le 06/11/2026 au soir par Claude Code, à la demande de Ludovic : « Je vais repartir sur la salle
Souffle d'éclats que l'on avait mise de côté. Mon collègue m'a préparé un glb pour l'œuvre. Je souhaite
l'intégrer dans la salle à la place de l'œuvre actuelle et travailler sur les lumières et quelques
ajustements sur l'environnement, la salle. »

À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture) et le haut de `JOURNAL.md`. Une
nouvelle session n'a **ni l'historique des conversations ni la mémoire** des précédentes : tout est dans
`CLAUDE.md`, `JOURNAL.md` et ce fichier. La passation précédente (05/11) reste lisible dans l'historique Git.

---

## 1. Où en est-on (06/11 au soir)

- **Branche principale** `claude/spirale-interactive-gallery-b4mzwd` : tout est enregistré et envoyé sur
  GitHub (`8df3784`) ; en ligne sur le labo (version du labo `bcf92df`). Deux fichiers modifiés à côté, à ne
  jamais mettre dans un commit sans demande de Ludovic : `plans/plan-salle.ai` et
  `src/salles/points-de-vue.json`.
- **Le pavillon** est sur la branche locale **`salle-pavillon`** (commit `f7f6606` du 05/11), sur ce Mac
  seulement : pas sur GitHub, pas fusionné, pas en ligne. **Ne pas l'envoyer sur GitHub, le fusionner dans la
  branche principale ni le mettre en ligne sans demande explicite de Ludovic.**
- Sur la branche principale, « Souffle d'éclats » est dans la salle provisoire, fermée à la visite.
- Le 06/11 (branche principale, détail dans `JOURNAL.md`) : réglages de Ludovic par salle
  (`src/salles/reglages.json`), anticrénelage ×4 par défaut, test invisible de la machine, **échelle des
  renoncements** (`src/renoncements.ts`), panneau des arbitrages, réglages « toutes les ombres » et « ombre de
  la statue », poussière jusqu'à la densité 3.
- Mis de côté par Ludovic (« laissons ça pour le moment ») : mesurer le coût de chaque effet (faisceau, halo,
  SMAA, grain, courbe, reflet, poussière, ombres en direct) pour une échelle des renoncements plus fine. Ce
  que regroupe « effets actifs » : courbe de couleurs, halo, SMAA, grain, profondeur de champ,
  suréchantillonnage (`Effets.tsx`).

## 2. Le pavillon tel qu'il est sur sa branche

Détail complet : `git show salle-pavillon:musee/JOURNAL.md` (entrée « 05/11/2026 — Claude Code (nouvelle
salle « pavillon », plan) ») et le `CLAUDE.md` de la branche.

- **Salle** : `blender/pavillon.py` (géométrie, précalcul, export), `src/salles/pavillon/config.ts`, plan
  coté `plans/salle-pavillon.html` (`plans/generer-plan-pavillon.py`). Carré de 40 m à 17,5 m sans puits ;
  8 baies de 10 × 14 m (huisseries acier noir, sans vitre dans le site) ; soleil bas du sud-est (30°) ;
  **espace central** couvert à 6 m (carré sur la pointe, ouvertures au sud-ouest et au nord-est), éclairé par
  ses ouvertures, **quatre projecteurs** au sol dans ses angles (`COIN_*`) et la **lueur de l'œuvre** comptée
  dans le précalcul (`OEUVRE_BLEU_FORCE`, `OEUVRE_ROUGE_FORCE`) ; deux bancs en arc ; dehors clair
  (`dehors: true`). On entre et on sort par les ouvertures de l'espace central (`chemin` des portes).
- **Œuvre actuelle** (à remplacer) : `blender/souffle.py` → `blender/sculpture-souffle/souffle.blend` et
  `public/models/souffle.glb`. Poumons de verre bleu, vaisseaux en verre rouge, 3,4 m de large, de 1,15 à
  4,75 m du sol, **flottant sans socle** (`sculpture.position` [0, 0,8, 0], `OEUVRE_Z` = 0,8 dans
  `pavillon.py`), face avant vers la vue d'arrivée (sud-ouest, `rotationY` −45, `OEUVRE_ROTATION`).
- **Matière de l'œuvre** : `src/scene/OeuvreVerre.tsx` (`sculpture.verre: true`), réglages touche M
  « Verre · Salle 3 ». **Elle dépend du modèle de `souffle.py`** : les maillages doivent avoir une matière
  nommée `Verre` (poumons, deux surfaces à 4,5 cm) ou `Vaisseaux`, et les vaisseaux portent des données dans
  leurs UV (UV = tour et longueur du tube, UV2 = rayon et trachée). Vraie réfraction : la salle rendue sans
  l'œuvre dans une image à part, vue au travers du verre (60 images/s sur le M1 en 1280 × 720).
- **Lumière** : `pavillon.py 2048 768 256` puis `blender/chaine.sh 2048 pavillon` (≈ 40 min). Calculs bruts
  dans `blender/salle-pavillon/*.exr` (hors Git, présents sur ce Mac).
- **Navigation** : vue d'arrivée à 8,5 m depuis l'ouverture sud-ouest, cercle de 5,5 m, cercle réduit de 3,5 m,
  regard de 1,8 à 4 m. Points de vue Maladie et Manifeste provisoires.
- **Restait à faire** : captures (transition, cartouches, vignette, vidéos du survol), points de vue, avis de
  Ludovic sur tout (tout est « à voir »), mesure sur une machine plus faible et sur mobile.

## 3. Reprendre : par où commencer

### 3.1 Remettre la branche du pavillon à jour (à faire en premier)

La branche principale a **19 enregistrements de plus** que la base du pavillon. Elle a changé en particulier
`Salle.tsx`, `pierre.ts` (`appliquerPierre` prend maintenant les ombres et le rapport de l'ombre de la statue),
`Couloir.tsx`, `Effets.tsx` (troisième passe sans halo, échantillons bornés par les renoncements),
`types.ts`, `oeuvres.ts`, `CLAUDE.md`, `JOURNAL.md` et ce fichier.

1. `git switch salle-pavillon` (les deux fichiers modifiés à côté suivent sans gêne : la branche n'y touche pas).
2. `git merge claude/spirale-interactive-gallery-b4mzwd` (localement : rien n'est envoyé sur GitHub).
3. Conflits attendus dans `Salle.tsx`, `Couloir.tsx`, `oeuvres.ts`, `types.ts`, `CLAUDE.md`, `JOURNAL.md`,
   `PASSATION.md` : **garder les deux côtés** (le pavillon : sculpture facultative, `verre`, `faisceau: false`,
   `dehors` ; la principale : ombres, `ombreStatue`, renoncements, Huntington renommée « La Chorée de
   Huntington »). Dans `oeuvres.ts`, garder `souffle-d-eclats` dans `SALLES_OUVERTES` et en troisième.
4. Vérifier `npx tsc --noEmit`, `npm run build`, puis le site : entrer dans le pavillon, passage Huntington ↔
   pavillon dans les deux sens, réfraction, aucune erreur dans la console.
5. Le pavillon n'a pas de réglages dans `src/salles/reglages.json` : il prend les valeurs par défaut de la
   touche M. Ses effets d'image sont dans `effets` de sa config.

Enregistrer cette fusion dans Git (localement) seulement avec l'accord de Ludovic.

### 3.2 Intégrer le GLB du collègue

**Le fichier est arrivé le 06/11 à 22 h 38 : `musee/poumons.glb`** (20,6 Mo, hors Git pour l'instant). Le
déplacer dans `blender/sculpture-souffle/` (source, comme `huntington-jeff.glb`). Ce qu'on en sait
(`npx @gltf-transform/cli inspect`) :
- exporté de **3ds Max** (maillage d'origine Tripo, généré), **en millimètres** : 3,86 m de large, 4,02 m de
  haut, 1,73 m de profondeur ; posé sur le sol (bas à 0), centré en largeur, pas en profondeur (−1,12 à
  +0,60 m) ;
- **deux maillages** (24 000 et 18 700 triangles, nommés `tripo_node_…` : sans doute les poumons et les
  vaisseaux, à vérifier), chacun avec sa matière PBR (couleur, normales, métal / rugosité) en **4096 px**,
  **transparence par mélange** (`alphaMode BLEND`) et `KHR_materials_specular` ;
- textures trop lourdes pour le site (≈ 90 Mo de mémoire graphique chacune) : les passer en WebP 2048 ;
- matières aux noms génériques : `OeuvreVerre.tsx` ne les reconnaîtra pas (voir le point 4).

Même démarche que pour la statue de Jeff (Huntington, 03/11 : `blender/huntington-jeff.py`) :

1. **Le regarder** : rendu rapide de quelques vues (Blender) ou ouverture dans le site, à montrer à Ludovic
   avant d'aller plus loin (orientation, face avant, ce que contient chaque maillage, effet de la transparence).
2. **Le mettre à la taille et à la place de l'œuvre actuelle** par un script (`blender/poumons.py`,
   comme `huntington-jeff.py`) : même encombrement (3,4 m de large, de 1,15 à 4,75 m du sol) sauf avis
   contraire de Ludovic, centré, face avant vers le sud-ouest. Le script produit un `.blend` pour le précalcul
   et un GLB brut.
3. **Compresser** vers `public/models/` : `gltf-transform optimize … --join false` (textures en WebP 2048 ;
   `--prune-attributes false` si ses UV servent). Attention : l'export glTF de Blender retourne V (1 − v).
4. **Matière : demander à Ludovic.** Soit la matière de son collègue telle qu'elle est (lumière normale de
   l'œuvre, comme les autres salles : retirer `verre: true`), soit le verre d'`OeuvreVerre.tsx` : il faudra
   alors nommer les matières `Verre` et `Vaisseaux` et refaire ce que les vaisseaux lisaient dans leurs UV
   (ou l'enlever), puisque le nouveau modèle n'a pas ces données.
5. **Dans le précalcul** : `pavillon.py` charge l'œuvre depuis `sculpture-souffle/souffle.blend` (vers la
   ligne 377) pour son ombre et sa lueur : le pointer vers le nouveau `.blend`, puis relancer la lumière
   (`pavillon.py 2048 768 256` puis `chaine.sh 2048 pavillon`, ≈ 40 min ; ne pas mesurer la fluidité pendant
   ce temps, Blender occupe la carte graphique). Le réglage « ombre de la statue » n'existe pas encore pour
   le pavillon : `blender/ombre-statue.sh` ne connaît que `seuil` et `rotonde` (à étendre si Ludovic le veut).
6. **Navigation et points de vue** à revoir avec la nouvelle forme (cercles, `regard`, touche V).
7. **Fluidité** : tout nouvel effet coûteux (la réfraction l'est) doit trouver sa place dans l'échelle des
   renoncements (`src/renoncements.ts`, ordre décidé par Ludovic) ; le test de la machine est calé sur
   Huntington (`performances.ts`).

### 3.3 Lumières et ajustements de la salle

Ce que Ludovic a dit vouloir travailler ensuite, sans plus de détail : lui demander quoi. Leviers existants :
- **précalcul** (`pavillon.py`) : soleil (`SOLEIL_*`), projecteurs des angles (`COIN_*`, force 200), lueur de
  l'œuvre, matières (albédos), ciel et dehors ; chaque changement = un nouveau calcul de ≈ 40 min (128
  échantillons et ≈ 6 min pour un essai rapide, qui crénelle les bords : ne pas juger la géométrie dessus) ;
- **en direct** (touche M) : « Salle · <salle> » (exposition, lumière, voile, toutes les ombres), « Effets ·
  <salle> » (courbe, halo, grain), « Couloir », « Verre · Salle 3 » ; Ludovic copie ses réglages par le bouton
  « Copier les réglages » et les colle dans la conversation : les reporter dans `src/salles/reglages.json`.
- Défauts connus : par les baies sud-ouest, on voit l'extérieur ensoleillé des couloirs à fentes.

## 4. Outils

- **Blender** : `/Applications/Blender.app/Contents/MacOS/Blender -b --python-use-system-env -P script.py --
  arguments`. Pillow et scikit-image doivent être installés avec le Python de Blender (`CLAUDE.md`, « Chaîne
  3D ») dans un dossier passé dans `PYTHONPATH` (le dossier du 06/11 était temporaire).
- **Navigateur intégré** : serveur de dev `preview_start` nom `dev`, site construit `apercu` (port 4173). Il
  doit être **visible et au premier plan** : masqué ou en arrière-plan, il fige les animations et fausse le
  test de la machine.
- **Labo** (`lab_upload_zip`, procédure dans l'historique Git de ce fichier, version du 05/11) : toujours
  depuis la branche principale, sans le pavillon, sauf demande contraire.

## 5. Rappels pratiques

- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **Géométrie impeccable** (décision de Ludovic) : après chaque changement de la salle, inspecter de près les
  ouvertures, les baies, les portes et les raccords salle / couloir avec la lumière définitive.
- **CSS :** toujours `-webkit-backdrop-filter` **avant** `backdrop-filter`.
- **Ludovic :** répondre en français, court ; montrer des captures ; étapes numérotées et concrètes quand il
  doit agir (il n'est pas à l'aise avec le Terminal) ; ne marquer « validé » que sur son accord explicite ;
  enregistrer dans Git, envoyer sur GitHub ou mettre en ligne seulement à sa demande ; à la fin de chaque
  session, une entrée en haut de `JOURNAL.md`.
