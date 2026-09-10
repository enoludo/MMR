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
  "cta": "Découvrir",
  "link": "/projets/proj-05"
}
```

- Déposez l'image correspondante dans `public/assets/images/`.
- Aucune autre modification n'est nécessaire : le nombre d'emplacements 3D
  (slots) est fixe et indépendant du nombre de cartes (voir plus bas), les
  nouvelles cartes viennent simplement s'intercaler le long du ressort.
- Si une image référencée est manquante ou ne charge pas, un visuel de
  substitution (généré en canvas, avec le titre de la carte) s'affiche à sa
  place — la galerie ne casse jamais sur un asset manquant.

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
    cardColor.js              Couleur moyenne (assombrie) d'une image, pour le fond
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

### Coins arrondis, sans changer la géométrie

Les cartes sont des boîtes fines (voir plus bas) : plutôt que de générer une
géométrie de boîte à coins arrondis (le bevel serait de toute façon écrasé
par l'épaisseur `CARD_DEPTH`, bien plus fine que le rayon voulu), l'arrondi
est un masque de transparence calculé dans le shader des faces avant/arrière
(`createCardFaceMaterial` dans `SpiralGallery.js`) : une SDF de rectangle
arrondi en unités-monde (pas en UV brut, pour que l'arrondi reste un vrai
arc de cercle même sur une carte non carrée) découpe l'alpha aux quatre
coins, avec un `discard` sous ce seuil pour ne pas laisser un coin
transparent écrire de la profondeur et occulter une carte derrière.
`CONFIG.cardCornerRadius` est calibré pour lire comme ~16px sur la carte de
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

### On voit le dos des cartes

Chaque carte est une boîte fine (pas un simple plan à une face) : la face
avant porte la texture de l'image, la face arrière et les tranches
utilisent des matériaux neutres partagés. Une carte qui continue de
tourner au-delà de la position "face caméra" reste donc visible en
s'éloignant vers l'arrière, dos tourné vers le spectateur, plutôt que de
disparaître.

### Translation verticale : scroll virtuel infini + auto-scroll idle

La section contenant le canvas est fixe à l'écran (`position: fixed`) : il
n'y a aucun scroll de page réel, donc aucune dépendance à la hauteur du
document (`scrollHeight`, `window.scrollY`…), source de saccades dans
l'itération précédente.

- `VirtualScroll` écoute `wheel` (desktop) et `touchmove`/`touchstart`/
  `touchend` (mobile), et accumule le delta dans une variable **non
  bornée** (`virtualOffset`, en unités de hauteur — les mêmes unités que
  `CONFIG.pitch` — pas en radians).
- Chaque frame, `main.js` lisse cette valeur cible avec un lerp
  (`currentScrollY += (target - currentScrollY) * CONFIG.rotationLerp`) et
  l'utilise pour translater tous les slots (`gallery.update(currentScrollY)`).
- Après ~1.5s sans interaction (`CONFIG.idleDelayMs`), une translation
  lente et constante reprend automatiquement, désactivée dès la prochaine
  interaction.
- La caméra n'a **aucun** state ni controls (pas d'orbit/pan/zoom) : seuls
  les slots sont animés.

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
  option `mask: 'chars'`) : chaque lettre se retrouve dans son propre
  wrapper `overflow: clip` (`.char-mask`, généré automatiquement, stylé
  dans `style.css`) et remonte depuis `yPercent: 120` jusqu'à `0`
  (`sine.out`, 0.5s par lettre) avec un `stagger` court (0.012s) — chaque
  lettre démarre bien avant que la précédente ait fini, d'où l'effet de
  cascade. La visibilité vient du masque, pas de l'opacité : la lettre
  apparaît nette dès qu'elle dépasse le bord du masque plutôt que de se
  fondre en place. Comme le texte change à chaque carte, l'ancien
  découpage est révoqué (`split.revert()`) **avant** d'écraser le
  `textContent` — dans l'autre sens, `SplitText` se retrouve à
  manipuler des nœuds déjà détachés du DOM et échoue silencieusement,
  ce qui bloquait net toute mise à jour du titre.

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
  tant que l'animation n'a pas démarré. Le point de départ est donc
  `yPercent: 120`, qui compense la marge ajoutée en bas du masque.

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
- Les icônes (menu burger, haut-parleur) sont redessinées à la main en SVG
  inline plutôt qu'exportées de Figma (même blocage réseau que le logo) —
  ce sont des formes génériques standard, pas un tracé exact de l'icône
  "Streamline Phosphor" utilisée dans la maquette.

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
- Le scroll virtuel gère `touchmove` en complément de `wheel` pour un
  comportement tactile équivalent.

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
