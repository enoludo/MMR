# Passation — avant de reprendre le design des popups

Rédigée le 03/11/2026 par Claude Code, à la fin de la session « statue de Jeff et réglages par salle ». À
lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture détaillée) et le haut de `JOURNAL.md`
(détail de chaque changement, avec son statut). Remplace la passation « avant de retravailler la statue de
Huntington », toujours lisible dans l'historique Git.

---

## 1. La suite : le design des popups Maladie et Manifeste

**Demande de Ludovic (03/11) :** reprendre le design des popups, dont il n'est **pas encore satisfait**. Il
n'a pas encore dit ce qui ne va pas : **commencer par le lui demander** (ce qui le gêne, s'il a une nouvelle
maquette Figma ou des références), puis lui montrer des captures à chaque étape, en 1680 × 1050.

**Maquettes actuelles :** Figma `BV6AsWeLSbWpCA7AarJGdr`, Maladie `471:511`, Manifeste `477:2158` (depuis le
30/10). Avant : `447:602` et `448:911`, puis une première intégration refaite parce qu'il n'en était pas
content (voir `JOURNAL.md`, entrées du 27/10 et du 30/10). S'il fournit une nouvelle maquette, relever ses
cotes en 1680 × 1050 (l'écran de la maquette).

### Ce que sont les popups aujourd'hui

**Composant unique, réutilisable dans toutes les salles :** `src/ui/Popup.tsx`. Toujours passer par lui.
- `Popup` (cadre, croix, défilement, focus clavier, fermeture par la croix, Échap ou un clic à côté),
  composé de blocs : `PopupEntete` (surtitre + grand titre), `PopupTexte` (paragraphes, `petit` pour le
  Manifeste), `PopupChiffres` (deux colonnes), `PopupLien` (bouton rouge « En savoir plus »).
- Utilisé dans `src/ui/InterfaceSalle.tsx` (`Maladie`, `Manifeste`, vers la fin du fichier). Les textes
  viennent de `src/oeuvres.ts` (`maladieTexte` : titre, paragraphes, chiffres, lien ; `manifesteTitre`,
  `manifeste`).

**Mise en page** (`src/style.css`, section « Popup », commentaires détaillés) :

| Élément | Valeur actuelle |
|---|---|
| Cadre | 653 px de large (`clamp(400px, 38.87vw, 653px)`), à 96 px du bord droit, centré en hauteur, entre le header et le pied |
| Fond | `--verre-sombre` (noir à 20 %), flou 15 px, coins 24 px (30 sur la maquette, réduit par Ludovic) |
| Marge intérieure | la même sur les quatre côtés (demande de Ludovic) : 96 px en 1680 × 1050, 48 px en 1440 × 900, jusqu'à 24 px ; au-delà le contenu défile, barre masquée |
| Croix | bouton rond de 48 px à 6 px du coin, transparent, voile léger au survol (demande de Ludovic) |
| En-tête | surtitre 16 px, grand titre Marquez 48 px (60 sur la maquette, réduit par Ludovic), filet dessous |
| Texte | Maladie 16 px Light, interligne 24 ; Manifeste 14 px, interligne 21 |
| Chiffres | deux colonnes, 48 px d'écart, valeur 36 px en capitales, filet sous chacun |
| Bouton | pilule rouge `#d93e34` (`#c2352c` au survol) |
| Mobile (< 761 px) | en bas, au-dessus des flèches, 60 % de la hauteur au plus, tailles réduites (section mobile de `style.css`) |
| Écrans peu hauts | section `@media (max-height: 800px)` |

**Animations** (dans `Popup.tsx`, réglées dans l'esprit du premier écran) :
- Ouverture : le premier écran part en cascade, le cadre arrive 0,2 s après (glisse de 24 px, 0,6 s, CSS),
  puis le surtitre, le **grand titre lettre par lettre** (SplitText, masque par lettre), et chaque
  paragraphe, chiffre et bouton l'un après l'autre (0,1 s d'écart), la croix en fondu.
- Fermeture : tout repart par le haut dans le même ordre, puis le cadre s'efface (0,35 s après).
- Le titre reste découpé tant que le popup est ouvert (sinon accents et espacement sautaient) ; les
  masques de lettres laissent de la place aux accents (`.char-mask`, en haut de `style.css`).
- Son de clic à l'ouverture (`cliquer()`, `musique.ts`), rien à la fermeture.

**Lien avec la 3D :**
- À l'ouverture, la caméra va au point de vue du popup (Maladie : la grosse main ; Manifeste : le
  visage), réglés dans la vue libre (touche V, `src/salles/points-de-vue.json`). Popup ouvert, rotation
  automatique lente et scroll qui tourne autour de l'œuvre (`Navigation.tsx`, `tourEtape`).
- **L'image se décale** pour que l'œuvre reste au milieu de l'espace libre à gauche du popup :
  `src/scene/Decentrage.tsx`. Il mesure `.popup--ouvert` à l'écran, mais **la vue libre et les captures
  recopient en dur le bord et la largeur du popup** (`Math.min(96, 5.714 * vw) + …`). **Si la largeur ou la
  position du popup change, changer aussi cette ligne**, puis revoir les points de vue Maladie et Manifeste
  (touche V, case « Cadrer comme avec un popup ouvert »).
- Les photos des cartouches (premier écran) sont les vues des popups, sans le décalage : elles ne
  changent pas avec le design du popup, seulement avec les points de vue.

**Points connus, à reprendre avec le design :**
- Chiffres du popup Maladie du Seuil repris du Figma (1/2M, ACVR1, 9/10, 0) : **à faire valider** (« 1/2M » et
  « ACVR1 » ne correspondent pas à l'acromégalie ; ACVR1 est le gène de la FOP). Lien Orphanet à confirmer.
- Huntington et les autres œuvres n'ont qu'un texte d'attente (`maladieAVenir` : titre et paragraphe « à
  venir », ni chiffres ni lien) : le popup doit rester beau sans eux.
- Mobile : le popup Maladie défile ; pas de maquette mobile.
- Police de la maquette (Geist Light) remplacée par Google Sans Flex Light.

**Pour vérifier :** salle ouverte (`/oeuvre/le-seuil-des-proportions` et `/oeuvre/la-maladie-de-huntington`),
clic sur une cartouche ; contrôler en 1680 × 1050 (cotes de la maquette), 1440 × 900, 1280 × 720 et mobile.
Le navigateur intégré doit être **visible** (masqué, il fige les animations et la salle ne se charge pas).
Pour regarder une animation au ralenti : `gsap.globalTimeline.timeScale(0.05)` (voir `CLAUDE.md`).

## 2. Où en est-on

**Git :** tout est enregistré et envoyé sur GitHub (`enoludo/MMR`, branche
`claude/spirale-interactive-gallery-b4mzwd`, dernier commit `80ed3fe`).

**En ligne :** le labo `mmr-lab` (https://mmr-lab.labs.cubedesigners.com/) est à jour (version du labo
`4bd4a37`, 03/11).

**Fait le 03/11** (tout est « à voir » dans le journal) :
1. **Statue de Huntington de Jeff** à la place de l'ancienne, même taille (2,70 m) ; lumière de la rotonde
   recalculée ; captures refaites par Ludovic. Elle paraît très sombre de face (bronze métallique) : à
   régler avec lui.
2. **Réglages de la touche M propres à chaque salle** : lumières, couleurs, effets de la salle et de la
   statue (`src/reglages.ts`, `src/salles/couleurs.ts`), un bouton « copier ce dossier » par dossier, et
   le dossier « Transmettre » (copier tout, coller, enregistrer en local dans `src/salles/reglages.json`).
   Pour que le collègue de Ludovic envoie ses réglages depuis le labo : Ludovic colle le texte copié dans
   la conversation, il faut alors reprendre les valeurs (dossier d'une salle : `reglages.json` sous l'id de
   la salle ; dossier commun, comme « Grille » ou « Titres de la spirale » : valeur par défaut dans le code).
   **Pas encore essayé dans le navigateur** (il était masqué) : à vérifier au début de la session.
3. Réglages transmis par Ludovic : titres de la spirale (délai 0,25 s), grille (écart 12 px, marges 24 px).

## 3. Où trouver quoi

| Sujet | Fichiers |
|---|---|
| Popups | `src/ui/Popup.tsx`, `src/style.css` (section « Popup », mobile, écrans peu hauts), `src/ui/InterfaceSalle.tsx` (`Maladie`, `Manifeste`, cartouches) |
| Textes des popups | `src/oeuvres.ts` (`maladieTexte`, `manifesteTitre`, `manifeste`) |
| Cadrage de l'œuvre à côté du popup | `src/scene/Decentrage.tsx`, `src/salles/points-de-vue.json`, `src/ui/VueLibre.tsx` |
| Animations des textes | `src/ui/apparition.ts` (premier écran), `Popup.tsx` (popups) |
| Réglages par salle | `src/reglages.ts`, `src/salles/couleurs.ts`, `src/salles/reglages.json`, `src/ui/CopieReglages.tsx`, `vite.config.ts` (`/__reglages`) |

## 4. Points ouverts (détail dans `CLAUDE.md`)

- Essayer les réglages par salle dans le navigateur (dossiers, copie, collage, enregistrement, passage
  d'une salle à l'autre).
- Matière de la statue de Jeff, trop sombre de face.
- À montrer à Ludovic : vue Grille et ses transitions ; recherche et filtres à relier à la grille.
- Rotonde : bruit de la lumière sur les colonnes, approche de la porte d'entrée.
- Mobile (avec une maquette), bundle de 1,3 Mo.
- Ménage : `~/MMR/_to_delete/`, `musee/_a_supprimer/`, les zips et « Claude outputs » à la racine de `MMR`.

## 5. Rappels pratiques

- **Serveur de développement :** `npm run dev` (http://localhost:5173) ; depuis Claude Code, `preview_start`
  avec le nom `dev`.
- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **CSS :** toujours `-webkit-backdrop-filter` **avant** `backdrop-filter` (sinon le flou disparaît en ligne
  dans Chrome).
- **Mettre en ligne sur le labo :** `npm run build`, copier `dist/` sans `.htaccess` ni les lightmaps WebP,
  ajouter une copie de `index.html` dans `oeuvre/<id>/` pour chaque œuvre et dans `a-propos/`, zipper, puis
  `lab_upload_zip` (labo `mmr-lab`, `clean: true`, envoi du zip par `curl` sur l'adresse renvoyée).
- **Ludovic :** répondre en français, court ; montrer des captures ; ne marquer « validé » que sur son
  accord explicite ; enregistrer dans Git ou mettre en ligne seulement à sa demande.
