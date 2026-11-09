# Passation — accueil mobile, pavillon de « Souffle d'éclats » fusionné et en ligne

Rédigée le 09/11/2026 par Claude Code, à la demande de Ludovic (« fusionne-les puis passation »).

À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture) et le haut de `JOURNAL.md` (entrées du
07/11 au soir, du 08/11 et du 09/11, détaillées point par point). Une nouvelle session n'a **ni l'historique des
conversations ni la mémoire** des précédentes : tout est dans `CLAUDE.md`, `JOURNAL.md` et ce fichier. Les
passations précédentes (06/11 : GLB du collègue ; 07/11 : pavillon) restent lisibles dans l'historique Git.

---

## 1. Où en est-on (09/11)

- **Une seule version du site.** Le pavillon de « Souffle d'éclats » est **fusionné dans la branche
  principale** `claude/spirale-interactive-gallery-b4mzwd` depuis le 09/11 (demande de Ludovic). La branche
  `salle-pavillon` pointe au même enregistrement : elle n'a plus d'usage. Tout est sur GitHub.
- **Le dossier `~/MMR` est encore sur la branche `salle-pavillon`** (identique à la principale ; une session
  lancée depuis une autre ne change pas de branche). Au début de la prochaine session : `git switch
  claude/spirale-interactive-gallery-b4mzwd` dans `~/MMR`, puis travailler et enregistrer sur la principale.
- **En ligne sur le labo** `mmr-lab` : la version du labo `f0c90b0` (08/11) est exactement la version
  fusionnée (même fichier JavaScript) ; Souffle d'éclats y est ouverte.
- Points de vue de Ludovic du 07/11 au soir (Seuil, Huntington, premiers points de vue du pavillon) et
  captures du Seuil et de Huntington refaites par lui : enregistrés à sa demande.
- Seul fichier modifié à côté : `plans/plan-salle.ai`, **jamais dans un commit sans demande de Ludovic** (même
  règle pour `src/salles/points-de-vue.json` quand il est de nouveau modifié).
- Tout est « à voir » ou « vu », rien n'est « validé » (statuts dans `JOURNAL.md`).

## 2. Fait le 07/11 au soir : accueil mobile

Maquettes Figma `540:687` (spirale) et `540:975` (grille), fichier `BV6AsWeLSbWpCA7AarJGdr`. Tout se joue
jusqu'à **760 px de large** (même seuil que le reste du mobile) ; l'ordinateur est inchangé.

- **Barre du bas** (`.barre-mobile`, `Accueil.tsx`) : onglets Spirale / Grille au milieu, flèches précédente /
  suivante autour sur la spirale, **loupe** à droite sur la grille ; au changement de vue, les boutons de
  l'autre vue sortent et se replient, les onglets glissent. Plus d'onglets dans le header sur mobile.
- **Loupe** (interprétation de Claude : la maquette ne montre que le bouton) : ouvre la recherche au-dessus de
  la barre (`accueil--recherche`), devient une croix ; Échap, la croix ou le retour à la spirale la referment.
  La recherche ne filtre toujours pas la grille.
- **Grille** à 78 px du haut sur mobile (`MOBILE`, `HAUT_MOBILE` de `Grille.js`).
- **Spirale sur mobile** (`accueil/config.js`) : **cartes en 4/3** (choix de Ludovic après essai du 4/3 et du
  carré ; largeur inchangée, la hauteur suit, texture au même format dans `cardTexture.js`) et **ressort
  desserré ×1,9** (réglage de Ludovic, `ECART_MOBILE`, `ecarterRessort` : molette, glisser et rotation
  automatique multipliés d'autant). À cet écart, une seule carte à la fois en 375 × 667 (au-delà de 1,5, les
  cartes du tour voisin sortent de l'écran). Pris au chargement de la page (`MOBILE_AU_CHARGEMENT`) : tourner
  le téléphone ne change rien avant un rechargement. La grille prend aussi le 4/3.
- **Touche M « Spirale (mobile) »** : format (16/9, 4/3, 1/1, gardé dans le navigateur, recharge la page) et
  écart vertical (en direct, même carte au centre).
- Vérifié en 375 × 667 et 375 × 812, aller-retour vers une salle compris, et en ligne. Pas essayé sur un vrai
  téléphone.

## 3. Le pavillon (inchangé depuis la passation du 07/11, désormais dans la branche principale)

- **Œuvre** : poumons du collègue de Ludovic (`blender/poumons.py` → `public/models/poumons.glb`, compressé
  avec `--prune-attributes false`), flottante, en verre (`scene/OeuvreVerre.tsx`), bronches incandescentes
  (`scene/incandescence.ts`), lueur rouge sur la salle (`lueurOeuvre`).
- **Espace central** (`blender/pavillon.py`) : plafond à 12 m, ouvertures sur toute la hauteur, puits de
  lumière de 4,4 m, rubans bleu / beige, anneau de projecteurs à 6 m, bornes, cartel, bancs retirés, joints du
  sol dessinés par le site.
- **Éclairage réglable en direct puis figé** (en dev) : touche M « Éclairage », bouton « Figer » (≈ 20 min de
  calcul, `blender/salle-pavillon/figer.log`).
- **Flou de la salle, œuvre nette** (`scene/FlouSalle.ts`, Huntington et Souffle) : essai, à voir.
- **Couloirs entre salles** identiques, 6 fentes de 1 m (dossier « Couloir · couloirs entre salles »).
- Fiches Maladie (sarcoïdose) et Manifeste (« Oppression », titre proposé par Claude).

## 4. Reste à faire

1. **Avis de Ludovic sur l'accueil mobile**, sur un vrai téléphone : barre du bas, loupe, 4/3, écart ×1,9
   (une carte à la fois : voulu ?), grille en 4/3 (la maquette `540:975` est en 16/9).
2. **Recherche de la grille** : saisie et menus Tags / Mécènes à relier au filtrage (rien de fait).
3. **Captures de « Souffle d'éclats »** faites le 07/11 **avant** les derniers changements de la salle : à
   refaire quand elle sera arrêtée (touche V, « Faire les captures », « Vidéo du survol »).
4. **Points de vue** Maladie et Manifeste du pavillon : premiers réglages de Ludovic enregistrés, à
   confirmer avec lui ; cercles de la navigation à revoir.
5. **Vérifier les passages Huntington ↔ Seuil** après les changements des couloirs (pas refait).
6. **Textes** : citer la source de la prévalence de la sarcoïdose, faire valider « Oppression ».
7. **Fluidité** du pavillon : réfraction, incandescence et flou de la salle hors de l'échelle des renoncements
   (`src/renoncements.ts`) ; test de la machine calé sur Huntington. Mesurer sur une machine faible et sur
   mobile, maintenant que le pavillon est en ligne.
8. **Ombre de la statue** pour le pavillon (`blender/ombre-statue.sh` ne connaît que `seuil` et `rotonde`).
9. **Branche `salle-pavillon`** : à supprimer (sur ce Mac et sur GitHub) si Ludovic est d'accord, une fois
   le dossier `~/MMR` revenu sur la branche principale.

## 5. Mettre en ligne sur le labo (depuis la branche principale)

1. `npm run build` dans `musee/` (branche principale, à jour).
2. Préparer le zip dans le dossier temporaire de la session (`S`) :
   ```bash
   rm -rf $S/labo $S/labo.zip; cp -R dist $S/labo; cd $S/labo
   rm -f .htaccess models/*.webp
   for id in le-seuil-des-proportions la-maladie-de-huntington l-entre-deux l-erosion-silencieuse le-filtre-imparfait souffle-d-eclats; do mkdir -p oeuvre/$id; cp index.html oeuvre/$id/; done
   mkdir -p a-propos; cp index.html a-propos/
   zip -qr -X $S/labo.zip . -x ".DS_Store"
   ```
   (une œuvre ajoutée dans `oeuvres.ts` = son id à ajouter à la liste)
3. Connecteur Fluidbook Toolbox : `lab_upload_zip` avec `lab: "mmr-lab"` et `clean: true`, sans contenu ; il
   renvoie une adresse d'envoi : `curl -sS -F "file=@$S/labo.zip" "<adresse>"`.
4. Vérifier : `curl -s https://mmr-lab.labs.cubedesigners.com/ | grep -o 'assets/index-[^"]*\.js'` donne le
   même nom que `dist/index.html` ; puis ouvrir le site, entrer dans Souffle d'éclats.

## 6. Outils et rappels

- **Navigateur intégré** : serveur de dev `preview_start` nom `dev`, site construit `apercu` (port 4173). Il
  doit être visible et au premier plan. Taille mobile : `resize_window` 375 × 667 ou 375 × 812 ; l'écran
  d'accueil demande un clic sur « Entrer sans le son » à chaque rechargement.
- **Réglages Leva depuis la console** (essais) : importer `/node_modules/.vite/deps/leva.js?v=…` (nom exact
  dans les ressources chargées) et `levaStore.setValueAtPath('Spirale (mobile).ecart', 1.5, true)`.
- **Blender** : `/Applications/Blender.app/Contents/MacOS/Blender -b --python-use-system-env -P script.py --
  arguments` ; Pillow dans `blender/.pylib` (hors Git), à passer dans `PYTHONPATH`.
- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **CSS :** toujours `-webkit-backdrop-filter` **avant** `backdrop-filter`.
- **React Three Fiber :** un objet monté pendant un passage reçoit ses réglages dans `useLayoutEffect`.
- **Ludovic :** répondre en français, court ; montrer des captures ; étapes numérotées et concrètes quand il
  doit agir ; ne marquer « validé » que sur son accord explicite ; enregistrer dans Git, envoyer sur GitHub
  ou mettre en ligne seulement à sa demande ; à la fin de chaque session, une entrée en haut de `JOURNAL.md`.
