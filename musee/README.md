# Musée des maladies rares — site 3D

Maquette verticale : une salle provisoire carrée (24 × 24 m, 20 m sous plafond) éclairée par un puits de lumière et une fente zénithale, la sculpture monumentale de 8 m au centre, posée à même le sol avec son reflet, une navigation sur un cercle autour de l'œuvre (œil à 1,70 m) avec trois points de vue liés aux onglets de l'interface, et la galerie spirale en page d'accueil. Voir aussi la note de décision « Setup technique recommandé » dans le projet Claude MMR.

## Lancer le site

Prérequis : **Node.js 22** ou plus récent (`brew install node` sur Mac).

```
cd ~/MMR/musee
npm install        # la première fois seulement
npm run dev        # ouvre http://localhost:5173
```

Pour produire la version à mettre en ligne : `npm run build`. Le résultat, dans `dist/`, est un ensemble de fichiers statiques sans PHP ni serveur particulier.

## Utilisation

Le site suit la maquette Figma « MMR » (écrans Spirale, Salle 365:1275 et Maladie 318:833).

- **Accueil (`/`) :** la galerie spirale, reprise du projet « Galerie spirale » à la racine de `~/MMR` (son README explique toute la mécanique). « Découvrir » ouvre la salle de l'œuvre centrée. Le bouton Grille ne fait encore que changer d'onglet.
- **Salle d'une œuvre (`/oeuvre/<id>`) :**
  - **Scroll (molette, trackpad) ou ← → :** tourner autour de l'œuvre sur un cercle invisible (boucle infinie). Sans action, la caméra dérive lentement (1°/s), dans le sens du dernier scroll.
  - **Hauteur de la souris (ou ↑ ↓) :** lever ou baisser les yeux (inversé : souris en haut, regard vers le bas).
  - **Onglets Info / Maladie / Manifeste :** changent le contenu du panneau de gauche et emmènent la caméra vers un point de vue (`vues` de l'œuvre dans `src/oeuvres.ts` : Info = tour libre, Maladie = la main, Manifeste = le visage). Un scroll ramène la caméra sur le cercle sans changer d'onglet.
  - **Bouton ≡ du panneau :** le replie ou le déplie. Panneau ouvert, l'image est décentrée (`src/scene/Decentrage.tsx`) pour que l'œuvre reste au milieu de l'espace libre.
  - **Œuvre précédente / suivante :** passe à l'œuvre voisine (pour les tests, toutes sont dans la salle provisoire). La transition entre salles reste à faire.
  - **Partager :** partage natif sur mobile, sinon copie du lien.
  - **Sur mobile :** glisser horizontalement pour tourner, verticalement pour lever les yeux ; le panneau passe en bas.
- **Touche M :** affiche ou masque le panneau de réglages (navigation, lumière, reflet, poussière, porte, exposition…). Les réglages ne sont pas sauvegardés : une fois une valeur trouvée, on la reporte dans le code (`src/salles/provisoire/config.ts`).
- **Régler un point de vue (en `npm run dev`) :** dans la console du navigateur, `__visite.camera.position` donne la position courante ; `__visite.aller(0)` et `__visite.retour()` pilotent la caméra.

## Contenus

Les œuvres sont décrites dans **`src/oeuvres.ts`** : titre, maladie, image de la carte, mécène, partenaire, textes des onglets Maladie et Manifeste, salle et points de vue. Ajouter une œuvre = ajouter une entrée (et son image dans `public/assets/images/`).

- **Polices :** Marquez (`public/fonts/`) pour les titres ; Google Sans Flex (version libre de Google Sans, licence OFL, paquet `@fontsource-variable/google-sans-flex`) pour le reste.
- **Icônes :** Phosphor (`@phosphor-icons/react`), la famille utilisée dans la maquette. L'icône « Partager » de la maquette (Streamline) est remplacée par son équivalent Phosphor (`Export`).
- **Logo du partenaire :** pas encore fourni (le téléchargement depuis Figma est bloqué ici). En attendant, son nom s'affiche en texte. Déposer le fichier (SVG de préférence) dans `public/assets/` et renseigner `partenaire.logo`.

## Organisation

```
musee/
├── src/
│   ├── main.tsx                  ← routes : accueil, œuvre, pages classiques
│   ├── oeuvres.ts                ← la collection : contenus de chaque œuvre
│   ├── accueil/                  ← galerie spirale (Three.js, reprise telle quelle) et sa page
│   ├── scene/                    ← la 3D des salles : canvas, salle, navigation, décentrage
│   ├── salles/provisoire/        ← configuration de la salle : parcours, étapes, soleil, matières
│   ├── ui/                       ← header commun, interface de la salle
│   └── pages/                    ← page d'une œuvre, pages classiques (À propos…)
├── public/assets/                ← logo, images des cartes
├── public/models/                ← fichiers 3D optimisés servis au navigateur
├── blender/                      ← sources 3D et scripts de fabrication (voir ci-dessous)
└── references/ambiance/          ← visuels de référence pour le design de la salle
```

## Fabriquer les fichiers 3D

Tous les scripts de `blender/` se lancent avec Blender en ligne de commande (`blender -b -P script.py -- arguments`) ou avec le module Python `bpy` (`python3 script.py arguments`).

| Étape | Script | Rôle |
|---|---|---|
| 1 | `sculpt.py` | Allège la sculpture (`sculpture/model.obj`, ~100 000 → ~39 000 triangles), la met à 8 m de haut et produit `sculpture/sculpture.blend` et un GLB. |
| 2 | `salle.py [résolution] [échantillons]` | Construit la salle, place le soleil et le ciel, précalcule la lumière avec Cycles et exporte la géométrie (`salle/salle-raw.glb`). Deux lightmaps : l'architecture (`lightmap.exr`) et le « mobilier » : le sol sur 18 × 18 m autour de l’œuvre (toute la tache du puits et son fondu) et les bancs (`lightmap-mobilier.exr`, environ 9 mm par pixel, pour l'ombre de contact des pieds). La sculpture est posée au sol, enfoncée de 1,5 cm (`ENFONCE`). Sauvegarde aussi `salle/salle.blend`, modifiable dans Blender. |
| 3 | `masque.py` | Repère les surfaces dans chaque lightmap, pour effacer les coutures entre surfaces. |
| 4 | `denoise.py` | Débruite la lightmap (OpenImageDenoise) et reconstruit les bords des surfaces. |
| 5 | `lightmap.py` | Convertit la lumière pour le web (encodage logarithmique, sans perte) et écrit son échelle dans un `.json`, à placer dans `src/salles/provisoire/`. |
| 6 | `npx @gltf-transform/cli optimize …` | Compresse les GLB. |
| 6 bis | `npx @gltf-transform/cli optimize blender/sculpture/sculpture-raw.glb <tmp> --compress meshopt --simplify false --texture-compress webp --texture-size 2048` | Compresse la sculpture sans la simplifier (sinon des triangles disparaissent) ; puis l'étape 7 avec l'enfoncement `0.012`. |
| 7 | `node blender/occlusion.mjs …` (depuis `musee/`) | Calcule l'occlusion ambiante de la sculpture par sommet, en tenant compte du sol, et l'ajoute au GLB (`_OCCLUSION`). À relancer après chaque nouvel export de la sculpture ou changement de `ENFONCE`. |

Exemple complet pour la salle (environ 25 minutes sur un ordinateur récent, surtout pour le précalcul) :

```
cd blender
python3 salle.py 2048 128
python3 masque.py salle/salle.blend Salle 2048 salle/lightmap-masque.exr
python3 masque.py salle/salle.blend Mobilier 2048 salle/lightmap-mobilier-masque.exr
python3 denoise.py salle/lightmap.exr salle/lightmap-dn.exr salle/lightmap-masque.exr
python3 denoise.py salle/lightmap-mobilier.exr salle/lightmap-mobilier-dn.exr salle/lightmap-mobilier-masque.exr
python3 lightmap.py salle/lightmap-dn.exr ../public/models/salle-lightmap.webp
python3 lightmap.py salle/lightmap-mobilier-dn.exr ../public/models/salle-lightmap-mobilier.webp
mv ../public/models/salle-lightmap.json ../src/salles/provisoire/lightmap.json
mv ../public/models/salle-lightmap-mobilier.json ../src/salles/provisoire/lightmap-mobilier.json
npx @gltf-transform/cli optimize salle/salle-raw.glb /tmp/salle-opt.glb --compress false --simplify false --join false
npx @gltf-transform/cli meshopt /tmp/salle-opt.glb ../public/models/salle.glb --quantization-volume scene --quantize-position 16 --quantize-texcoord 14
```

### Comment la lumière est construite

- **La salle** est affichée sans calcul d'éclairage dans le navigateur : chaque surface = pierre × lumière précalculée (lightmap). On a ainsi la lumière riche et douce de Cycles (rebonds, ombres de la sculpture au sol) pour un coût quasi nul.
- **La pierre est procédurale** (`src/scene/pierre.ts`) : pas de texture image, donc aucun motif répété. Sa couleur est calculée à partir de la position dans l'espace, en trois couches réglables avec la touche M : grandes nuances douces, voile moyen, grain fin. Le grain s'efface avec la distance pour éviter le scintillement.
- **La sculpture** est éclairée en temps réel avec les mêmes valeurs que dans Blender. Le soleil du puits est un spot lointain dont la découpe reprend la section du faisceau et l'ombre des lames du puits, et qui projette des ombres sur l'œuvre ; une lumière d'ambiance froide en haut et chaude en bas complète.
- **L'ancrage au sol** vient de trois choses : l'ombre de la sculpture et l'occlusion au pied, précalculées finement dans la lightmap du sol ; l'occlusion ambiante de la sculpture par sommet (`blender/occlusion.mjs`), qui assombrit le bas des pieds et les creux ; l'œuvre légèrement enfoncée dans le sol, pour qu'aucun jour ne passe sous les pieds.
- **Le reflet au sol** (`src/scene/Reflet.tsx`) : à chaque image, la sculpture est rendue à mi-résolution depuis la caméra symétrique par rapport au sol. Le sol lit cette image au pixel près : le reflet est net au contact des pieds, puis s'atténue et se floute avec la hauteur. Il est plus présent en vue rasante. Force, flou et atténuation se règlent avec la touche M (« Reflet au sol »).
- **Le faisceau visible dans l'air** est calculé dans un shader : pour chaque pixel, on mesure la quantité de faisceau traversée par le regard, avec des bords adoucis ; les lames du puits le découpent en bandes (`src/scene/lames.ts`, aussi utilisé par la poussière).
- **La poussière qui flotte dans le faisceau** (`src/scene/Poussiere.tsx`) : quelques milliers de grains animés entièrement par la carte graphique, qui ne s'allument que dans la lumière. Densité, taille, vitesse et brillance se règlent avec la touche M ; le nombre de grains est divisé par deux sur les petits écrans.
- **Toute modification de la position du soleil** (`SOLEIL` dans `salle.py`) doit être reportée dans `soleil.direction` de la config de la salle (repère du site : Blender (x, y, z) = site (x, z, −y)).
