# Passation — après la refonte de l'interface des salles, la musique et l'écran d'accueil

Rédigée le 30/10/2026 (fin d'après-midi) par Claude Code, à la fin de la session « refonte de l'interface
des salles ». À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture détaillée) et le haut
de `JOURNAL.md` (détail de chaque changement, avec son statut). Remplace la passation du matin du 30/10
(« avant la refonte »), toujours lisible dans l'historique Git.

---

## 1. Où en est-on

**En ligne :** labo Fluidbook Toolbox `mmr-lab`, https://mmr-lab.labs.cubedesigners.com/ (version du labo
`0d175e0`, la dernière). Vercel n'est plus mis à jour depuis le 27/10.

**Git :** tout est enregistré et envoyé sur GitHub (`enoludo/MMR`, branche
`claude/spirale-interactive-gallery-b4mzwd`, commit `9367d29`, puis cette passation).

**Fait pendant la session** (tout est « à voir » dans le journal, sauf le flou des cartouches, validé) :

1. **Interface des salles** d'après les nouvelles maquettes Figma :
   - premier écran `477:973` : titre, cartouches Maladie et Manifeste avec photo (photo = la vue où va la
     caméra à l'ouverture du popup, `__visite.capturerCartouches(id)`), flou progressif dans les
     cartouches, soutien, partage ; marge gauche de 96 px ;
   - en bas : flèches œuvre précédente / suivante qui s'ouvrent au survol en carte avec le visuel de
     l'œuvre (flou progressif en bas) ;
   - popups `471:511` (Maladie) et `477:2158` (Manifeste) : 653 px, coins 24, croix transparente, titre
     48 px, chiffres sur deux colonnes, bouton rouge, marge intérieure régulière de 96 à 24 px ;
   - popup ouvert : le scroll tourne autour de l'œuvre depuis le point de vue, le regard suit la souris.
2. **Animations, toutes dans le même esprit** : apparitions et disparitions en cascade (premier écran,
   popups, header, flèches), titres lettre par lettre plus doux (salles, popups, spirale), cohérentes quel
   que soit le chemin (popup ouvert → autre œuvre ou spirale). Sorties du texte jouées par le navigateur
   (Web Animations) et spirale préparée après la sortie du texte, pour une sortie fluide vers la spirale.
3. **Son** : musique en boucle par salle (spirale, géant, Huntington ; les autres salles reprennent celle
   de la spirale), fondus enchaînés, bouton son branché et mémorisé, clic à l'ouverture des popups et aux
   changements de page. Un cliquetis à l'apparition des titres a été essayé puis retiré.
4. **Écran d'accueil** (intro Figma `118:1180`) : fond noir, logo qui s'allume case par case au rythme du
   chargement réel, puis la spirale apparaît en fondu, la signature s'écrit, et deux boutons « Entrer avec
   le son » / « Entrer sans le son » (le clic débloque le son). Logo écrit dans `index.html` : visible à 0,3 s.
   Prêt en ≈ 3,8 s sur la version compilée (premier chargement).

## 2. Où trouver quoi

| Sujet | Fichiers |
|---|---|
| Premier écran, cartouches, flèches | `src/ui/InterfaceSalle.tsx` (`Cartouche`, `Fleche`), `style.css` sections « Salle » et « Pied » |
| Popups | `src/ui/Popup.tsx` (animations GSAP comprises), section « Popup » de `style.css` |
| Cascades et titres | `src/ui/apparition.ts` (`useApparition` : `cascade`, `delai`, sorties Web Animations) |
| Tourner autour de l'œuvre au point de vue | `src/scene/Navigation.tsx` (`vueEtape`, `tourEtape`, `TOUR_VERS_AXE`) |
| Musique et sons | `src/musique.ts` (lecteur), `src/ui/Musique.tsx` (choix), champ `musique` des œuvres, `public/assets/musiques`, `public/assets/sons` ; sons d'origine dans `musee/sons/` (hors Git, voir son `LISEZ-MOI.txt`) |
| Écran d'accueil | `index.html` (styles, logo inséré par `logoDansLaPage` de `vite.config.ts`), `src/ui/Intro.tsx`, `src/ui/intro/`, `src/chargement.ts`, `store.intro` |
| Photos des cartouches | `public/assets/captures/<id>-maladie.webp` / `-manifeste.webp`, `capturesCartouches` (`oeuvres.ts`), outil `capturerCartouches` (`outils/capture.ts`) |

## 3. Points ouverts (détail dans `CLAUDE.md`)

- **À faire écouter et regarder à Ludovic** : volume de la musique (`VOLUME` 0,6) et des clics, durées des
  fondus, raccords des boucles ; l'écran d'accueil en ligne.
- **Écran d'accueil** : le logo avance par paliers, car deux tâches figent encore la page un instant (la
  construction de la spirale, 0,3 s, et l'envoi des images des cartes à la carte graphique, deux fois
  0,35 s). Piste : les étaler image par image, ou décoder les images hors de la page (worker).
- **Mobile** : premier écran, popups (qui défilent) et flèches à reprendre avec une maquette mobile.
- **Chiffres du popup Maladie** à faire valider (ACVR1 n'est pas le gène de l'acromégalie), lien Orphanet.
- **Points de vue** Maladie (main) et Manifeste (visage) à recadrer avec le popup ouvert à droite.
- Les autres œuvres n'ont ni capture, ni photos de cartouches, ni musique propre, ni titre de manifeste.
- Bundle principal de 1,3 Mo à découper ; vue Grille à faire.

## 4. Rappels pratiques

- **Serveur de développement :** `npm run dev` (http://localhost:5173 ; 5176 quand le port est pris).
- **Vérifier avant d'annoncer :** `npx tsc --noEmit`, `npm run build`, un coup d'œil dans le navigateur.
  Pour les performances, mesurer sur la version compilée (`npm run build` puis `npx vite preview`).
- **Panneau du navigateur intégré** : masqué ou en arrière-plan, il fige les animations et fausse les
  mesures (le remettre au premier plan). **Ludovic teste souvent en même temps** dans ce panneau : ses
  clics et scrolls se mêlent aux mesures.
- **Mettre en ligne sur le labo :** `npm run build`, copier `dist/` sans `.htaccess` ni les lightmaps WebP,
  ajouter une copie de `index.html` dans `oeuvre/<id>/` pour chaque œuvre et dans `a-propos/`, zipper, puis
  `lab_upload_zip` (labo `mmr-lab`, `clean: true`, envoi par l'adresse signée). Le labo a refusé un premier
  envoi le 30/10 (connexion à sa machine) : réessayer. GitHub a aussi renvoyé deux fois une erreur interne
  avant d'accepter : réessayer.
- **Nouveau son ou nouvelle musique :** Ludovic dépose le fichier dans `musee/sons/` ; le convertir avec
  `afconvert` (AAC pour les musiques, WAV mono pour les sons courts), couper silence et fondu de fin,
  aligner le volume (≈ −18 dB), passer l'adresse par `versionne()`.
- **Ludovic :** répondre en français, court ; montrer des captures ; ne marquer « validé » que sur son
  accord explicite ; enregistrer dans Git ou mettre en ligne seulement à sa demande (« enregistre, git,
  pousse sur toolbox »). Quand il dit « les clics », vérifier de quel son il parle (clic des boutons ou
  cliquetis : malentendu le 30/10).
