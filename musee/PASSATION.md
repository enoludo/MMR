# Passation — transitions entre la spirale et les salles

Rédigée le 28/10/2026 par Claude Code, à la fin de la session « salles » (couloirs, nouvelles vues, fluidité).
À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture) et le haut de `JOURNAL.md` (dernières sessions).
Remplace la passation du 26/10, devenue obsolète (ancienne navigation `CameraControls`, salle de 24 m, socle).

**Prochaine étape demandée par Ludovic :** les transitions entre la page d'accueil (galerie spirale) et les salles, dans les deux sens.

> **Mise à jour (28/10, soir) :** ces transitions sont faites (zoom de la carte ↔ salle, retour sur l'œuvre quittée, préchargement), statut [à voir]. Voir `JOURNAL.md` et `CLAUDE.md` (Architecture, « Transitions spirale ↔ salle »).

---

## 1. Où en est-on (28/10)

Tout ce qui suit est fait et vérifié dans le navigateur. Statut **[à voir]** : Ludovic l'a testé en local au fil de l'eau, sans validation formelle. Rien n'est encore mis en ligne depuis ces changements.

**Salles (toutes, une seule salle provisoire pour l'instant) :**
- Salle de 30 × 30 m, 20 m sous plafond.
- Deux portes de 4 m jusqu'au plafond : l'entrée au sud, la sortie au nord, chacune au bord droit de son mur.
- Œuvre de 10 m (modèle de 8 m agrandi de 1,25).
- Lumière précalculée à 768 échantillons : plafond propre.
- Texture de pierre précalculée dans une texture de bruit 32³ : la scène se dessine environ 2 fois plus vite.

**Passage d'une salle à l'autre** (« Œuvre précédente / suivante ») :
- On traverse un couloir de 14 m à fentes de lumière, en 8 s au plus.
- On arrive sur la vue initiale de la salle suivante. L'adresse change sans rechargement.

**Navigation dans une salle** (`src/scene/Navigation.tsx`) : trois anneaux à 1,70 m.
- **Vue initiale :** à 13 m, face à l'avant de l'œuvre, avec rotation automatique. C'est la vue au chargement et à l'arrivée par la porte.
- **Cercle de visite (9 m) :** on y passe au premier scroll.
- **Cercle réduit (5,5 m) :** un clic sur l'œuvre y mène, un autre clic en ramène.
- **Popups :** Maladie (vue de face vers la main) et Manifeste (vue levée vers le visage). Ils se ferment par la croix, un clic à côté ou Échap, et on revient sur le cercle de 9 m.

**Interface de salle** (Figma 445:275 « SeuilHome », 447:602, 448:911) :
- Le premier écran, à gauche, reste affiché sur les trois anneaux.
- Les popups s'affichent à droite (composant réutilisable `src/ui/Popup.tsx`).
- Œuvre précédente / suivante sont en bas.

## 2. Ce qui relie aujourd'hui la spirale et les salles

**Routes** (`src/main.tsx`) :
- `/` : `Accueil` (la spirale).
- `/oeuvre/:id` : `PageOeuvre`, chargée à la demande (`lazy`, morceau de 313 Ko).
- `/a-propos` : page « À propos ».

**De la spirale vers une salle :**
1. Le bouton « Découvrir » de la carte centrée (`.accueil__cta`, lien posé par `src/accueil/gallery/Overlay.js`) appelle `naviguer('/oeuvre/<id>')`.
2. `Accueil` est démonté : son `useEffect` arrête l'animation et libère la galerie (`galerie.dispose()`, `scroll.dispose()`, `overlay.dispose()`, `teinte.dispose()`). Le canvas Three.js de la spirale disparaît.
3. `PageOeuvre` est chargée, puis monte `Experience`, c'est-à-dire le canvas React Three Fiber de la salle.
4. `PageOeuvre` pose `store.salle`, et la salle se charge.
5. Pendant ce temps, l'écran `Chargement` (logo et barre, dans `InterfaceSalle.tsx`, via `useProgress` de drei) couvre tout.
6. Une fois la salle chargée, on est sur la vue initiale (anneau `loin`, `angleDepart`).

**Ce que charge une salle :**

| Fichier | Taille |
|---|---|
| `salle.glb` | 10 Ko |
| Deux lightmaps webp | 2,6 Mo chacune |
| `sculpture.glb` | 0,7 Mo |

`useGLTF.preload` (dans `Salle.tsx`) ne s'exécute qu'une fois le morceau `PageOeuvre` chargé. **Rien n'est préchargé depuis la spirale.**

**D'une salle vers la spirale :**
1. La pastille titre du header (`Link to="/"`, croix) ramène à `/`.
2. `PageOeuvre` est démontée, ce qui remet `store.salle` et `store.passage` à `null`. Le canvas R3F disparaît.
3. `Accueil` remonte une spirale neuve. **Elle repart de sa première carte**, pas de celle de l'œuvre qu'on quitte : la position de la spirale n'est pas mémorisée.

**Deux canvas séparés :** la spirale (Three.js pur, `src/accueil/gallery/`) et la salle (R3F). C'est un écart assumé par rapport à la note de setup (« un seul canvas persistant »). Les transitions sont l'occasion de rediscuter ce choix avec Ludovic.

## 3. Points d'attention pour les transitions

**Rien n'existe encore.** Aujourd'hui, on passe d'une page à l'autre sans animation, avec l'écran de chargement entre les deux.

Pistes techniques, à proposer à Ludovic avant de coder :
- **Précharger la salle depuis la spirale :**
  - importer `PageOeuvre` au survol ou au centrage d'une carte (`import('./pages/PageOeuvre')`) ;
  - précharger `useGLTF.preload` et les lightmaps de la salle de l'œuvre centrée.
  - Les salles réelles auront leurs propres modèles, et environ 6 Mo par salle à charger.
- **Garder la spirale affichée pendant le chargement de la salle,** puis fondre de l'une à l'autre. Par exemple :
  - monter `PageOeuvre` par-dessus `Accueil` le temps de la transition, et ne démonter la spirale qu'à la fin ;
  - ou faire un zoom de la carte centrée (son image : `oeuvres.ts`, champ `image`) qui remplit l'écran puis laisse place à la salle.
  - À savoir : deux contextes WebGL actifs en même temps coûtent de la mémoire. C'est acceptable le temps d'un fondu, à surveiller sur mobile.
- **Retour vers la spirale :** ramener la spirale sur la carte de l'œuvre qu'on quitte.
  - Le scroll virtuel a `stepToAdjacentCard`. Il faudra une méthode « aller à la carte n » dans `VirtualScroll.js`, ou mémoriser `scroll.tick()` dans le store.
  - Attention : les cartes sont dans l'ordre de `cartesSpirale`, décalé de 1 par rapport à `oeuvres` (`src/oeuvres.ts`).
- **Entrée dans la salle :** la vue initiale (13 m, rotation automatique) se prête bien à un « fondu au noir » ou à une arrivée en travelling. On peut démarrer la caméra plus loin, ou plus haut, et la laisser glisser jusqu'à la vue initiale. Tout l'état de la caméra est dans `n.current` de `Navigation.tsx`.
- **L'écran de chargement actuel** est à intégrer dans la transition, ou à supprimer si le préchargement suffit.
- **Maquettes Figma utiles** (fichier `BV6AsWeLSbWpCA7AarJGdr`) :
  - Spirale `240:1671`, Grille `58:207`, Intro `118:1180`, composants `58:316` ;
  - la salle : `445:275` (SeuilHome).
  - Regarder s'il existe une maquette de transition, ou demander à Ludovic.

**Questions à poser à Ludovic au démarrage :**
1. Quel effet pour l'entrée dans une salle ? Fondu au noir, zoom de la carte, travelling d'arrivée, autre ? A-t-il des références ?
2. Au retour, la spirale doit-elle revenir sur la carte de l'œuvre quittée ?
3. Durée souhaitée des transitions, et doit-on pouvoir les interrompre (clic, scroll) ?
4. Le préchargement depuis la spirale est-il souhaité, avec ce qu'il coûte en données mobiles ?
5. L'écran d'intro (Figma `118:1180`) est-il lié à cette étape ?

## 4. Vérifier son travail

**Lancer et vérifier :**
- `npm run dev`, puis http://localhost:5173. Le serveur tourne souvent déjà.
- Avant d'annoncer : `npx tsc --noEmit`, `npm run build` et un coup d'œil au navigateur.

**Accès de mise au point (développement uniquement) :**
- **`window.__visite`** :
  - `camera`, `scene`, `gl`, `etat` (l'état de la navigation : `mode`, `anneau`, `rayon`, `angle`, `t`, `duree`…) ;
  - `aller(i)` va à une étape, `retour()` revient, `avancer(rad)` fait tourner, `cliquer(x, y)` simule un clic, `surLOeuvre(x, y)` teste si un point de l'écran est sur l'œuvre.
- **`window.__spirale`** : `galerie`, `scroll`.
- **Figer un passage :** `__visite.etat.duree = 1e7`, puis régler `__visite.etat.t` entre 0 et 1.
- **Placer la caméra où l'on veut :** ajouter une étape provisoire, par exemple `__visite.config.etapes.push({id:'dbg', …, position, cible})`, puis `__visite.aller(n)` avec `__visite.etat.duree = 0.01`.
- **Mesurer le coût d'une image :** dans la console, `gl.render(scene, camera)` puis `readPixels` d'un pixel, sur 30 images. Comparer avec la scène vide pour retirer le coût fixe de la mesure. Les chiffres du navigateur intégré sont approximatifs, il faut raisonner en relatif.

## 5. Pièges rencontrés (à ne pas refaire)

- **Lumières :** ne jamais faire varier le nombre de lumières de la scène, sinon l'œuvre change de lumière d'un coup et tout est recompilé. Il y a un seul `Eclairage` dans `Salle.tsx`, avec deux soleils permanents et une ambiance.
- **Sculptures et reflet :** chaque passe de reflet masque les sculptures des autres salles. À garder en tête si la spirale et une salle cohabitent.
- **Rechargement à chaud :** il garde l'ancien état des `useRef` et des réglages Leva. Après un changement de valeur par défaut ou d'état, **recharger la page** pour juger.
- **Ludovic utilise parfois le navigateur intégré en même temps :**
  - l'état peut changer sous vos pieds (clics, scroll) ;
  - les erreurs de la console s'accumulent d'un rechargement à l'autre : regarder l'horodatage (`?t=`) avant de conclure.
- **Précalcul de lumière depuis Claude Code :**
  - lancer les scripts avec `/Applications/Blender.app/Contents/MacOS/Blender -b --python-use-system-env -P script.py -- arguments` ;
  - `lightmap.py` a besoin de Pillow (voir `CLAUDE.md`, « Chaîne 3D ») ;
  - `salle.py 2048 768 256` prend environ 40 minutes : à lancer en arrière-plan.
- **Mise en ligne :** `npx vercel --prod --yes` **depuis `musee/`** (jamais depuis `~/MMR`), ou `Mettre en ligne.command`.

## 6. Points ouverts (repris de `CLAUDE.md`)

- **À faire valider par Ludovic :**
  - réglages du couloir ;
  - bancs et rayons des cercles dans la salle agrandie ;
  - cadrages main et visage avec popup ouvert.
- **Chiffres du popup Maladie** à valider : « ACVR1 » ne correspond pas à l'acromégalie.
- **Une seule salle et une seule sculpture** pour toutes les œuvres : le passage vers une salle réellement différente n'a pas été essayé, et son préchargement est à prévoir.
- **Mobile :** le premier écran pousse l'œuvre vers le haut, et le popup Maladie défile.
- **Reste à faire :** vue Grille, écran d'intro, son ; découper le code principal (`index` de 1,3 Mo).
- **Git :** `musee/` n'est pas suivi par Git (dépôt à la racine de `~/MMR`). À organiser avec Ludovic avant de gros chantiers.
- **Ménage :** `~/MMR/_to_delete/` et `musee/_a_supprimer/`.
