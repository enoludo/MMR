# Passation — reprise sur un autre compte Claude

Rédigée le 05/11/2026 par Claude Code, avant que Ludovic ne continue le travail depuis un autre compte
Claude (même Mac, même dossier). À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture)
et le haut de `JOURNAL.md` (détail de chaque changement, avec son statut). Remplace la passation « avant de
reprendre le design des popups » (03/11), toujours lisible dans l'historique Git.

Le nouveau compte n'a **ni l'historique des conversations ni la mémoire** de l'ancien : tout ce qu'il faut
savoir est dans `CLAUDE.md`, `JOURNAL.md` et ce fichier. Rien d'autre n'a été convenu oralement.

---

## 1. Où en est-on (05/11)

- **Git :** tout est enregistré sur la branche principale `claude/spirale-interactive-gallery-b4mzwd` et
  envoyé sur GitHub (`enoludo/MMR`). La branche de travail `moteur-salle-unique` y est fusionnée ; l'état
  d'avant ce chantier est sous l'étiquette `avant-moteur-unique` (`1afa89f`).
- **En ligne :** le labo `mmr-lab` (https://mmr-lab.labs.cubedesigners.com/) a la dernière version (04/11).
- **Accès GitHub :** par le trousseau du Mac (`credential.helper osxkeychain`), indépendant du compte
  Claude. `gh` n'est pas installé. Un envoi a été refusé une fois sans raison le 04/11, passé au second essai.

**Fait du 03/11 au 04/11** (tout est « à voir » dans le journal, rien n'est « validé ») :
1. Popups d'après la maquette `502:770` (576 px, marge 72 px, barre de défilement fine), contenu réel de
   démo pour Huntington, bouton « En savoir plus » sans lien.
2. Vidéo au survol des vignettes de la grille (Seuil, Huntington), retour à l'envers au rollout et au clic.
3. Fluidité au clic depuis la grille : moteur de rendu des salles unique, préparation de la salle sans
   arrêt (mesures dans le journal).
4. Ordre des œuvres : Seuil, Huntington, puis les autres.
5. Raccord de la transition vers le Seuil après les nouvelles captures de Ludovic.
6. Grille d'après la maquette `477:1404`.
7. Éclair au clic sur une vignette, vue d'arrivée fausse en cliquant une œuvre juste après un retour.

**Pas de demande en cours.** Demander à Ludovic ce qu'il veut faire ; s'il ne sait pas, lui proposer les
points « à voir » ci-dessous.

## 2. Points ouverts (détail dans `CLAUDE.md`, section « Points ouverts »)

- À montrer à Ludovic et faire valider : grille et ses transitions, vidéo au survol, fluidité.
- Matière de la statue de Huntington (Jeff), trop sombre de face.
- Chiffres des popups Maladie à vérifier (Seuil : « 1/2M » et « ACVR1 » ne correspondent pas à
  l'acromégalie ; Huntington : prévalence et « 0 »).
- Recherche et filtres de la grille (affichés, pas reliés).
- Rotonde : bruit de la lumière sur les colonnes, approche de la porte d'entrée.
- Mobile et Safari jamais vérifiés depuis le 03/11 ; maquette mobile à demander.
- Spirale : deux fois, titre affiché et œuvre visée par « Découvrir » ne concordaient pas (non reproduit).
- Ménage : `~/MMR/_to_delete/`, `musee/_a_supprimer/`, les zips et « Claude outputs » à la racine de `MMR`.

## 3. Outils dont le nouveau compte a besoin

- **Connecteur Fluidbook Toolbox** (outil `lab_upload_zip`) : sans lui, pas de mise en ligne sur le labo.
  Ludovic doit l'ajouter au nouveau compte (réglages de Claude, Connecteurs). À défaut : SFTP (accès
  donnés par `lab_get`), ou Vercel (`Mettre en ligne.command`).
- **Figma** (plugin et connecteur) : pour lire les maquettes ; à reconnecter si les outils Figma manquent.
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

## 5. Rappels pratiques

- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
- **Mesurer la fluidité comme en ligne :** site construit (`apercu`, port 4173), pas le serveur de dev.
- **CSS :** toujours `-webkit-backdrop-filter` **avant** `backdrop-filter`.
- **Ludovic :** répondre en français, court ; montrer des captures ; étapes numérotées et concrètes quand
  il doit agir (il n'est pas à l'aise avec le Terminal) ; ne marquer « validé » que sur son accord
  explicite ; enregistrer dans Git, envoyer sur GitHub ou mettre en ligne seulement à sa demande ; à la
  fin de chaque session, une entrée en haut de `JOURNAL.md`.
