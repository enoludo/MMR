# Passation — avant de reprendre l'animation des titres de la spirale

Rédigée le 01/11/2026 par Claude Code, à la fin de la session « rotonde, vue libre, effets d'image,
navigation ». À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture détaillée) et le haut
de `JOURNAL.md` (détail de chaque changement, avec son statut). Remplace la passation du 30/10 (« après la
refonte de l'interface des salles »), toujours lisible dans l'historique Git.

---

## 1. Prochaine tâche : la sortie des titres de la spirale

**Demande de Ludovic (01/11) :** améliorer l'animation de disparition du titre de l'œuvre sur la spirale.
Au changement de carte, **les lettres du titre partent vers le haut les unes après les autres**, et
**presque en même temps** les lettres du titre de l'œuvre suivante **apparaissent par le bas, comme
aujourd'hui**.

**Aujourd'hui** (`src/accueil/gallery/Overlay.js`, `setCard`) : le titre entier s'efface en fondu
(opacité, 0,25 s), puis le nouveau titre est écrit et ses lettres montent de leur masque une à une
(`ENTREE_LETTRES` → `APPARITION_LETTRES` : `yPercent` 110 → 0, opacité 0 → 1, 0,8 s, `power3.out`,
décalage de 0,022 s par lettre). Les deux titres ne coexistent jamais : un seul `h2` (`.accueil__titre`,
`Accueil.tsx`), découpé par SplitText (`type: 'words, chars'`, `mask: 'chars'`).

**La sortie voulue existe déjà ailleurs :** `cacher()` (même fichier, au clic sur « Découvrir ») fait partir
les lettres vers le haut à travers leur masque, une à une : `yPercent: -110, opacity: 0, duration: 0.45,
ease: 'power2.inOut', stagger: 0.012`. C'est le bon point de départ pour la sortie au changement de carte
(Ludovic l'a vue et n'a rien demandé de changer).

**Ce qu'il faut pour que les deux titres se croisent :**
- **Deux calques de titre superposés** (deux `h2` dans `.accueil__info`, l'un sur l'autre, ou un `h2` de
  sortie cloné) : celui qui part garde son découpage SplitText pendant que le nouveau est découpé dans
  l'autre. Ils alternent à chaque carte. Le titre peut tenir sur une ou deux lignes (`max-width: 60vw`,
  `text-wrap: balance`) : les deux calques doivent être calés en bas ou en haut de la même façon. Le CTA
  (« Découvrir ») reste unique, sous le titre ; attention à la hauteur du bloc quand l'ancien titre a deux
  lignes et le nouveau une.
- **Scroll rapide :** la carte centrale peut changer plusieurs fois par seconde. Aujourd'hui, `setCard` tue
  la timeline précédente (sinon un ancien `.call()` réécrit le texte en dernier). Avec deux calques :
  un titre en train d'entrer doit pouvoir repartir aussitôt vers le haut d'où il en est, sans saut ni
  troisième titre empilé.
- **Garder `cacher()` / `montrer()` / `poser()`** (transitions spirale ↔ salle, écran d'accueil) : pendant
  qu'il est masqué (`this.masque`), le titre change sans animation et reste caché ; `cartePrevue` gère un
  changement de carte interrompu. Accueil.tsx (l. 150-160) appelle `cacher()` / `montrer()` puis
  `setCard(carte)` à chaque image.
- **Réglages des lettres partagés** avec les titres des salles (`src/ui/apparition.ts`, mêmes valeurs
  d'entrée) : garder l'entrée telle quelle, Ludovic la veut « comme actuellement ».
- **CSS :** `.accueil__titre` et ses masques `.char-mask` (marge pour les accents, compensée), `.word`
  (`nowrap`), dans `src/style.css` vers la ligne 126.
- **Proposer à Ludovic** un recouvrement réglable (départ de l'entrée quand la sortie est à moitié, par
  exemple), et lui montrer en vidéo ou en captures successives ; ralentir avec
  `gsap.globalTimeline.timeScale(0.2)` pour vérifier.

## 2. Où en est-on

**Git :** tout est enregistré et envoyé sur GitHub (`enoludo/MMR`, branche
`claude/spirale-interactive-gallery-b4mzwd`, commit `1d9d33e`, puis cette passation).

**En ligne :** le labo `mmr-lab` (https://mmr-lab.labs.cubedesigners.com/) est toujours à la version du
30/10 (`0d175e0`) : **rien du 31/10 et du 01/11 n'est en ligne** (rotonde, effets, navigation…).

**Fait depuis la dernière passation** (tout est « à voir » dans le journal) :

1. **Rotonde** de « La maladie de Huntington » : première salle à l'architecture propre à son œuvre
   (`blender/rotonde.py`, `src/salles/rotonde/config.ts`).
2. **Vue libre** (touche V, en dev) : régler la position initiale, les vues Maladie et Manifeste, faire
   les captures ; **profondeur de champ réglée vue par vue** (case « flou » et ses curseurs ; coupée
   partout par défaut, Ludovic fera ses réglages).
3. **Effets d'image** (`src/scene/Effets.tsx`) : halo, grain, anticrénelage, courbe de couleurs par salle
   (**Géant en ACES**, plus contrasté, au choix de Ludovic ; rotonde en AgX), mélangés pendant les
   passages. Coût : environ un tiers d'images par seconde en moins ; Ludovic a gardé la résolution
   minimale à 1,5.
4. **Résolution baissée pendant les passages entre salles** (×0,65 : 18 → 29 images/s mesurées).
5. **Corrections de lumière** : œuvre éclairée à l'envers quand les effets sont actifs (passe du reflet) ;
   saut de couleur à l'arrivée d'un passage (soleil de la salle d'arrivée, courbe de couleurs).
6. **Vignette des flèches** = la vue principale de l'œuvre, refaite à chaque enregistrement de la
   position initiale.
7. **Navigation** : dérive et scroll à la même vitesse en mètres à toutes les distances (0,15 m/s) ;
   rotation automatique aux vues Maladie et Manifeste.

## 3. Où trouver quoi

| Sujet | Fichiers |
|---|---|
| Titre et CTA de la spirale | `src/accueil/gallery/Overlay.js` (`setCard`, `cacher`, `montrer`, `poser`), `src/accueil/Accueil.tsx` (balisage, appels), `src/style.css` (`.accueil__titre`) |
| Titres des salles et des popups | `src/ui/apparition.ts` (`useApparition`, sorties Web Animations), `src/ui/Popup.tsx` |
| Effets d'image | `src/scene/Effets.tsx` (`Courbe`, réglages par salle `effets`, flou par vue) |
| Points de vue et vue libre | `src/salles/pointsDeVue.ts`, `src/salles/points-de-vue.json`, `src/ui/VueLibre.tsx`, `src/scene/VolLibre.tsx` |
| Captures (transition, vignette, cartouches) | `src/outils/capture.ts` |
| Navigation, vitesse, rotation aux popups | `src/scene/Navigation.tsx` (`avancer`, `rayonOrbite`, `vitesseAuto`, `M_PAR_PIXEL`) |
| Soleil et reflet de l'œuvre | `src/scene/Salle.tsx` (`Soleil`, `Eclairage`), `src/scene/Reflet.tsx` |
| Résolution adaptative | `src/resolution.ts` (`qualite.plancher`, `qualite.passage`) |

## 4. Points ouverts (détail dans `CLAUDE.md`)

- **À montrer à Ludovic à vitesse normale :** l'arrivée d'un passage (plus de saut de couleur), la rotation
  aux popups (rapide de très près : 4°/s à 2,2 m dans la rotonde), la vitesse de 0,15 m/s.
- **Captures de transition** (images depuis la spirale) faites avant les effets : à refaire si on garde les
  effets (bouton « Faire les captures » de la vue libre).
- **Profondeur de champ** : à régler par Ludovic, vue par vue.
- Rotonde : bruit de la lumière sur les colonnes, approche de la porte d'entrée, lumière de l'œuvre.
- Mobile, chiffres du popup Maladie, vue Grille, bundle de 1,3 Mo : inchangés depuis le 30/10.
- Ménage : `~/MMR/_to_delete/`, `musee/_a_supprimer/`, les zips et « Claude outputs » à la racine de `MMR`.

## 5. Rappels pratiques

- **Serveur de développement :** `npm run dev` (http://localhost:5173). Le 01/11, un ancien serveur lancé
  le 26/10 occupait encore le port 5173 : en cas de doute, le relancer.
- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
  Mesurer les performances sur la version compilée (`npm run build` puis `npx vite preview`).
- **Navigateur intégré :** masqué, il fige les animations. Pour figer un passage : `__visite.etat.duree =
  1e7` puis régler `__visite.etat.t`. Leva se pilote depuis la console avec `levaStore` (importé depuis
  l'adresse de `leva.js` relevée dans `performance.getEntriesByType('resource')`).
- **three.js :** changer `material.side` ne fait pas recompiler le programme ; toujours `needsUpdate`
  (cause du Géant éclairé à l'envers le 31/10).
- **Mettre en ligne sur le labo :** `npm run build`, copier `dist/` sans `.htaccess` ni les lightmaps WebP,
  ajouter une copie de `index.html` dans `oeuvre/<id>/` pour chaque œuvre et dans `a-propos/`, zipper, puis
  `lab_upload_zip` (labo `mmr-lab`, `clean: true`). Réessayer si le labo ou GitHub refusent une première fois.
- **Ludovic :** répondre en français, court ; montrer des captures ; ne marquer « validé » que sur son
  accord explicite ; enregistrer dans Git ou mettre en ligne seulement à sa demande.
