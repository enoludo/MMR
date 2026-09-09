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
  nouvelles cartes viennent simplement s'intercaler dans la rotation.
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
  config.js                   Toutes les constantes réglables (rayon, vitesses, seuils responsive…)
  style.css                   Styles de base de l'overlay et du canvas plein écran
  data/
    cards.json                Données des cartes (source de contenu)
  gallery/
    SpiralGallery.js          Scène Three.js, génération des slots, textures, resize
    VirtualScroll.js          Accumulation wheel/touch, valeur de rotation non bornée, idle → auto-rotation
    centeredSlot.js           Calcul du slot le plus proche de l'angle "face caméra"
    Overlay.js                Overlay HTML + crossfade GSAP entre cartes
    placeholderTexture.js     Génère une texture de repli si une image est manquante
```

### Slots découplés des données

Le nombre d'emplacements visuels en 3D (`slots`, ex. 12 sur desktop) est
fixe et indépendant du nombre de cartes réelles dans `cards.json`. Le
contenu de chaque slot est déterminé par un modulo :

```js
const card = cardsData[slotIndex % cardsData.length];
```

Avec 4 cartes et 12 slots, chaque carte apparaît 3 fois autour de la
spirale. Passer à ~20 cartes ne nécessite aucune modification du code 3D :
le modulo s'ajuste automatiquement (chaque carte peut alors n'apparaître
qu'une seule fois si on porte le nombre de slots à 20, ou continuer de
tourner avec 12 slots en faisant défiler toutes les cartes dans le temps).
Le nombre de slots par palier responsive se règle dans `config.js`
(`CONFIG.slotCount`).

La forme de la spirale (rayon et hauteur de chaque slot) est calculée par
une fonction périodique de l'angle du slot, ce qui garantit un anneau qui
se referme parfaitement sur lui-même : la rotation peut donc être
appliquée indéfiniment (au-delà de 2π) sans aucune discontinuité visuelle.

### Rotation : scroll virtuel infini + auto-rotation idle

La section contenant le canvas est fixe à l'écran (`position: fixed`) : il
n'y a aucun scroll de page réel, donc aucune dépendance à la hauteur du
document (`scrollHeight`, `window.scrollY`…), source de saccades dans
l'itération précédente.

- `VirtualScroll` écoute `wheel` (desktop) et `touchmove`/`touchstart`/
  `touchend` (mobile), et accumule le delta dans une variable **non
  bornée** (`virtualRotation`).
- Chaque frame, `main.js` lisse cette valeur cible avec un lerp
  (`currentRotation += (target - currentRotation) * CONFIG.rotationLerp`)
  et l'applique à `group.rotation.y`.
- Après ~1.5s sans interaction (`CONFIG.idleDelayMs`), une auto-rotation
  lente et constante reprend automatiquement, désactivée dès la prochaine
  interaction.
- La caméra n'a **aucun** state ni controls (pas d'orbit/pan/zoom) : seule
  la rotation du groupe de slots est animée.

### Carte centrée + overlay

À chaque frame, `getCenteredSlotIndex` détermine le slot le plus proche de
l'angle "face caméra" (0 mod 2π) à partir de la rotation courante. La
carte correspondante (via le modulo) est passée à `Overlay.setCard()`, qui
ne déclenche un crossfade GSAP (fade out → swap du contenu → fade in) que
lorsque la carte affichée change réellement.

## Responsive

- Le nombre de slots (`CONFIG.slotCount`) varie par palier de largeur
  d'écran (`CONFIG.breakpoints`) pour éviter la surcharge visuelle sur
  mobile.
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
