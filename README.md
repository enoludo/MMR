# Galerie Spirale Interactive — MMR

Galerie d'images en spirale, animée en 3D (Three.js), avec rotation pilotée
par un scroll virtuel infini et une auto-rotation lente en idle. Une carte
"centrée" affiche dynamiquement un titre + CTA en overlay HTML.

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
  nouvelles cartes viennent simplement s'intercaler le long de la spirale.
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
  config.js                   Toutes les constantes réglables (rayon, tours, vitesses…)
  style.css                   Styles de base de l'overlay et du canvas plein écran
  data/
    cards.json                Données des cartes (source de contenu)
  gallery/
    SpiralGallery.js          Scène Three.js, génération des slots, rotation, resize
    spiralPath.js             La courbe de la spirale elle-même (angle/rayon/hauteur en fonction de t)
    textureTiers.js           Pré-calcule 3 niveaux de flou par image (Canvas2D)
    VirtualScroll.js          Accumulation wheel/touch, progression non bornée, idle → auto-rotation
    centeredSlot.js           Calcul du slot le plus proche de l'angle "face caméra"
    Overlay.js                Overlay HTML + crossfade GSAP entre cartes
    placeholderTexture.js     Génère une texture de repli si une image est manquante
```

### Une vraie spirale à plusieurs tours

`spiralPath.js` définit la courbe : pour `t` dans `[0, 1)`, l'angle croît
continûment sur `CONFIG.spiralTurns` tours (2,5 par défaut) pendant que le
rayon et la hauteur croissent (ou décroissent) **de façon monotone** avec
`t` — un vrai escalier en colimaçon, pas un simple anneau à une seule
boucle. Avec plusieurs tours visibles à la fois, un même visuel apparaît à
plusieurs endroits (tailles/hauteurs différentes) pendant qu'il tourne,
comme sur la maquette de référence.

Une vraie spirale n'étant pas symétrique par rotation, elle ne peut pas
être animée comme un anneau rigide qu'on fait simplement tourner (ça
créerait une discontinuité visible à la jonction). À la place, chaque slot
garde une identité et un point de départ fixes (`baseOffset`) le long de
la courbe, mais sa position est recalculée à chaque frame à partir de
`(baseOffset + t_global) % 1` (voir `SpiralGallery#update`) : le slot
parcourt toute la spirale puis recommence, et son opacité/échelle
retombent à 0 juste avant/après ce point de recyclage
(`CONFIG.recycleFade`) pour que le saut soit invisible.

La plage de hauteur (`heightStart`/`heightEnd`) est volontairement modeste
par rapport au nombre de tours : un tour complet ne décale la hauteur que
de `(heightEnd - heightStart) / spiralTurns`, donc quel que soit le tour
qui se retrouve actuellement face caméra, il atterrit à une hauteur assez
proche des autres — c'est ce qui garde la carte centrée réellement centrée
à l'écran, tour après tour.

### Slots découplés des données

Le nombre d'emplacements visuels en 3D (`slots`, ex. 22 sur desktop) est
fixe et indépendant du nombre de cartes réelles dans `cards.json`. Le
contenu de chaque slot est déterminé par un modulo :

```js
const card = cardsData[slotIndex % cardsData.length];
```

Passer de 4 à ~20 cartes ne nécessite aucune modification du code 3D : le
modulo s'ajuste automatiquement. Le nombre de slots par palier responsive
se règle dans `config.js` (`CONFIG.slotCount`).

### Une caméra plate, pas un profil de cône

La caméra est quasiment à hauteur d'œil, à peine inclinée
(`CONFIG.cameraHeight`, `CONFIG.cameraLookAtY`). Un point de vue en 3/4
plongeant révélerait le profil de la spirale — un rayon qui grandit vu de
côté ressemble justement à un cône. Vue presque de face, cette même
variation de rayon se lit comme des cartes à des profondeurs/tailles
différentes, pas comme une forme géométrique reconnaissable.

### Profondeur de champ (flou) sans passe de post-traitement

Plutôt qu'un vrai flou de profondeur de champ en temps réel (fragile selon
les GPU, coûteux — une première tentative avec un `BokehPass` Three.js
n'a produit aucun flou visible et ajoute un rendu de profondeur complet à
chaque frame), chaque image est pré-rendue une fois en 3 niveaux de flou
via Canvas2D (`textureTiers.js`, `ctx.filter = 'blur(...)'`). À chaque
frame, `SpiralGallery#update` calcule l'écart angulaire de chaque carte
par rapport à l'avant de la spirale et bascule sa texture entre ces trois
niveaux (net / doux / flou) — fiable sur tous les appareils, coût
négligeable.

### Rotation : scroll virtuel infini + auto-rotation idle

La section contenant le canvas est fixe à l'écran (`position: fixed`) : il
n'y a aucun scroll de page réel, donc aucune dépendance à la hauteur du
document (`scrollHeight`, `window.scrollY`…), source de saccades dans
l'itération précédente.

- `VirtualScroll` écoute `wheel` (desktop) et `touchmove`/`touchstart`/
  `touchend` (mobile), et accumule le delta dans une variable **non
  bornée** (`virtualOffset`, en unités de progression sur la spirale, pas
  en radians).
- Chaque frame, `main.js` lisse cette valeur cible avec un lerp
  (`currentT += (target - currentT) * CONFIG.rotationLerp`) et l'utilise
  pour repositionner tous les slots (`gallery.update(currentT)`).
- Après ~1.5s sans interaction (`CONFIG.idleDelayMs`), une progression
  lente et constante reprend automatiquement, désactivée dès la prochaine
  interaction.
- La caméra n'a **aucun** state ni controls (pas d'orbit/pan/zoom) : seuls
  les slots sont animés.

### Carte centrée + overlay

À chaque frame, `getCenteredSlot` cherche, parmi les slots à l'écran et
pas en train de disparaître au point de recyclage, celui dont l'angle
courant est le plus proche de "face caméra" (0 mod 2π) — avec plusieurs
tours, plusieurs slots peuvent être proches de cet angle en même temps sur
des boucles différentes, à des hauteurs/tailles différentes ; un filtre
"à l'écran" (frustum caméra) élimine ceux qui seraient techniquement les
plus proches en angle mais actuellement hors champ. La carte correspondante
est passée à `Overlay.setCard()`, qui ne déclenche un crossfade GSAP (fade
out → swap du contenu → fade in) que lorsque la carte affichée change
réellement — et tue proprement toute transition encore en cours pour
éviter qu'un changement rapide n'affiche un texte périmé.

## Responsive

- Le nombre de slots (`CONFIG.slotCount`) varie par palier de largeur
  d'écran (`CONFIG.breakpoints`) pour éviter la surcharge visuelle sur
  mobile.
- Sur un écran étroit/portrait, la caméra est reculée le long de son propre
  axe de visée (voir `SpiralGallery#resize`) : le FOV d'une caméra
  perspective n'est vertical, donc sur un ratio étroit le FOV horizontal
  s'effondre et pousserait la spirale quasi entièrement hors champ sans
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
