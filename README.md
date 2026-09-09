# Galerie Spirale Interactive — MMR

Mur de cartes enroulé sur un cylindre, animé en 3D (Three.js), avec
rotation pilotée par un scroll virtuel infini et une auto-rotation lente en
idle. Une carte "centrée" affiche dynamiquement un titre + CTA en overlay
HTML.

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
  (colonnes × rangées) est fixe et indépendant du nombre de cartes (voir
  plus bas), les nouvelles cartes viennent simplement s'intercaler dans le
  mur.
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
  config.js                   Toutes les constantes réglables (rayon, colonnes/rangées, vitesses…)
  style.css                   Styles de base de l'overlay et du canvas plein écran
  data/
    cards.json                Données des cartes (source de contenu)
  gallery/
    SpiralGallery.js          Scène Three.js, génération du mur, rotation, textures, resize
    textureTiers.js           Pré-calcule 3 niveaux de flou par image (Canvas2D)
    VirtualScroll.js          Accumulation wheel/touch, rotation non bornée, idle → auto-rotation
    centeredSlot.js           Calcul de la colonne la plus proche de l'angle "face caméra"
    Overlay.js                Overlay HTML + crossfade GSAP entre cartes
    placeholderTexture.js     Génère une texture de repli si une image est manquante
```

### Un mur cylindrique, pas une spirale mathématique

Le mur est fait de `columnCount` colonnes réparties uniformément en angle
autour d'un cylindre (rayon constant), chacune contenant `CONFIG.rowCount`
cartes empilées verticalement — un mur haut de photos, pas un simple anneau
d'une seule rangée. Le rayon étant constant, la forme est périodique en
angle : elle peut donc tourner indéfiniment comme un seul groupe rigide,
sans aucune couture à masquer (contrairement à une vraie spirale
Archimédienne à rayon croissant, qui elle ne peut pas boucler proprement).

### Colonnes découplées des données

Le nombre de colonnes (ex. 18 sur desktop) est fixe et indépendant du
nombre de cartes réelles dans `cards.json`. Seule la rangée "hero" (rangée
0, à hauteur des yeux) mappe directement une colonne à
`cardsData[colonne % cardsData.length]` et pilote l'overlay ; les autres
rangées utilisent un décalage différent pour éviter de répéter
identiquement les mêmes images à chaque étage du mur :

```js
const card = cardsData[cardIndex % cardsData.length];
```

Passer de 4 à ~20 cartes ne nécessite aucune modification du code 3D : le
modulo s'ajuste automatiquement. Le nombre de colonnes par palier
responsive se règle dans `config.js` (`CONFIG.columnCount`).

### Profondeur de champ (flou) sans passe de post-traitement

Plutôt qu'un vrai flou de profondeur de champ en temps réel (fragile selon
les GPU, coûteux), chaque image est pré-rendue une fois en 3 niveaux de
flou via Canvas2D (`textureTiers.js`, `ctx.filter = 'blur(...)'`). À chaque
frame, `SpiralGallery#setRotation` calcule l'écart angulaire de chaque
carte par rapport à l'avant du mur et bascule sa texture entre ces trois
niveaux (net / doux / flou) — fiable sur tous les appareils, coût
négligeable.

### Rotation : scroll virtuel infini + auto-rotation idle

La section contenant le canvas est fixe à l'écran (`position: fixed`) : il
n'y a aucun scroll de page réel, donc aucune dépendance à la hauteur du
document (`scrollHeight`, `window.scrollY`…), source de saccades dans
l'itération précédente.

- `VirtualScroll` écoute `wheel` (desktop) et `touchmove`/`touchstart`/
  `touchend` (mobile), et accumule le delta dans une variable **non
  bornée** (`virtualRotation`, en radians).
- Chaque frame, `main.js` lisse cette valeur cible avec un lerp
  (`currentRotation += (target - currentRotation) * CONFIG.rotationLerp`)
  et l'applique à `group.rotation.y`.
- Après ~1.5s sans interaction (`CONFIG.idleDelayMs`), une auto-rotation
  lente et constante reprend automatiquement, désactivée dès la prochaine
  interaction.
- La caméra n'a **aucun** state ni controls (pas d'orbit/pan/zoom) : elle
  est fixe ; seule la rotation du mur est animée.

### Carte centrée + overlay

À chaque frame, `getCenteredSlot` cherche, parmi les cartes de la rangée
hero, celle dont l'angle courant (position de base + rotation du mur) est
le plus proche de "face caméra" (0 mod 2π). La carte correspondante est
passée à `Overlay.setCard()`, qui ne déclenche un crossfade GSAP (fade out
→ swap du contenu → fade in) que lorsque la carte affichée change
réellement — et tue proprement toute transition encore en cours pour
éviter qu'un changement rapide n'affiche un texte périmé.

## Responsive

- Le nombre de colonnes (`CONFIG.columnCount`) varie par palier de largeur
  d'écran (`CONFIG.breakpoints`) pour éviter la surcharge visuelle sur
  mobile.
- Sur un écran étroit/portrait, la caméra est reculée le long de son propre
  axe de visée (voir `SpiralGallery#resize`) : le FOV d'une caméra
  perspective n'est vertical, donc sur un ratio étroit le FOV horizontal
  s'effondre et pousserait le mur quasi entièrement hors champ sans cette
  compensation.
- Le canvas et le mur ne sont recalculés que sur l'événement `resize`
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
