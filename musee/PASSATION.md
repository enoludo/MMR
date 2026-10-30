# Passation — avant la refonte de l'interface des salles

Rédigée le 30/10/2026 par Claude Code, à la fin de la session « salle de 40 m, Huntington, fluidité ».
À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture détaillée) et le haut de `JOURNAL.md`.
Remplace la passation du 28/10 (transitions spirale ↔ salles), toujours lisible dans l'historique Git.

**Prochaine étape, choisie par Ludovic : refaire l'interface web des salles.** Celle en place ne lui
convient pas. Il va montrer une nouvelle maquette Figma : lui demander le lien (ou l'identifiant
de l'écran) en début de session, avant de toucher au code.

---

## 1. Où en est-on

**Ce qui a été fait depuis le 28/10** (détail et statuts dans `JOURNAL.md`) :
- **Salle de 40 × 40 m** d'après le plan de Ludovic, et une deuxième œuvre modélisée, **« La maladie de
  Huntington »** (statue de 2,70 m sur socle lumineux, salle bleutée).
- **Réglages propres à chaque salle** (navigation, transitions, sculpture : touche M, dossiers au nom de la salle).
- **Passages entre salles** sans saut de caméra ni de couleur, ambiance qui glisse dans le couloir.
- **Fluidité** (toutes validées ou vues par Ludovic) : résolution adaptative (plancher 1,5), faisceau deux fois
  moins coûteux, salles voisines préchargées, salle d'arrivée préparée cachée, lightmaps en KTX2, images
  de transition allégées (version 2880 px, deux œuvres gardées en mémoire), profondeur des captures
  à pleine résolution, fondu d'arrivée de 0,6 s.
- **Abandonné :** lissage du contour de l'œuvre pendant la transition (calcul deux fois plus lourd, jugé
  « pire » par Ludovic sur grand écran Retina). Un léger crénelage du contour reste visible pendant la
  parallaxe ; ne le reprendre qu'avec une méthode qui ne coûte presque rien.
- **Retiré :** le message « Faites défiler pour tourner autour de l'œuvre » en bas des salles.

**En ligne :** labo Fluidbook Toolbox `mmr-lab`, https://mmr-lab.labs.cubedesigners.com/ (dernière version).
Vercel n'est plus mis à jour depuis le 27/10.

**Git :** tout est enregistré et envoyé sur GitHub (`enoludo/MMR`, branche
`claude/spirale-interactive-gallery-b4mzwd`), jusqu'à cette passation (envoi du 30/10, à la demande de Ludovic).

## 2. L'interface actuelle des salles : ce qu'il y a à refaire

Maquette de référence jusqu'ici : Figma `BV6AsWeLSbWpCA7AarJGdr`, écrans 445:275 (premier écran),
447:602 (popup Maladie), 448:911 (popup Manifeste). La nouvelle maquette les remplacera.

| Élément | Où | Rôle actuel |
|---|---|---|
| Interface de la salle | `src/ui/InterfaceSalle.tsx` | assemble tout ; `choisirOnglet()` ouvre un popup **et** envoie la caméra vers un point de vue |
| Premier écran (à gauche, sans fond) | `InterfaceSalle`, classe `.salle-accueil` | titre (lettre par lettre), liens Maladie › et Manifeste ›, « Avec le soutien de » (logo), « Partager cette œuvre » |
| Popups Maladie et Manifeste (à droite) | `src/ui/Popup.tsx` (`Popup`, `PopupEntete`, `PopupTexte`, `PopupChiffres`, `PopupLien`) | réutilisables ; focus clavier, fermeture par la croix, un clic à côté ou Échap |
| Header commun (spirale et salles) | `src/ui/EnTete.tsx` | logo, élément central (dans une salle : pilule titre + croix = retour à la spirale), son, menu |
| Œuvre précédente / suivante | `InterfaceSalle`, `.pied` | lance le passage par le couloir (`partirVers`) |
| Écran de chargement | `InterfaceSalle`, `Chargement` | logo et barre ; barre seule en entrant depuis la spirale |
| Textes lettre par lettre | `src/ui/apparition.ts` (`useApparition`, GSAP SplitText) | titre et liens du premier écran, à l'entrée et à la sortie des transitions |
| Icônes | `src/ui/icones.tsx` et `@phosphor-icons/react` | |
| Styles | `src/style.css`, sections « Éléments communs », « Header », « Salle », « Popup », « Mobile » | valeurs de la maquette (verre, flou 15 px, rayon 24, hauteur 48, marge 24) |
| Contenus | `src/oeuvres.ts` (`Oeuvre` : `titre`, `maladie`, `maladieTexte`, `manifeste`, `mecene`, `partenaire`, `vues`) | textes encore provisoires (« À venir ») sauf le Seuil |

**Liens avec la 3D, à garder en tête quelle que soit la nouvelle maquette :**
- `store.onglet` (`'info'`, `'maladie'`, `'manifeste'`) : l'interface l'écrit, la caméra le lit. Chaque onglet a
  un point de vue (`oeuvre.vues` → `salle.etapes`, réglables dans la config de la salle) ; `store.demande` envoie
  la caméra (`Navigation.tsx`). Retour au premier écran = retour sur le cercle.
- `scene/Decentrage.tsx` décale le cadrage pour que l'œuvre reste au milieu de l'espace libre : il **mesure**
  `.salle-accueil` et `.popup--ouvert` dans la page. Si les classes ou la place des panneaux changent,
  l'adapter.
- Transitions avec la spirale et passages : classes `.salle-ui--transition` et `.salle-ui--passage` qui
  effacent l'interface ; le premier écran part et revient lettre par lettre (`useApparition`, `visible`).
  Le titre central du header sert aussi de bouton de retour (`sortir()`).
- La vignette sombre `.salle-ui__vignette` est recopiée dans le shader de la transition (`ToileTransition.ts`) :
  si elle change, changer les deux, sinon un voile saute à la fin de l'entrée.
- Les panneaux laissent passer le regard et la molette dans leurs zones vides (`pointer-events: none` sur le
  conteneur, `auto` sur les enfants) : à conserver, sinon la navigation se bloque au-dessus de l'interface.
- Mobile (moins de 760 px) : premier écran et popup en bas, au-dessus des boutons ; à revoir avec la maquette.

## 3. Méthode proposée pour la refonte

1. Lire la maquette avec les outils Figma (charger la compétence `figma:figma-design-to-code` avant
   `get_design_context`), écran par écran ; relever la grille, les cotes, les états (ouvert, survol, mobile).
2. Faire valider à Ludovic la liste des éléments et des comportements (ce qui ouvre quoi, où va la caméra)
   avant d'écrire le code.
3. Réutiliser ce qui tient (`Popup` et ses blocs, `useApparition`, `EnTete`) ; remplacer le reste.
4. Contrôler les cotes en 1680 × 1050 comme jusqu'ici, puis en 1440 × 900, en grand écran et sur mobile ;
   montrer des captures côte à côte avec la maquette.
5. Vérifier qu'aucune transition ne casse : entrée et retour avec la spirale, passage par le couloir,
   ouverture et fermeture des popups (la caméra et le décentrage suivent).

## 4. Rappels pratiques

- **Serveur de développement :** `npm run dev` (http://localhost:5173 ; 5175 quand le port est pris).
- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **Mettre en ligne sur le labo :** `npm run build`, copier `dist/` sans `.htaccess` ni les lightmaps WebP,
  ajouter une copie de `index.html` dans `oeuvre/<id>/` pour chaque œuvre et dans `a-propos/`, zipper, puis
  `lab_upload_zip` (labo `mmr-lab`, `clean: true`). Ludovic le demande à chaque fois (« pousse sur toolbox »).
- **Ludovic :** répondre en français, court ; montrer des captures avant/après ; ne marquer « validé » dans le
  journal que sur son accord explicite ; enregistrer dans Git ou mettre en ligne seulement à sa demande.
