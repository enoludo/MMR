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
    SpiralGallery.js          Scène Three.js, génération des slots, translation, resize
    spiralPath.js             La courbe elle-même : hélice à rayon constant + pas vertical
    textureTiers.js           Pré-calcule 3 niveaux de flou par image (Canvas2D)
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

### Une caméra plate, pas un profil de cône

La caméra est quasiment à hauteur d'œil, à peine inclinée
(`CONFIG.cameraHeight`, `CONFIG.cameraLookAtY`). Un point de vue en 3/4
plongeant révélerait le profil du ressort vu de côté ; vue presque de
face, la même hélice se lit comme des cartes qui glissent verticalement à
des profondeurs variées, pas comme une forme géométrique reconnaissable.

### Profondeur de champ (flou) sans passe de post-traitement

Plutôt qu'un vrai flou de profondeur de champ en temps réel (fragile selon
les GPU, coûteux — une première tentative avec un `BokehPass` Three.js
n'a produit aucun flou visible et ajoute un rendu de profondeur complet à
chaque frame), chaque image est pré-rendue une fois en 3 niveaux de flou
via Canvas2D (`textureTiers.js`, `ctx.filter = 'blur(...)'`). À chaque
frame, `SpiralGallery#update` calcule l'écart angulaire de chaque carte
par rapport à l'avant et bascule sa texture entre ces trois niveaux
(net / doux / flou) — fiable sur tous les appareils, coût négligeable.

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
correspondante est passée à `Overlay.setCard()`, qui ne déclenche un
crossfade GSAP (fade out → swap du contenu → fade in) que lorsque la carte
affichée change réellement — et tue proprement toute transition encore en
cours pour éviter qu'un changement rapide n'affiche un texte périmé.

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

- Les images placées dans `public/assets/images/` sont des SVG de
  substitution : remplacez-les par vos visuels définitifs (jpg/png/webp)
  en gardant les mêmes chemins déclarés dans `cards.json`, ou modifiez les
  chemins.
- Pour un bundle plus léger, [OGL](https://github.com/oframe/ogl) peut
  remplacer Three.js dans `SpiralGallery.js` sans impacter le reste de
  l'architecture (données, scroll virtuel, overlay).
