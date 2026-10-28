# Journal de bord — Musée des Maladies Rares (site 3D)

Ce qui a été fait, par date, et où en est la validation de Ludovic.
Une entrée par session, la plus récente en haut. Le détail technique est dans `CLAUDE.md` et `README.md`.

**Statuts :**
- **[validé]** : Ludovic l'a vu et l'a approuvé explicitement.
- **[vu]** : Ludovic l'a vu sur sa machine et n'a pas demandé de changement.
- **[à voir]** : fait et vérifié par Claude (compilation, captures), pas encore vu par Ludovic.
- **[abandonné]** : remplacé par autre chose (on garde la trace de pourquoi).

---

## 28/10/2026 — Claude Code (transitions : plus de temps mort au retour)

- **Git** : `musee/` est maintenant enregistré dans le dépôt GitHub `enoludo/MMR` (même branche que la galerie spirale), sans les fichiers lourds ou régénérables ni la clé Vercel (voir `CLAUDE.md`). La copie locale de `~/MMR` a été mise à jour (13 enregistrements de la galerie spirale récupérés).
- Zip à héberger avec ces corrections : `~/MMR/musee-site-a-heberger-2026-10-28-v2.zip` (6,9 Mo, contenu de `dist/` à la racine, `.htaccess` compris ; le zip de midi est conservé).

Retour de Ludovic : au retour vers la spirale, un petit temps mort une fois la salle revenue à la vue initiale.
- **[à voir]** **Plus de temps mort** : la réduction de la photo démarrait 0,4 à 1,9 s après l'arrivée à la vue initiale (création de la spirale, rechargement de ses images, démontage de la salle). Elle démarre maintenant ≈ 0,07 s après, mesuré sur le site compilé. Pour cela :
  - la spirale se prépare, cachée, pendant que la caméra rejoint la vue initiale (comme la salle se prépare à l'aller), et compile ses shaders sans bloquer ;
  - chaque image de carte n'est préparée qu'une fois par œuvre et gardée en mémoire (chaque carte la rechargeait, 50 fois, dont 8 sur la capture de 5120 px de « Le seuil ») : la spirale s'affiche aussi plus vite au premier chargement du site ;
  - le moteur 3D de la spirale est gardé d'une visite à l'autre (le recréer bloquait ≈ 0,2 s) ;
  - la salle quittée reste en place, cachée et arrêtée, et n'est démontée que 1,5 s après le retour sur la spirale.
- **[à voir]** La réduction démarre un peu plus franchement (courbe moins lente au départ).
- Vérifié sur le site compilé : retour sans à-coup au clic (l'à-coup de ≈ 0,3 s a disparu), passage à l'œuvre suivante inchangé.

## 28/10/2026 — Claude Code (transitions : image et 3D superposées au retour)

Retour de Ludovic : le saut au retour n'est pas réglé, l'image et la 3D ne semblent pas tout à fait synchronisées en revenant sur la spirale.
- **[à voir]** **Photo de la salle synchronisée avec l'image** : pendant la réduction, la photo de la salle (la 3D telle qu'on la quitte) restait figée dans sa boîte, pendant que l'image de la carte s'agrandissait dans son masque (×1 → ×2) et reculait (parallaxe). Pendant leur fondu, les deux se décalaient : œuvre dédoublée. La photo suit maintenant exactement le même mouvement (même agrandissement, même champ, même recul grâce à la profondeur de la capture) ; là où elle ne voit pas le point (mur caché derrière le bord de l'œuvre), l'image prend seule le relais.
- **[à voir]** **Image de la carte plus précise** : la recherche de profondeur avançait par pas trop grands au loin (un seul pas entre 10 et 80 m) et plaçait la sculpture à 1 m près ; l'image différait de la salle d'environ 2 % (plus sur la main). Pas resserrés : image et 3D se superposent maintenant à la vue initiale (vérifié en mélangeant les deux à 50 %). Profite aussi au relais image → salle de l'aller.
- Vérifié : la capture de « Le seuil » correspond toujours à la salle (superposition exacte), la caméra s'arrête bien à la vue initiale au retour ; fluidité inchangée (30 images/s dans le navigateur intégré, comme au repos).

## 28/10/2026 — Claude Code (transitions : voiles sombres, textes lettre par lettre)

Retours de Ludovic : le saut au retour vers la spirale est toujours là ; soigner l'apparition et la disparition des voiles noirs sur la carte de la spirale et sur la salle ; textes de la salle lettre par lettre avec masque, comme sur la spirale, à l'entrée et à la sortie.
- **[à voir]** **Saut au retour, cause trouvée** : la salle est recouverte d'une vignette sombre (dégradé du Figma, en CSS), absente de la photo de la salle ; à l'instant de la photo, les bords de l'écran s'éclaircissaient d'un coup. De plus, le header de la spirale passait sous l'image pendant tout le retour, puis réapparaissait d'un coup.
- **[à voir]** **Vignette de la salle** : l'image de la transition porte maintenant la même vignette, qui s'installe à mesure que la carte gagne l'écran à l'entrée et s'efface pendant qu'elle se réduit au retour.
- **[à voir]** **Voile sur la carte de la spirale** : les cartes 3D sont éclairées, donc plus sombres que leur image (≈ 68 %). Au clic, l'image de la transition éclaircissait la carte d'un coup ; au fondu du retour, la carte se réassombrissait. L'image prend maintenant l'éclairage exact de la carte quand elle est à sa place (calculé depuis la spirale), et le perd en gagnant l'écran (et inversement). Vérifié en superposant image et carte : identiques.
- **[à voir]** **Textes lettre par lettre** : en entrant, le titre de la spirale part vers le haut lettre par lettre dans ses masques ; dans la salle, le titre de l'œuvre monte lettre par lettre (mêmes réglages que la spirale) et les liens, le soutien et le partage suivent en fondu, au moment où l'image s'efface sur la salle. En sortant, ils repartent par le haut pendant que la caméra rejoint la vue initiale (0,6 s au moins), et le titre de la carte remonte lettre par lettre au fondu final sur la spirale.
- **[à voir]** Le header reste à l'écran pendant les transitions (logo, son, menu au même endroit sur les deux pages) ; seule sa partie centrale (onglets Spirale/Grille, titre de l'œuvre) s'efface et revient.
- Corrigé au passage : un mot trop long pour sa colonne se coupait entre deux lettres une fois découpé (« PROPORTION / S ») ; le bouton « Découvrir » vide pouvait s'afficher un instant (rond blanc) au retour.

## 28/10/2026 — Claude Code (transitions : retour sans saut, carte recentrée)

- Zip à héberger : `~/MMR/musee-site-a-heberger-2026-10-28.zip` (7,2 Mo, contenu de `dist/` à la racine, `.htaccess` compris ; l'ancien zip du 27/10 est conservé).

Retour de Ludovic : le retour vers la spirale n'est pas aussi fluide que l'aller (saut de visuels) ; recentrer la spirale sur le visuel cliqué, une seule position pour le départ et l'arrivée.
- **[à voir]** **Saut au retour corrigé** : pendant la réduction, la carte 3D de la spirale grandissait avec l'image sans avoir tout à fait sa forme ; ses bords dépassaient autour de l'image, avec un autre cadrage (×2 dans la carte, ≈ ×1,5 dans l'image à ce moment). Elle est maintenant cachée tant que l'image la recouvre, et réapparaît sous l'image au fondu final. Même correction à l'aller.
- **[à voir]** **Carte recentrée** : au clic sur « Découvrir », la spirale amène d'abord la carte exactement au centre (l'image de la transition la suit), puis le zoom part de là. Au retour, la carte revient à cette même position : une seule position de départ et d'arrivée.
- Corrigé au passage : la mesure de la carte à l'écran tenait compte de l'agrandissement de la spirale pendant le zoom.

## 28/10/2026 — Claude Code (transitions : netteté, durées, préparation de la salle)

Retours de Ludovic : vignette pas assez nette pendant la transition (essayer ×2), transition plus longue, charger la salle pendant la transition pour un fondu plus fluide.
- **[à voir]** **Vignette plus nette** : capture refaite en double résolution (5120 × 2880, 300 Ko), image de transition dessinée à la pleine résolution de l'écran (elle l'était à 75 %), avec des mipmaps (nette aussi quand la carte est petite). Profondeur en 2560 × 1440 (bords de l'œuvre plus propres).
- **[à voir]** **Plus long** : zoom d'entrée 0,75 → 1,4 s, fondu sur la salle 0,7 → 1 s, avancée dans l'image et freinage dans la salle allongés (1,6 s et 2,2 s) ; retour : réduction 0,9 → 1,4 s, fondu 0,35 → 0,5 s. Tout se règle avec la touche M, dossier « Transitions ».
- **[à voir]** **La salle se prépare pendant la transition** : dès le clic, elle se monte cachée sous la spirale (qui reste affichée), ses images sont envoyées à la carte graphique et ses matières compilées ; le zoom ne démarre qu'ensuite (≈ 1 s sur le site compilé dans le navigateur intégré, plus court sur une machine normale), pendant que le titre s'efface. Mesuré sur le site compilé : zoom et fondu sans à-coup (avant : ≈ 0,8 s de blocage juste avant le fondu, l'image se figeait).
- Gains au passage, valables aussi hors transitions : lightmaps décodées hors du fil principal et partagées entre la salle et ses couloirs (elles étaient chargées deux fois) ; plus de vérification des shaders hors développement (≈ 0,3 s de moins à l'arrivée dans une salle). Rendu de la salle vérifié identique (écart moyen 0,8/255 avec la capture d'avant).
- Si le mouvement est interrompu par un à-coup du navigateur, il reprend où il en était au lieu de sauter.
- **[à voir]** Vignette de « Le seuil des proportions » agrandie **×2** dans son masque sur la spirale (×1,5 avant), précision de Ludovic : l'image revient à ×1 quand le masque occupe l'écran (`ZOOM_CARTE`, `src/entree.ts`).

## 28/10/2026 — Claude Code (transitions : effet de masque, retour par la vue initiale)

Retours de Ludovic : renforcer l'entrée par un effet lié au masque plutôt que par la parallaxe ; au retour, passer par la vue initiale pour retrouver la correspondance avec la vignette.
- **[à voir]** **Effet de masque** : dans la spirale, la capture de « Le seuil des proportions » est agrandie ×1,5 dans sa carte (recadrée sur l'œuvre). Pendant le zoom, le masque s'ouvre jusqu'au plein écran pendant que l'image revient à ×1 : on découvre la salle autour de l'œuvre. Inverse au retour. La légère avancée de caméra (parallaxe) est gardée par-dessous : c'est elle qui raccorde l'image à la salle. Réglage : `ZOOM_CARTE` dans `src/entree.ts`.
- **[à voir]** **Retour par la vue initiale** : en cliquant sur la croix (ou le logo, ou « La collection »), l'interface de la salle s'efface et la caméra rejoint d'abord la vue initiale, en contournant l'œuvre (0,3 à 2 s selon la distance, popup refermé au passage) ; la salle est photographiée de là, puis se réduit sur sa carte en reculant dans l'image. Plus de dédoublement de l'œuvre pendant le fondu, d'où qu'on parte.

## 28/10/2026 — Claude Code (transitions : spirale qui grandit, capture, parallaxe)

Retours de Ludovic sur la première version (« très bon début ») : toute la spirale doit grossir avec la vignette, une capture de la vue initiale pour que le visuel corresponde à la salle, une parallaxe pour avoir l'impression d'entrer dans l'image.
- **[à voir]** **Toute la spirale grandit avec la vignette** à l'aller (et rétrécit avec elle au retour) : la carte reste sous l'image, les cartes voisines s'écartent. La spirale ne s'assombrit plus.
- **[à voir]** **Capture de la salle de « Le seuil des proportions »** (`public/assets/captures/le-seuil-des-proportions.webp`, 2560 × 1440) : c'est désormais le visuel de sa carte dans la spirale (l'ancien, `geant-de-marbre.webp`, est conservé). Elle est prise un peu en recul de la vue initiale (1,6 m dans l'axe du regard, champ un peu plus large), là où commence le mouvement d'entrée, avec la profondeur de chaque pixel.
- **[à voir]** **Parallaxe : on entre dans l'image.** La caméra avance en ligne droite de la vue de la carte jusqu'à la vue initiale ; l'image est déformée comme si l'on avançait déjà dedans (le sol et l'œuvre grandissent plus vite que le fond), puis la salle prend le relais au même point du mouvement, sans raccord visible (vérifié en figeant le mouvement : image et salle se superposent). Au retour, on recule hors de l'image en la réduisant. Les autres œuvres (photos, sans capture) gardent un zoom simple.
- Outil pour refaire une capture (quand la salle change, ou pour une nouvelle œuvre) : voir `CLAUDE.md`, « Transitions ».

## 28/10/2026 — Claude Code (transitions spirale ↔ salles)

Choix de Ludovic (questions de la passation) : zoom de la carte, retour sur l'œuvre quittée avec l'effet inverse, environ 1,5 s sans interruption, préchargement de l'œuvre centrée.
- **[à voir]** **Entrée** (« Découvrir ») : une image de la carte se pose exactement sur elle et grandit jusqu'à remplir l'écran (0,75 s) ; le titre et les flèches s'effacent, la spirale s'assombrit autour. La salle se charge sous l'image ; dès qu'elle est dessinée, l'image s'efface (0,7 s) pendant que la caméra glisse jusqu'à la vue d'arrivée (1,5 m plus loin, 1,5 m plus haut, champ plus large au départ ; 1,4 s ; réglages « Navigation », touche M). Le premier écran et la barre du bas apparaissent avec la salle. Si la salle n'est pas prête, l'image reste avec une fine barre de chargement en bas.
- **[à voir]** **Retour** (croix du titre, logo, menu « La collection ») : la salle est photographiée, la spirale se monte dessous, **centrée sur l'œuvre quittée** (ou la dernière salle visitée par le couloir) ; la photo se réduit jusqu'à la carte en se fondant dans l'image de l'œuvre (0,9 s), puis laisse voir la vraie carte. Le retour arrière du navigateur ramène aussi la spirale sur l'œuvre, sans animation.
- **[à voir]** **Préchargement** : une carte centrée depuis 1 s fait télécharger sa salle (code, modèles, lightmaps), une seule fois par œuvre.
- Molette et clavier sont ignorés pendant une transition ; un retour arrière du navigateur pendant une transition l'abandonne proprement.
- Mesuré en développement : entrée ≈ 2,3 s au total (dont ≈ 0,7 s d'attente de la salle, compilation des matières), retour ≈ 1,7 s (dont ≈ 0,5 s de montage de la spirale). Plus court attendu une fois en ligne (code compilé).
- Corrigé au passage : la spirale cherchait sa carte centrée avant son premier rendu (matrice de caméra pas à jour).

## 28/10/2026 — Claude Code (passation)

- `PASSATION.md` réécrite pour la prochaine étape, les transitions entre la spirale et les salles : état au 28/10, chemin actuel spirale ↔ salle, pistes et questions pour Ludovic, outils de vérification, pièges rencontrés. L'ancienne passation (26/10) était obsolète.

## 28/10/2026 — Claude Code (nouvelles vues de la salle)

- **[à voir]** Correction (retour de Ludovic) : en arrivant par « Œuvre précédente / suivante », on est maintenant emmené sur la **vue initiale**, la même qu'au chargement de la page (face à l'avant de l'œuvre, à 13 m), et non plus du côté de la porte ; quand on entre par l'autre côté, le trajet contourne l'œuvre à 13 m. Vérifié dans les deux sens.

- **[à voir]** **Vue d'arrivée** : en entrant dans une salle (par œuvre précédente ou suivante, ou au chargement), on s'arrête à 13 m de l'œuvre, tourné vers elle, côté porte d'arrivée (choix de Ludovic) ; toute l'œuvre de 10 m tient à l'écran ; la rotation automatique continue ; le texte SeuilHome est affiché (il le reste partout, choix de Ludovic). Le premier scroll mène sur le cercle de 9 m.
- **[à voir]** **Popup Maladie** : à 1,70 m, de face, en s'approchant de la grosse main. **Popup Manifeste** : à 1,70 m, en s'approchant, la caméra levée vers le visage. On en sort par la croix ou un clic à côté du popup (Échap aussi) ; le scroll ne les ferme plus. On revient alors sur le cercle de 9 m.
- **[à voir]** **Clic sur l'œuvre** depuis le cercle (ou la vue d'arrivée) : on s'en approche sur un cercle réduit de 5,5 m, où le scroll fait toujours tourner ; un nouveau clic sur l'œuvre ramène sur le cercle. Le curseur devient une main au survol de l'œuvre.
- Rayons réglables avec la touche M (« Navigation ») : vue d'arrivée, cercle, cercle réduit.

## 28/10/2026 — Claude Code (fluidité et propreté de la lumière)

- **[à voir]** Texture de la pierre précalculée : le bruit est lu dans une petite texture 32³ générée au démarrage (au lieu d'être calculé en entier pour chaque pixel), et les couches trop fines pour l'écran ne sont plus calculées. Dessin de la scène environ 2 × plus rapide (≈ 15 → 8 ms par image en 2742 × 2418) ; la texture ne coûte plus que ≈ 2 ms au lieu de ≈ 9. Même aspect : contraste du grain et du voile identiques, mesurés au même endroit avec l'ancienne et la nouvelle version.
- **[à voir]** Plafond sans taches : le grain que Ludovic voyait au plafond (curseurs de texture à 0) venait du calcul de lumière, pas de la pierre (plafond éclairé seulement par la lumière renvoyée, très bruitée à 96 échantillons, taches laissées par le débruitage). Recalcul à **768 échantillons** pour l'architecture et 256 pour le mobilier (`salle.py`, nouvel argument ; 37 min) : bruit restant ÷ 8, fichiers plus légers (3,0 → 2,6 Mo). Aucun effet sur la fluidité du site.

## 28/10/2026 — Claude Code (reflet et raccord des murs, retours de Ludovic)

- **[à voir]** Pendant le trajet, le reflet de l'œuvre de la salle d'arrivée n'apparaît plus sur le sol de la salle actuelle : chaque passe de reflet masque, le temps de son rendu, la sculpture de l'autre salle.
- **[à voir]** Plus de rupture entre le mur de la salle et le mur du couloir qui le prolonge (même chose pour le sol et le plafond) : au seuil, le couloir reprend la lumière précalculée de la salle au même endroit (lue dans sa lightmap), puis passe à la sienne sur 4 m (réglage « raccord avec la salle », touche M, « Couloir »).

## 28/10/2026 — Claude Code (couloirs et arrivée, retours de Ludovic)

- **[à voir]** Scintillement au bord des portes corrigé : des faces du sas de Blender et de la paroi à fentes se superposaient aux murs du couloir (elles sont maintenant masquées dès le plan de la porte, ou décalées de 5 mm). Les bords des bandes de soleil sont adoucis à la taille d'un pixel, pour éviter le scintillement au loin.
- **[à voir]** Couloir dans la même matière que la salle : mêmes couleurs de sol, de murs et de plafond, grain de la pierre continu au passage de la porte, coins assombris comme dans le précalcul, lumière diffuse plus chaude et plus faible près des portes (« lumière des portes » 0,03 → 0,012). Au raccord, mur de la salle et paroi du couloir ont presque la même teinte (mesurée à l'écran).
- **[à voir]** Plus de saut de lumière sur l'œuvre à l'arrivée. Chaque salle avait son soleil et sa lumière d'ambiance : pendant le passage, l'œuvre d'arrivée recevait l'ambiance des deux salles, qui retombait d'un coup à l'arrivée. Désormais, une seule ambiance pour toute la scène et deux soleils permanents (salle actuelle, salle d'arrivée). Mesuré : même rendu juste avant et juste après l'arrivée.
- **[à voir]** Caméra plus calme à l'entrée du couloir : le regard fixe le fond du couloir dès le départ, on s'aligne sur l'axe de la porte 6 m avant elle, et la vitesse est presque constante (au plus 1,25 × la moyenne, au lieu d'un pic de 1,5 × juste à l'entrée du couloir). Rotation du regard pendant l'approche : environ 20°/s, contre des pointes à 160°/s avant.

## 28/10/2026 — Claude Code (architecture des salles)

- **[à voir]** Salle agrandie de 25 % au sol : **30 × 30 m** (24 m avant), toujours 20 m sous plafond (choix de Ludovic : le sol seulement). La fente zénithale du mur ouest passe à 25 m. Lumière recalculée dans Blender (2048 px, 96 échantillons, 10 min).
- **[à voir]** **Deux portes** dans toutes les salles, une entrée (mur sud) et une sortie (mur nord), opposées, chacune **au bord droit de son mur** vu de l'intérieur, 4 m de large et **jusqu'au plafond** (20 m). « Œuvre suivante » sort par la sortie et entre par l'entrée de la salle suivante ; « Œuvre précédente » fait l'inverse (choix de Ludovic). Les couloirs ont la même hauteur que les portes ; les fentes montent à 16 m (réglable). Un couloir est visible derrière chaque porte.
- **[à voir]** « Le seuil des proportions » passe de **8 à 10 m**, agrandi proportionnellement (choix de Ludovic). Ombre dans la lightmap et occlusion de la sculpture recalculées. Comme toutes les œuvres partagent encore la même salle et la même sculpture, elle est agrandie partout.
- Mis à l'échelle de l'œuvre (×1,25) : les points de vue Face, Visage et Main et l'amplitude du regard (2,5 → 7,1 m). Bancs et rayon du cercle (9 m) inchangés, à revoir avec Ludovic.

## 28/10/2026 — Claude Code (transition entre salles)

- **[à voir]** « Œuvre précédente / suivante » : on passe par la porte. La caméra longe le cercle jusqu'en face de la porte, traverse un couloir de 14 m et entre dans la salle de l'œuvre, face à elle ; **8 s au maximum** (4 s au départ, allongé à la demande de Ludovic) (réglage « durée du passage », touche M). L'adresse et l'interface passent à la nouvelle œuvre à l'arrivée, sans rechargement ni écran de chargement. L'interface s'efface pendant le trajet.
- **[à voir]** Couloir dans la pénombre avec **fentes latérales** (références `references/couloir`, choix de Ludovic) : bandes de soleil rasantes sur le sol et la paroi d'en face, tranches des fentes allumées, léger rayonnement dans l'air, lueur des salles aux deux bouts. Calculé en direct, sans précalcul : tout se règle dans « Couloir » (touche M).
- Portes décrites en liste dans la config : passer à deux portes plus tard = ouvrir le mur dans Blender + une ligne de config.
- **[abandonné]** Pénombre de la porte (réglage « Porte ») : remplacée par le couloir ; l'ancien couloir précalculé est masqué.

## 28/10/2026 — Claude Code

- **[à voir]** Popup refait (Ludovic n'était pas satisfait de la première intégration) : **composant réutilisable** `src/ui/Popup.tsx` (`Popup`, `PopupEntete`, `PopupTexte`, `PopupChiffres`, `PopupLien`) pour toutes les salles.
  - Cotes du Figma retrouvées au pixel en 1680 × 1050 : grille de 5 colonnes de 288 px entre marges de 120 px, popup sur les 2 dernières (576 px), centré, marge intérieure 96 px, texte sur 384 px ; Maladie 576 × 726, Manifeste 576 × 625 ; blocs espacés de 24 px, texte à 35 px sous le grand titre, croix à 12 px du coin.
  - Écrans plus petits : la grille rétrécit, le texte garde 384 px tant que possible (1440 × 900 : identique au Figma, marges réduites) ; tout tient sans défiler jusqu'en 1280 × 800 ; au-delà, seul le contenu défile, la croix reste en place.
  - Clavier : focus sur la croix à l'ouverture, Échap ferme, le focus revient sur le lien.

## 27/10/2026 — Claude Code

- **[à voir]** Regard à la souris remis dans le sens direct : souris en haut = regard vers le haut (demande de Ludovic). Le doigt et les flèches ↑ ↓ ne changent pas.
- **[à voir]** Interface de la salle refaite d'après 3 nouveaux écrans Figma (445:275, 447:602, 448:911) :
  - premier écran à gauche, sans fond : titre, liens « Maladie › » et « Manifeste › », « Avec le soutien de » + **logo Recordati** (SVG récupéré du Figma), « Partager cette œuvre » ;
  - les liens ouvrent les **popups Maladie et Manifeste à droite** (fond sombre flouté, croix en haut à droite) ; la caméra va toujours sur la main ou le visage ; fermer le popup (ou scroller, Échap) ramène le premier écran et le tour libre ;
  - header : le bouton du milieu affiche le titre de l'œuvre avec une croix (retour à la collection) ;
  - **onglets du bas supprimés** (demande de Ludovic) ; restent œuvre précédente / suivante ;
  - textes et chiffres du Figma (description, manifeste, « 1/2 000 000 », « ACVR1 ») ; lien « En savoir plus » vers la fiche Orphanet de l'acromégalie ;
  - l'œuvre reste centrée avec le premier écran (comme dans le Figma) et se décale à gauche quand un popup est ouvert ;
  - écrans peu hauts (1200 × 750) : espacements resserrés, tout tient sans défiler ; mobile : premier écran et popups en bas.
- **[abandonné]** Panneau Info avec fond et croix, onglets Info / Maladie / Manifeste en bas (remplacés par le premier écran et ses popups).

## 27/10/2026 — Cowork (fin de soirée)

- **[à voir]** Spirale mise à jour avec sa **version finale** (dépôt GitHub enoludo/MMR, commit 0b9abe8, 11/09) : la copie locale de `~/MMR` avait 13 commits de retard. Apports : coins arrondis en vraie géométrie, tranche des cartes teintée de la couleur de l'œuvre, aimantation sur la carte centrée, glisser à la souris ou au doigt qui suit le point attrapé, flèches précédente / suivante en bas, icônes son et menu fournies par Ludovic (aussi utilisées dans le header des salles).

## 27/10/2026 — Cowork (après-midi et soir)

- **[vu]** Interface du Figma intégrée : header commun, « Retour à la collection », panneau Info / Maladie / Manifeste, onglets en bas, œuvre précédente / suivante, partage, écran de chargement avec le logo.
- **[vu]** Galerie spirale reprise comme page d'accueil ; « Découvrir » ouvre la salle de l'œuvre.
- **[vu]** Onglets liés à la caméra : Info = tour libre, Maladie = la main, Manifeste = le visage.
- **[vu]** Décentrage de l'image : l'œuvre reste au milieu de l'espace laissé libre par le panneau.
- **[vu]** Le panneau se ferme quand on scrolle pour revenir sur le cercle (demande de Ludovic).
- **[vu]** Croix du Figma sur le panneau ; elle disparaît quand le panneau est fermé (demande de Ludovic).
- **[à voir]** Police Google Sans Flex (version libre de Google Sans) et icônes Phosphor.
- **[à voir]** Mise en ligne : `vercel.json`, `.vercelignore`, `Mettre en ligne.command`. Premier essai échoué (la CLI avait pris tout le dossier MMR) ; corrigé, pas encore relancé.
- **[à voir]** Zip prêt à héberger ailleurs : `~/MMR/musee-site-a-heberger.zip` (avec `.htaccess`).
- Décision : passer le développement du code sur Claude Code (onglet Code de l'app). Cowork garde les calculs de lumière Blender, les modèles 3D et les documents. Création de `CLAUDE.md` et de ce journal.
- **[abandonné]** Les 3 boutons d'étapes et le popup de la maquette verticale (remplacés par les onglets).

## 27/10/2026 — Cowork (matin)

- **[abandonné]** Regard à la souris inversé (souris en haut = regard vers le bas) : remis dans le sens direct le 27/10 au soir.
- **[vu]** Amplitude du regard réduite de moitié (de 2 à 5,7 m de haut, au lieu de 0,3 à 8 m).
- **[validé]** Poussière : densité 1, taille 4, vitesse 3, brillance 0,95 (réglages de Ludovic).
- **[vu]** Porte plongée dans la pénombre (réglage « Porte » dans Leva).
- **[vu]** Lampe du couloir retirée et lumière recalculée : plus aucune source de lumière dans le passage.

## 26/10/2026 (nuit) – 27/10/2026 — Cowork

- **[vu]** Socle supprimé : statue posée au sol, enfoncée de 1,5 cm, ombre de contact et occlusion aux pieds.
- **[vu]** Reflet de la sculpture au sol, léger et progressif.
- **[vu]** Déplacement automatique lent sur le cercle (1°/s, dans le sens du dernier scroll).
- **[vu]** Lumière recalculée en haute résolution autour de l'œuvre.

## 26/10/2026 — Cowork

- **[validé]** Choix technique : Vite + React + React Three Fiber, salles modélisées dans Blender avec lumière précalculée, site statique sans back-end (note « Setup technique recommandé »).
- **[validé]** Maquette verticale d'une première salle (24 × 24 m, 20 m sous plafond, puits de lumière, fente zénithale, deux bancs) : **fluidité validée par Ludovic**.
- **[validé]** Navigation : boucle infinie sur un cercle de 9 m autour de l'œuvre, œil à 1,70 m, scroll pour avancer, glisser sur mobile.
- **[abandonné]** Navigation provisoire à 5 points de vue avec clic au sol (remplacée par le cercle).
- Prototype `proto-MMR` synchronisé avec la version en ligne, conservé comme référence.

## Avant le 26/10/2026 — Claude Code

- **[vu]** Galerie spirale interactive (racine de `~/MMR`, 27 commits) : ressort à rayon constant, flou de profondeur, couleur de fond selon la carte, titre animé lettre par lettre, header du Figma.
