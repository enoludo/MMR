# Galerie Spirale Interactive — MMR

Galerie d'images en spirale (un vrai ressort/hélice à rayon constant),
animée en 3D (Three.js), qui se translate verticalement au scroll avec une
auto-rotation lente en idle. Une carte "centrée" affiche dynamiquement un
titre + CTA en overlay HTML.

## Stack

- **Three.js** pour le rendu 3D.
- **GSAP** pour le crossfade du titre/CTA overlay.
- **Vite** comme bundler (JS pur, aucun framework front requis).

## Démarrer

```bash
npm install
npm run dev       # serveur de développement
npm run build     # build de production dans dist/
npm run preview   # sert le build de production localement
```

## Ajouter une carte

Toute la logique 3D est indépendante du nombre de cartes. Pour ajouter un
projet à la galerie, il suffit d'ajouter une entrée dans
[`src/data/cards.json`](./src/data/cards.json) :

```json
{
  "id": "proj-05",
  "image": "/assets/images/proj-05.jpg",
  "title": "Titre du projet",
  "cta": "Découvrir"
}
```

- Déposez l'image correspondante dans `public/assets/images/`.
- Aucune autre modification n'est nécessaire : le nombre d'emplacements 3D
  (slots) est fixe et indépendant du nombre de cartes (voir plus bas), les
  nouvelles cartes viennent simplement s'intercaler le long du ressort.
- Si une image référencée est manquante ou ne charge pas, un visuel de
  substitution (généré en canvas, avec le titre de la carte) s'affiche à sa
  place — la galerie ne casse jamais sur un asset manquant.
- Le bouton CTA ("Découvrir") ne pointe vers aucune page de projet : un clic
  recharge simplement la page courante (voir `Overlay.js`). Tant qu'il
  n'existe pas de vraies pages projet à lier, c'est plus sûr qu'un lien
  statique qui renverrait une 404.

Aucun redémarrage du serveur n'est nécessaire : `cards.json` est importé au
chargement de l'application.

## Architecture

```
index.html                    Overlay HTML (titre/CTA) + point de montage du canvas
src/
  main.js                     Bootstrap : boucle d'animation, câblage des modules
  config.js                   Toutes les constantes réglables (rayon, pas, vitesses…)
  style.css                   Styles de base de l'overlay et du canvas plein écran
  data/
    cards.json                Données des cartes (source de contenu)
  gallery/
    Header.js                 Câble le switch Spirale/Grille et le bouton mute (visuel seul)
    SpiralGallery.js          Scène Three.js, génération des slots, translation, resize
    spiralPath.js             La courbe elle-même : hélice à rayon constant + pas vertical
    cardTexture.js            Texture recadrée 16:9 par carte (Canvas2D)
    cardColor.js              Couleur moyenne d'une image : assombrie pour le fond, brute pour la tranche des cards
    BackgroundTint.js         Transition douce du fond vers la couleur de la carte centrée
    VirtualScroll.js          Accumulation wheel/touch, hauteur non bornée, idle → auto-scroll
    centeredSlot.js           Calcul du slot le plus proche du centre (hauteur ~ 0)
    Overlay.js                Overlay HTML + crossfade GSAP entre cartes
    placeholderTexture.js     Génère une texture de repli si une image est manquante
```

### Un vrai ressort à rayon constant

`spiralPath.js` définit la courbe comme une hélice classique (type ressort
ou fil de vis) : un **rayon unique** (`CONFIG.radius`), et un angle
directement dérivé de la hauteur via le pas du ressort
(`CONFIG.pitch`) :

```js
angle = (hauteur / pitch) * 2π
```

Cette relation vis/écrou est ce qui fait que le ressort semble se
translater verticalement au scroll plutôt que tourner sur place : décaler
la hauteur de chaque carte d'exactement un `pitch` revient exactement au
même agencement (chaque carte prend la place angulaire de sa voisine).
C'est aussi ce qui permet un scroll infini sans faire varier le rayon :
recycler une carte d'une extrémité du ressort à l'autre, `slotsPerTurn`
tours plus loin, est invisible — sa hauteur et son angle correspondent
déjà exactement à une carte voisine existante.

Le rayon étant **constant**, toutes les cartes sont espacées de façon
uniforme et prévisible (angulairement au sein d'un tour, verticalement
entre les tours) : c'est ce qui garantit qu'aucune carte ne se chevauche
ou ne se découpe jamais avec une autre, contrairement à une spirale à
rayon variable.

L'angle étant dérivé directement de la hauteur, une carte ne peut jamais
être "face caméra" à une hauteur différente de 0 : la carte la plus proche
de la caméra (angle ≈ 0) et celle dont la hauteur est la plus proche de 0
sont, par construction, exactement la même carte. Voir "Carte centrée"
plus bas.

### Slots découplés des données

Le nombre d'emplacements visuels en 3D (`slots`) est fixe et indépendant
du nombre de cartes réelles dans `cards.json`. Le contenu de chaque slot
est déterminé par un modulo :

```js
const card = cardsData[slotIndex % cardsData.length];
```

Passer de 4 à ~20 cartes ne nécessite aucune modification du code 3D : le
modulo s'ajuste automatiquement. Le nombre de slots (donc le nombre de
tours réellement instanciés, `CONFIG.slotsPerTurn * turns`) se règle dans
`config.js` (`getSlotCountForWidth`) ; seuls 2-3 tours sont jamais visibles
à l'écran, le reste sert de zone tampon pour que le point de recyclage
reste hors champ.

### Un léger roulis, dans le sens de la spirale

Chaque carte reçoit, en plus de sa rotation autour de l'axe de l'hélice
(`rotation.y = point.angle`), un roulis fixe autour de sa propre ligne de
mire (`rotation.z = CONFIG.cardTiltDeg`, ≤ 5°) — le même pour toutes les
cartes, dans le sens de rotation de l'hélice elle-même. Le ressort se lit
ainsi comme un ruban légèrement banké plutôt qu'un empilement de
rectangles parfaitement droits.

### La carte centrale grandit légèrement

En plus du flou/de la transparence en profondeur, la carte au premier plan
grossit jusqu'à `CONFIG.centeredScale` (1.2×) en entrant dans la zone
centrale, et revient à sa taille normale en la quittant —
`centeredScaleAt()` dans `SpiralGallery.js`, un `smoothstep` de l'écart
angulaire par rapport à l'avant, recalculé à chaque frame comme le flou et
l'opacité. C'est ce recalcul continu (plutôt qu'un tween GSAP déclenché au
changement de carte centrée) qui donne l'animation : comme l'angle de
chaque carte évolue en continu avec le scroll, la valeur de zoom suit
sans à-coup, sans état ni minuterie à gérer par carte. La zone de montée
(`centeredScaleAngleDeg`, 18°) fait la moitié du pas angulaire entre deux
cartes à `slotsPerTurn: 10` (36°), pour qu'une carte revienne pile à
l'échelle 1 au moment où sa voisine entame sa propre montée en échelle.
Ce facteur se multiplie à celui, déjà existant, du fondu de recyclage
plutôt que de le remplacer.

### Coins arrondis : une vraie géométrie, tranche comprise

Les cartes ne sont plus des `BoxGeometry` : leur forme est un rectangle
arrondi (`createRoundedCardShape` dans `SpiralGallery.js`, un `THREE.Shape`
tracé avec `.absarc()` à chaque coin) extrudé sur l'épaisseur `CARD_DEPTH`
via `THREE.ExtrudeGeometry` (`buildCardGeometry`). L'arrondi est donc un
rayon de géométrie réel, pas un masque de transparence calculé après coup
dans le shader — une première version faisait ça (une SDF de rectangle
arrondi qui `discard`ait l'alpha aux coins), mais un masque plat appliqué
à une tranche restée un prisme à angles droits ne peut que couper cette
tranche au ras de l'arrondi ; il ne peut pas la faire suivre la courbe.
Extruder la forme arrondie donne au contraire à *chaque* face — avant,
arrière, et les faces de tranche entre les deux — le même arc de cercle à
chaque coin : la tranche épouse littéralement la courbe plutôt que d'être
tranchée dedans.

`ExtrudeGeometry` regroupe les faces générées en deux groupes de matériau :
le groupe 0 ("lid", les capuchons avant+arrière) et le groupe 1 (les faces
de tranche extrudées). Le mesh n'utilise donc plus que deux matériaux
(`faceMaterial`, `edgeMaterial`) au lieu des trois d'avant (front/back/edge
séparés) — une simplification directe, puisque l'avant et l'arrière ont
toujours affiché exactement la même texture avec le même flou/opacité (voir
`#update`). L'UV par défaut d'`ExtrudeGeometry` renvoie des coordonnées
locales brutes, pas normalisées 0..1 ; `createCardUVGenerator` les
renormalise contre la largeur/hauteur de la carte pour que `vUv` se
comporte comme sur un plan ou une boîte, ce dont le shader de flou
dépend.

`CONFIG.cardCornerRadius` est calibré pour lire comme ~8px sur la carte de
premier plan à une largeur d'écran desktop courante — il n'existe pas de
correspondance px→unité-monde unique dans une scène 3D en perspective,
donc c'est un réglage approximatif, pas une valeur exacte à toutes les
tailles d'écran.

### Une caméra plate, pas un profil de cône

La caméra est quasiment à hauteur d'œil, à peine inclinée
(`CONFIG.cameraHeight`, `CONFIG.cameraLookAtY`). Un point de vue en 3/4
plongeant révélerait le profil du ressort vu de côté ; vue presque de
face, la même hélice se lit comme des cartes qui glissent verticalement à
des profondeurs variées, pas comme une forme géométrique reconnaissable.

### Profondeur de champ : un flou continu, pas des paliers

Une première version pré-rendait chaque image en 3 niveaux de flou fixes
(net / doux / flou) et basculait entre eux selon l'angle — visuellement, ça
se voyait comme un "saut" net → flou plutôt qu'une transition. La version
actuelle calcule le flou en direct, dans le shader du matériau de chaque
face de carte (`createCardFaceMaterial` dans `SpiralGallery.js`) : un hook
`onBeforeCompile` remplace le simple `texture2D(map, uv)` du matériau
standard par une moyenne pondérée de 25 échantillons (3 anneaux) autour de
ce point, dont le rayon (`uBlur`, en texels) est un uniform mis à jour à
chaque frame — en continu, pas en paliers.

Ce rayon est dérivé de l'écart angulaire de la carte par rapport à l'avant,
via une interpolation "smoothstep" entre `CONFIG.blurStartDeg` (encore net)
et `CONFIG.blurFullDeg` (flou maximal, `CONFIG.maxBlurTexels`) : à
`uBlur == 0`, les 25 échantillons tombent tous sur le même texel, donc
c'est visuellement identique à l'absence de flou — la transition du net au
flou est donc un vrai dégradé continu, pas un changement brusque de
texture. C'est plus cher qu'un flou pré-calculé (25 lectures de texture par
pixel au lieu d'une), mais reste largement dans le budget pour la
cinquantaine de cartes affichées, sans le rendu de profondeur complet
qu'aurait nécessité un vrai `BokehPass` (tenté puis abandonné : aucun flou
visible dans nos tests).

### Transparence en profondeur

En plus du flou, chaque carte devient progressivement transparente à mesure
qu'elle s'éloigne de l'avant : opacité 100 % à l'angle 0 (face caméra),
dégradée linéairement jusqu'à 10 % à 180° (au plus loin, à l'arrière du
ressort) — voir `CONFIG.frontOpacity`/`CONFIG.backOpacity` et
`SpiralGallery#update`. Ce fondu de profondeur se combine (par
multiplication) avec le fondu de recyclage déjà existant, mais les deux
restent des concepts distincts : `getCenteredSlot` doit continuer à
détecter la carte centrée même quand elle n'est pas encore face caméra à
pleine opacité, donc il se base sur `slot.recycleFade` plutôt que sur
l'opacité réelle du matériau.

### Un fond qui prend la couleur de la carte centrée

Le fond de la page (`document.body`) se teinte de la couleur moyenne de la
carte actuellement centrée, avec une transition douce (GSAP, ~1.2s) à
chaque changement de carte :

- `cardColor.js#extractMoodColor` échantillonne l'image (redimensionnée en
  8×8 px, suffisant pour une moyenne) au moment où sa texture se charge, et
  convertit la couleur moyenne obtenue en HSL pour n'en garder que la
  teinte : la luminosité est bornée à une plage sombre fixe (8–16 %) et la
  saturation plafonnée, afin que le texte clair de l'overlay reste toujours
  lisible quelle que soit la photo — un mur de musée blanc et lumineux ne
  fait donc pas passer le fond au blanc, mais donne un fond sombre légèrement
  teinté de sa dominante de couleur.
- `SpiralGallery` mémorise cette couleur par carte dans `cardColors` (une
  `Map` de `card.id` vers `{r, g, b}`), calculée une seule fois par carte
  même si elle apparaît dans plusieurs slots.
- `BackgroundTint` (câblé dans `main.js`, aux côtés d'`Overlay`) déclenche
  la transition dès que la carte centrée change — sur le même événement
  que le crossfade du titre — mais seulement si sa couleur est déjà connue :
  si l'image est encore en cours de chargement, l'appel est silencieusement
  réessayé à la frame suivante plutôt que d'être perdu.

### La tranche prend la couleur de sa propre carte

La tranche (`edgeMaterial`, voir la section sur les coins arrondis) n'est pas
d'une couleur unique partagée par toutes les cartes : elle prend la couleur
moyenne — brute, non assombrie — de sa propre carte, pour qu'elle se lise
comme "la tranche de cette œuvre" plutôt que comme un cadre neutre autour.

- `cardColor.js#extractAverageColor` réutilise le même échantillonnage 8×8
  px qu'`extractMoodColor` (factorisé dans `sampleAverageRGB`), mais sans
  passer par sa conversion HSL assombrissante : c'est la vraie couleur
  moyenne de l'image, pas la teinte de fond.
- Comme pour `cardColors`, `SpiralGallery` la mémorise une seule fois par
  carte dans `cardEdgeColors`, puis l'applique à chaque slot affichant cette
  carte (`applyEdgeColor`) — chaque slot a sa propre instance d'`edgeMaterial`
  même quand plusieurs partagent la même carte.
- Point d'attention Three.js : `Color#setRGB` interprète par défaut ses
  arguments comme déjà dans l'espace linéaire de travail, pas en sRGB — or
  les pixels lus sur un canvas (ou une couleur hex classique) sont en sRGB.
  Sans préciser `THREE.SRGBColorSpace` en 4ᵉ argument, la couleur ressort
  visiblement délavée/éclaircie après la conversion linéaire→sRGB
  d'affichage de Three.js.
- La couleur moyenne brute était trop discrète face à la face avant, bien
  plus lumineuse (texture nette contre tranche unie) : `CONFIG.cardEdgeLighten`
  (0.3) éclaircit chaque canal en le mélangeant vers le blanc
  (`lightenChannel` dans `SpiralGallery.js`) avant application, pour que la
  tranche reste identifiable comme "la couleur de cette carte" tout en étant
  bien visible.

### On voit le dos des cartes

Chaque carte a une véritable épaisseur (pas un simple plan à une face) : le
groupe "lid" de la géométrie (avant + arrière, voir la section sur les
coins arrondis ci-dessus) partage un seul `faceMaterial` texturé avec
l'image de la carte, et la tranche utilise un `edgeMaterial` neutre séparé.
Une carte qui continue de tourner au-delà de la position "face caméra"
reste donc visible en s'éloignant vers l'arrière, texturée comme l'avant,
plutôt que de disparaître ou de montrer un dos neutre.

### Translation verticale : scroll virtuel infini + auto-scroll idle

La section contenant le canvas est fixe à l'écran (`position: fixed`) : il
n'y a aucun scroll de page réel, donc aucune dépendance à la hauteur du
document (`scrollHeight`, `window.scrollY`…), source de saccades dans
l'itération précédente.

- `VirtualScroll` écoute deux entrées indépendantes, qui accumulent toutes
  les deux dans la même variable **non bornée** (`virtualOffset`, en unités
  de hauteur — les mêmes unités que `CONFIG.pitch` — pas en radians) :
  `wheel` (molette/trackpad), et un drag horizontal (clic-glisser à la
  souris ou glissement tactile) géré via la Pointer Events API
  (`pointerdown`/`pointermove`/`pointerup`), qui traite les deux de façon
  identique — glisser vers la gauche fait avancer la spirale, dans le même
  sens qu'un scroll vers le bas.
- Le drag est écouté sur le conteneur du canvas (`dragTarget`), pas sur
  `window` : un clic sur le header ou le CTA (hors de ce conteneur dans le
  DOM) ne déclenche donc jamais de drag, et leurs propres gestionnaires de
  clic restent intacts. `pointermove`/`pointerup` sont eux écoutés sur
  `window` pour continuer à suivre le pointeur même s'il sort du canvas en
  cours de glissement.
- Un drag ne fait pas avancer `virtualOffset` à un taux fixe et
  déconnecté : au `pointerdown`, `SpiralGallery#pickDragAnchor` lance un
  rayon (`THREE.Raycaster`) depuis le point cliqué et, s'il touche une
  carte, retient le point exact touché en coordonnées locales à cette
  carte — un coin comme un autre point. À chaque `pointermove`,
  `VirtualScroll#dragUnitsPerPixel` estime numériquement (deux évaluations
  de `SpiralGallery#anchorScreenX`, de part et d'autre de `virtualOffset`
  actuel) la vitesse à l'écran de CE point précis, dans SON état courant
  (position, angle, tilt, échelle) — pas juste celle du centre de la carte —
  et en déduit le déplacement de `virtualOffset` qui garde ce point sous le
  curseur. Comme cette vitesse est recalculée à chaque mouvement plutôt que
  figée au clic, le suivi reste correct sur toute la durée du geste, même
  quand la carte tourne/grossit en approchant du centre. `CONFIG.dragSensitivity`
  ne sert plus que de repli, quand le drag démarre sur du vide (aucune carte
  sous le curseur).
- Chaque frame, `main.js` lisse cette valeur cible avec un lerp
  (`currentScrollY += (target - currentScrollY) * CONFIG.rotationLerp`) et
  l'utilise pour translater tous les slots (`gallery.update(currentScrollY)`).
- Après ~1.5s sans interaction (`CONFIG.idleDelayMs`), une translation
  lente et constante reprend automatiquement, désactivée dès la prochaine
  interaction.
- La caméra n'a **aucun** state ni controls (pas d'orbit/pan/zoom) : seuls
  les slots sont animés.

### Magnétisme : toujours retomber sur une carte centrée

Sans correction, `virtualOffset` s'arrête exactement où le dernier delta
(molette, trackpad, ou drag relâché) l'a laissé — souvent entre deux cartes,
puisqu'un notch de souris, la traîne d'inertie d'un trackpad, ou la position
du pointeur au relâchement d'un drag ne tombent presque jamais pile sur un
multiple exact du pas entre cartes.

- Les cartes sont espacées d'exactement `CONFIG.pitch / CONFIG.slotsPerTurn`
  en hauteur-monde (la même relation qui définit `baseHeight` dans
  `SpiralGallery#buildSlots`) : "la carte la plus proche" revient donc à
  arrondir `virtualOffset` au multiple le plus proche de ce pas
  (`VirtualScroll#snapToNearestCard`).
- Ce recalage est débounced (`CONFIG.snapDebounceMs`, 180ms) sur les
  événements `wheel` et `pointerup` : il ne se déclenche qu'une fois l'entrée
  réellement silencieuse — pas à chaque tick de molette — pour laisser un
  scroll rapide ou l'inertie d'un trackpad se terminer avant de corriger.
  Volontairement bien plus court que `idleDelayMs` (1.5s, qui régit la
  reprise de l'auto-rotation) : le magnétisme doit se sentir immédiat au
  relâchement, pas attendu.
- Délibérément jamais programmé depuis `pointermove` lui-même : tant que le
  bouton/doigt reste appuyé, une pause en cours de geste ne doit jamais faire
  bondir la carte hors de la main qui la tient encore — seul `pointerup`
  (relâchement réel) programme le recalage. Un bug précis a d'ailleurs été
  corrigé ici pendant le développement : `scheduleSnap` était encore appelé
  depuis `onPointerMove`, et un simple temps mort de plus de 180ms pendant un
  drag maintenu (souris immobile, bouton toujours enfoncé) suffisait à faire
  recentrer brutalement `virtualOffset` sous le curseur, en plein milieu du
  geste.
- `virtualOffset` saute directement à la valeur recalée — il n'y a pas de
  tween dédié pour l'animation visuelle du recalage : le lerp déjà en place
  (`CONFIG.rotationLerp`, voir ci-dessus) rattrape `currentScrollY` vers
  cette nouvelle cible, ce qui suffit à donner l'impression d'un
  magnétisme qui ramène la carte en douceur plutôt que de couper
  brutalement dessus.

### Carte centrée + overlay

À chaque frame, `getCenteredSlot` cherche, parmi les slots à l'écran et
pas en train de disparaître au point de recyclage, celui dont la hauteur
est la plus proche de 0 (le niveau de la caméra) — et donc, grâce à la
relation angle/hauteur, celui qui fait aussi face à la caméra. La carte
correspondante est passée à `Overlay.setCard()`, qui ne déclenche une
transition GSAP que lorsque la carte affichée change réellement — et tue
proprement toute transition encore en cours pour éviter qu'un changement
rapide n'affiche un texte périmé.

La sortie est un simple fondu en alpha (0.25s) pour le titre et le bouton
— celui du bouton translate aussi légèrement vers le haut (`y: 0 → -10`)
en disparaissant. L'entrée diffère entre les deux :

- Le **bouton** fait le même glissement en sens inverse, du bas vers le
  haut (`y: 12 → 0`, 0.4s, `power2.out`) — toujours construit avec
  `fromTo()` plutôt que `to()`, pour repartir explicitement de `y: 12` à
  chaque carte. Avec un simple `to()`, l'entrée hérite implicitement de
  la position où la sortie a laissé le bouton (`y: -10`) : seule la
  toute première carte serait correcte, tandis que chaque changement
  suivant ferait glisser le bouton vers le **bas** au lieu du haut.
- Le **titre** est découpé en caractères via `SplitText` (`gsap/SplitText`,
  `type: 'words, chars'`, `mask: 'chars'`) : chaque lettre se retrouve dans
  son propre wrapper `overflow: clip` (`.char-mask`, généré automatiquement,
  stylé dans `style.css`) et remonte depuis `yPercent: 130` jusqu'à `0`
  (`power4.out`, 0.4s par lettre) avec un `stagger` court (0.012s) —
  chaque lettre démarre bien avant que la précédente ait fini, d'où
  l'effet de cascade ; `power4.out` accentue nettement le ralentissement
  en fin de course par rapport à un ease plus doux comme `sine.out`. La
  visibilité vient du masque, pas de l'opacité : la lettre apparaît nette
  dès qu'elle dépasse le bord du masque plutôt que de se fondre en place.
  Comme le texte change à chaque carte, l'ancien découpage est révoqué
  (`split.revert()`) **avant** d'écraser le `textContent` — dans l'autre
  sens, `SplitText` se retrouve à manipuler des nœuds déjà détachés du
  DOM et échoue silencieusement, ce qui bloquait net toute mise à jour du
  titre.

Le titre passe sur plusieurs lignes dès qu'il dépasserait 60 % de la
largeur de l'écran (`max-width: 60vw` sur `.gallery-card-title`,
`text-wrap: balance` pour équilibrer les lignes). Le `type` de `SplitText`
inclut `'words'` en plus de `'chars'` pour ça précisément : chaque
caractère masqué est un `inline-block` atomique (nécessaire pour le
translater/masquer indépendamment), et un `inline-block` est de fait une
opportunité de saut de ligne à lui seul — sans un wrapper au niveau du
mot pour regrouper ses lettres, le navigateur coupait au milieu d'un mot
dès que le titre passait à la ligne (`"L'ÉROSION S" / "ILENCIEUSE"`,
observé avec `type: 'chars'` seul). Le mot n'est pas masqué (seul `'chars'`
est passé à `mask`) : il sert uniquement à empêcher la coupure, chaque
lettre à l'intérieur garde son propre masque et son animation individuelle.

Deux points d'attention CSS/animation, tous deux liés au même `.char-mask`
(voir plus bas) :

- Sa hauteur épouse exactement la `line-height: 0.8` (volontairement
  serrée) du titre, ce qui rognerait les accents et le haut/bas des
  majuscules une fois masqué. Le correctif ajoute du `padding-block`
  (haut/bas asymétrique, les accents débordant plus par le haut) compensé
  par un `margin-block` négatif identique sur le **même élément** — le
  `padding` élargit la zone de clip du masque (qui épouse sa propre
  boîte), le `margin` ramène ensuite tout l'ensemble à sa position
  d'origine sans toucher à l'interligne du titre. Cette compensation doit
  se faire sur l'élément qui porte réellement le `overflow`, pas sur un
  parent : une tentative précédente appliquait le `padding`/`margin` sur
  un wrapper englobant le `<h2>`, où `em` se résolvait contre la taille
  de police du wrapper (16px par défaut) et non celle, bien plus grande,
  du titre — un buffer de 2px au lieu d'environ 20px, donc un correctif
  sans effet perceptible.
- Ce même `padding-block` a un effet de bord sur l'animation : une fois
  la boîte du masque agrandie, `yPercent: 100` (exactement la hauteur de
  la lettre elle-même) ne suffit plus à la faire sortir entièrement de la
  zone visible — son sommet reste visible, "coupé" par le bord du masque,
  tant que l'animation n'a pas démarré. Mesuré sur un titre réel (police
  96px) : caractère de 76.8px de haut (`line-height: 0.8`), masque
  paddé de 24px en haut / 14.4px en bas — sortir entièrement demande donc
  un déplacement de 24+76.8+14.4−24 = 91.2px, soit ~118.75 % de la
  hauteur du caractère, pas 100 %. Un premier correctif à `yPercent: 120`
  ne laissait qu'une marge d'environ 1px, invisible en théorie mais
  mangée en pratique par l'arrondi/l'antialiasing — d'où un sommet de
  lettre encore visible par instants. `yPercent: 130` donne une vraie
  marge (~8-9px à cette taille) plutôt qu'une valeur pile au seuil.

Le titre et le bouton reprennent les valeurs exactes de la maquette Figma
(node `52:116`) : titre en Marquez normal, jusqu'à 96px (`clamp()` pour
rester lisible en dessous), `line-height: 0.8` ; bouton plein blanc,
texte noir en `Google_Sans:Medium` 14px, sans flèche (la maquette n'en a
pas — supprimée de `index.html` par rapport à la version précédente).

## Header (depuis la maquette Figma)

`#gallery-header` (dans `index.html`, stylé dans `style.css`) reproduit le
header du fichier Figma "MMR" (node `52:153`) : logo à gauche, switch
Spirale/Grille centré, boutons mute + menu à droite — en `position: fixed`,
avec un inset de 24px (12px en dessous de 640px), au-dessus du canvas.

- Le switch et les deux boutons ronds sont fidèles aux valeurs exactes de la
  maquette (tailles, `border-radius`, `backdrop-filter: blur(15px)`,
  opacités `rgba(255,255,255,0.1)`/`0.2`, police du switch = `--button-font`
  déjà en place pour le CTA). Le switch Spirale/Grille bascule visuellement
  au clic (`Header.js`) — il n'y a pas encore de vraie vue "Grille" à
  afficher, donc cliquer dessus ne fait pour l'instant que changer l'onglet
  actif. Le bouton mute bascule pareillement entre deux icônes (haut-parleur
  / haut-parleur barré) sans qu'il y ait de son à couper dans l'app pour
  l'instant.
- Comme pour le titre/CTA, le header entier ignore les événements pointeur
  (`pointer-events: none`) sauf ses éléments réellement interactifs, pour ne
  jamais bloquer le scroll virtuel en dessous.
- **Logo** : le connecteur Figma peut lire la structure du fichier
  (mesures, couleurs, texte) via son API, mais le téléchargement direct de
  l'asset exporté est bloqué par la politique réseau de cet environnement
  (requête HTTP directe vers `figma.com`) — le vrai logo
  (`public/assets/logo-mmr.png`, "Musée des Maladies Rares" en script rouge)
  a donc été fourni directement par l'utilisateur plutôt qu'exporté depuis
  Figma, comme pour la police Marquez. Il est affiché sans fond, à
  l'identique de la maquette (`.header-logo-img` dans `style.css`) — à
  32px de haut, ses traits fins sont volontairement fidèles à la maquette,
  même si ça le rend peu lisible sur un fond très chargé.
- Les icônes (menu burger, haut-parleur activé/coupé) sont les tracés SVG
  exacts de la maquette ("Streamline Phosphor"), fournis directement par
  l'utilisateur plutôt qu'exportés de Figma — même blocage réseau que le
  logo. Chaque `<path>` est inline dans `index.html`, `fill="currentColor"`
  pour suivre la couleur du bouton.

## Navigation flèches (depuis la maquette Figma)

`.gallery-slider-controls` (dans `index.html`) reproduit le bloc
"SliderControls" du fichier Figma (node `240:1798`) : deux boutons ronds à
flèche, centrés en bas de l'écran avec un inset de 24px (12px en dessous de
640px) — le même traitement "pilule verre" que les boutons du header,
directement réutilisé via `.header-icon-btn` plutôt que dupliqué.

- Un clic sur la flèche gauche/droite fait avancer la spirale d'exactement
  une carte (`VirtualScroll#stepToAdjacentCard`, câblé dans
  `SliderControls.js`) — "gauche" et "droite" sont pris au sens littéral,
  spatial : la flèche gauche amène au centre la carte actuellement affichée
  à gauche, la droite celle actuellement à droite. Comme pour le magnétisme,
  `virtualOffset` saute directement à sa nouvelle valeur et c'est le lerp
  déjà en place (`CONFIG.rotationLerp`) qui anime la transition visuelle —
  aucun tween dédié.
- Cette correspondance gauche/droite découle directement de la même
  relation angle/hauteur qui régit tout le reste de la spirale : augmenter
  `virtualOffset` d'un pas fait apparaître au centre la carte qui se
  trouvait juste avant à `baseHeight + pas`, laquelle est aussi celle qui
  projette à x > 0 (donc visuellement à droite) juste avant le clic — c'est
  exactement le même sens qu'un drag vers la gauche (voir plus haut) ou un
  scroll vers le bas — une seule convention "avancer" cohérente pour toute
  entrée.
- Un seul asset SVG (flèche pointant à gauche, fourni par l'utilisateur)
  sert aux deux boutons : le bouton droit applique juste
  `transform: scaleX(-1)` (`.slider-arrow-icon--next`) — même logique que
  la maquette Figma, qui réutilise elle aussi un unique glyphe "Caret" reflété
  plutôt que deux assets distincts.

## Responsive

- Le nombre de slots varie par palier de largeur d'écran
  (`CONFIG.breakpoints`, voir `getSlotCountForWidth`) pour éviter la
  surcharge visuelle sur mobile.
- Sur un écran étroit/portrait, la caméra est reculée le long de son propre
  axe de visée (voir `SpiralGallery#resize`) : le FOV d'une caméra
  perspective n'est vertical, donc sur un ratio étroit le FOV horizontal
  s'effondre et pousserait le ressort quasi entièrement hors champ sans
  cette compensation.
- Le canvas et les slots ne sont recalculés que sur l'événement `resize`
  (débouncé via `requestAnimationFrame`), jamais à chaque frame de la
  boucle de rendu.
- Le scroll virtuel gère un drag/slide horizontal (Pointer Events, souris
  et tactile confondus) en complément de `wheel`, pour un comportement
  équivalent quel que soit l'input.

## Notes

- Le titre de la carte centrée utilise la police **Marquez**
  (`public/fonts/Marquez.otf`, chargée via `@font-face` dans `style.css`),
  en majuscules (`text-transform: uppercase`). Le bouton "Découvrir"
  utilise **Google Sans** — une police interne à Google, non distribuable
  comme webfont : elle n'est déclarée qu'en premier choix de la pile
  (`--button-font`) pour les visiteurs qui l'ont déjà installée localement
  (certains appareils ChromeOS/Android), avec **Roboto** (chargée depuis
  Google Fonts dans `index.html`) comme repli visible par tout le monde
  d'autre. Si la vraie police Google Sans doit être utilisée telle quelle,
  il faudra fournir son fichier (comme pour Marquez) pour l'intégrer via
  `@font-face`.
- Les photos dans `public/assets/images/` sont recadrées (jamais
  déformées) au format 16:9 des cartes, quel que soit leur ratio d'origine
  — voir `cardTexture.js#coverRect`, qui reproduit un `object-fit: cover`
  en Canvas2D.
- Pour un bundle plus léger, [OGL](https://github.com/oframe/ogl) peut
  remplacer Three.js dans `SpiralGallery.js` sans impacter le reste de
  l'architecture (données, scroll virtuel, overlay).
