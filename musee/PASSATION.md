# Passation — reprise sur un autre compte Claude

Rédigée le 05/11/2026 en fin de soirée par Claude Code, à la demande de Ludovic (« je vais rebasculer sur
un autre compte Claude »). À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture) et le
haut de `JOURNAL.md` (détail de chaque changement, avec son statut). Remplace la passation « avant de
retravailler plusieurs sujets » (05/11 au soir), toujours lisible dans l'historique Git.

Une nouvelle session n'a **ni l'historique des conversations ni la mémoire** des précédentes : tout ce qu'il
faut savoir est dans `CLAUDE.md`, `JOURNAL.md` et ce fichier.

---

## 1. Où en est-on (05/11, fin de soirée)

- **Branche principale** `claude/spirale-interactive-gallery-b4mzwd` : tout est enregistré et **envoyé sur
  GitHub** (dernier enregistrement : anticrénelage, panneau M, compteur d'images, cette passation).
- **En ligne :** le labo `mmr-lab` (https://mmr-lab.labs.cubedesigners.com/) a encore **la version du
  04/11**. Ludovic a demandé la mise en ligne de la session du 05/11 (« git, github et labs »), mais le
  connecteur Fluidbook Toolbox n'était pas branché dans la session : **à faire en premier si le connecteur
  est là** (section 4, depuis la branche principale à jour).
- **Accès GitHub :** par le trousseau du Mac (`credential.helper osxkeychain`). `gh` n'est pas installé.

### Faits le 05/11 (tous « à voir » avec Ludovic, détail dans `JOURNAL.md`)

- Ombres précalculées du Seuil et de Huntington à 2048 échantillons, lignes dans les ombres corrigées
  (`masque.py`) ; Huntington en « calcaire doré » puis un peu moins chaud ; captures des deux salles refaites.
- Spirale : pause de 5 s après un geste, reprise douce. Salles : cliquer-glisser pour tourner autour de
  l'œuvre (sens inversé à la souris et au doigt). Carré bleu au toucher sur Android supprimé.
- Mobile d'après la maquette Figma `520:1179` (panneau du bas qui suit le doigt, popups en panneau du bas,
  voile de la maquette) ; transitions spirale / grille ↔ salle raccordées sur mobile ; survol des flèches
  du bas de nouveau progressif.
- **Anticrénelage** (touche M, « Effets (toutes les salles) ») : qualité du SMAA et **échantillons ×1 / ×2 /
  ×4 / ×6** (suréchantillonnage, `PasseScene` dans `Effets.tsx`). Coût sur le M1 : 30 → 22 / 16 / 10
  images/s. Par défaut inchangé (SMAA basse, ×1).
- Panneau de la touche M élargi (580 px) et **compteur d'images par seconde** en bas à gauche avec la touche M
  (`ui/Fps.tsx`).

### Décisions attendues de Ludovic

1. **Anticrénelage par défaut** : proposé « ×2 + SMAA basse » ou garder ×1 (il essaie avec la touche M et le
   compteur). Pour changer le défaut : `value` de `echantillons` (et de `smaa`) dans `Effets.tsx`.
2. **Logo sur mobile** : petit sur l'accueil (24 px, à cause des onglets Spirale / Grille), grand dans les
   salles (48 px, maquette) : il saute à l'entrée. Choix proposé : grand partout avec les onglets passés
   sous le header, ou petit partout.

### Le pavillon de « Souffle d'éclats » est mis de côté

**Décision de Ludovic (05/11) :** « garde cette salle de côté. On poussera cette partie du travail quand je
te le demanderai explicitement. »

- Tout le travail du pavillon est enregistré sur la branche locale **`salle-pavillon`** (commit `f7f6606`),
  **sur ce Mac seulement** : pas envoyée sur GitHub, pas fusionnée, pas en ligne. Ne pas l'envoyer, la
  fusionner ni la mettre en ligne sans une demande explicite de Ludovic.
- Sur la branche principale, « Souffle d'éclats » est revenue à son état d'avant : salle provisoire,
  fermée à la visite, dernière de la collection.
- Ce que contient la branche : salle (`blender/pavillon.py`, `src/salles/pavillon/config.ts`), plan coté
  (`plans/salle-pavillon.html`), œuvre en verre (`blender/souffle.py`, `src/scene/OeuvreVerre.tsx` :
  poumons de verre bleu à vraie réfraction, vaisseaux en verre rouge, l'œuvre flotte sans socle), quatre
  projecteurs dans les angles de l'espace central, lumière calculée en qualité, petites adaptations de
  `Salle.tsx`, `Couloir.tsx`, `types.ts`, `chaine.sh`, `oeuvres.ts` (salle ouverte, en troisième). Le
  détail est dans le `JOURNAL.md` et le `CLAUDE.md` **de cette branche** (`git show
  salle-pavillon:musee/JOURNAL.md`).
- Reste à faire sur le pavillon (quand Ludovic le reprendra) : captures (transition, cartouches, vignette,
  vidéos du survol), points de vue Maladie et Manifeste, lueur de l'œuvre dans la lumière précalculée, avis
  de Ludovic sur l'œuvre et la lumière (tout est « à voir »). Mesurer la réfraction sur une machine plus
  faible et sur mobile (60 images/s sur le Mac en 1280 × 720).
- **Pour la reprendre :** `git switch salle-pavillon` (pour la regarder), ou, sur sa demande, la fusionner
  dans la branche principale (`git merge salle-pavillon` depuis la branche principale). Si la branche
  principale a changé entre-temps, des conflits sont possibles dans `Salle.tsx`, `Couloir.tsx`,
  `oeuvres.ts`, `types.ts`, `CLAUDE.md` et `JOURNAL.md` : les résoudre en gardant les deux.
- Les calculs de lumière bruts (`blender/salle-pavillon/*.exr`, ≈ 330 Mo) restent dans le dossier, hors
  Git. Pour relancer les scripts, Pillow et scikit-image doivent être réinstallés avec le Python de Blender
  (voir `CLAUDE.md`, « Chaîne 3D ») : les dossiers utilisés le 05/11 étaient temporaires.

## 2. Sujets à retravailler

Après la mise en ligne et les deux décisions ci-dessus, demander à Ludovic par quoi il veut continuer. Les points ouverts
de la branche principale (détail dans `CLAUDE.md`, « Points ouverts », et dans `JOURNAL.md`), tous
« à voir » :

1. **Popups des salles** (03/11) : deuxième passe d'après la maquette `502:770`, à reprendre selon ce qui le
   gêne ; points de vue Maladie et Manifeste à recadrer avec le décalage de l'œuvre (touche V).
2. **Grille de l'accueil** (01/11, 04/11) : transitions, vidéo au survol (Seuil, Huntington ; à généraliser
   à toutes les œuvres, demande de Ludovic), recherche et filtres Tags / Mécènes affichés mais pas reliés,
   étiquette « thème » absente des données.
3. **Fluidité** au clic depuis la grille (04/11) : pire image 50 à 60 ms sur le site construit.
4. **Statue de Huntington (Jeff)** : matière trop sombre de face, à contre-jour (touche M « Sculpture »).
5. **Rotonde de Huntington** : bruit de la lumière sur les colonnes, approche de la porte d'entrée.
6. **Salle de 40 m** (Seuil) : contraste, lames, couloirs et impasses ; vue d'arrivée, points de vue et
   anneaux repris de la salle de 30 m.
7. **Effets d'image** (31/10) : choisir entre tout garder (−25 à −35 % d'images/s) et AgX seul.
8. **Transitions spirale ↔ salles** : durées, raccords, parallaxe, effet sur mobile.
9. **Contenus** : chiffres des popups Maladie à vérifier (Seuil : « 1/2M » et « ACVR1 » ne correspondent
   pas à l'acromégalie ; Huntington : prévalence et « 0 ») ; boutons « En savoir plus » sans lien.
10. **Mobile et Safari** : salles faites d'après la maquette `520:1179`, jamais vues sur un vrai téléphone
    ni dans Safari ; accueil (spirale, grille) sans maquette mobile.
11. **Musique** : volume général, fondus, raccord des boucles.
12. **Spirale** : deux fois, titre affiché et œuvre visée par « Découvrir » ne concordaient pas (non
    reproduit).
13. **Ménage** : `~/MMR/_to_delete/`, `musee/_a_supprimer/`, les zips et « Claude outputs » à la racine de
    `MMR`, `plans/~ai-…tmp` (fichier temporaire d'Illustrator).

## 3. Outils

- **Connecteur Fluidbook Toolbox** (outil `lab_upload_zip`) : pour mettre en ligne sur le labo. À défaut :
  SFTP (accès donnés par `lab_get`), ou Vercel (`Mettre en ligne.command`).
- **Figma** (plugin et connecteur) : pour lire les maquettes (fichier `BV6AsWeLSbWpCA7AarJGdr`).
- **Navigateur intégré** de l'application : serveur de dev par `preview_start` avec le nom `dev`
  (`.claude/launch.json`), aperçu du site construit avec le nom `apercu`. Il doit être **visible** : masqué,
  ou fenêtre de Claude réduite dans le Dock, il fige les animations.

## 4. Mettre en ligne sur le labo

1. `npm run build` dans `musee/`.
2. Préparer le zip (dans un dossier temporaire) :
   ```bash
   S=<dossier temporaire>; rm -rf $S/labo $S/labo.zip; cp -R dist $S/labo; cd $S/labo
   rm -f .htaccess models/*.webp
   for id in le-seuil-des-proportions la-maladie-de-huntington l-entre-deux l-erosion-silencieuse le-filtre-imparfait souffle-d-eclats; do mkdir -p oeuvre/$id; cp index.html oeuvre/$id/; done
   mkdir -p a-propos; cp index.html a-propos/
   zip -qr -X $S/labo.zip . -x ".DS_Store"
   ```
   (une œuvre ajoutée dans `oeuvres.ts` = son id à ajouter à la liste)
3. `lab_upload_zip` avec `lab: "mmr-lab"` et `clean: true`, sans contenu : il renvoie une adresse
   d'envoi ; y envoyer le zip par `curl -sS -F "file=@$S/labo.zip" "<adresse>"`.
4. Vérifier : `curl -s https://mmr-lab.labs.cubedesigners.com/ | grep -o 'assets/index-[^"]*\.js'` doit
   donner le même nom que `dist/index.html` ; puis ouvrir le site et entrer dans une salle.

Toujours mettre en ligne **depuis la branche principale** (sans le pavillon), sauf demande contraire.

## 5. Rappels pratiques

- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **Mesurer la fluidité comme en ligne :** site construit (`apercu`, port 4173), pas le serveur de dev.
- **CSS :** toujours `-webkit-backdrop-filter` **avant** `backdrop-filter`.
- **Ludovic :** répondre en français, court ; montrer des captures ; étapes numérotées et concrètes quand
  il doit agir (il n'est pas à l'aise avec le Terminal) ; ne marquer « validé » que sur son accord
  explicite ; enregistrer dans Git, envoyer sur GitHub ou mettre en ligne seulement à sa demande ; à la
  fin de chaque session, une entrée en haut de `JOURNAL.md`.
