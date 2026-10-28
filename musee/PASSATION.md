# Passation — après les transitions spirale ↔ salles

Rédigée le 28/10/2026 (fin d'après-midi) par Claude Code, à la fin de la session « transitions ».
À lire après `CLAUDE.md` (contexte, décisions de Ludovic, architecture détaillée) et le haut de `JOURNAL.md`.
Remplace la passation du 28/10 au matin, qui préparait les transitions (elles sont faites).

**Prochaine étape :** pas encore choisie par Ludovic. Lui demander en début de session (pistes en section 6).

---

## 1. Où en est-on

Tout est fait, vérifié dans le navigateur (en développement et sur le site compilé), statut **[à voir]** : Ludovic a testé et réagi au fil de l'eau (« Super », « Top ! »), sans validation formelle.

**Les transitions entre la spirale (accueil) et les salles marchent dans les deux sens :**
- **Entrée** (« Découvrir ») : la spirale recentre la carte, le titre part lettre par lettre, la salle se prépare cachée dessous, puis la carte grandit jusqu'au plein écran avec toute la spirale. L'image s'ouvre dans son masque (×2 → ×1) et l'on avance déjà dedans (parallaxe calculée avec la profondeur d'une capture de la salle). L'image se fond ensuite dans la vraie 3D, qui poursuit le même mouvement jusqu'à la vue initiale. Le titre et les liens de la salle montent lettre par lettre.
- **Retour** (croix du titre, logo, menu « La collection ») : les textes de la salle repartent, la caméra rejoint la vue initiale, la salle est photographiée, la photo se réduit dans la carte de la spirale (recentrée sur l'œuvre quittée) en se fondant dans son image, puis le titre de la carte remonte lettre par lettre.
- **Raccords soignés aujourd'hui :** la vignette sombre de la salle et l'éclairage plus sombre des cartes de la spirale sont repris dans l'image de transition (plus de voile qui saute) ; la photo de la salle suit exactement le mouvement de l'image (plus de dédoublement) ; le retour démarre sans temps mort (≈ 0,07 s après la photo, contre 0,4 à 1,9 s).
- Seule « Le seuil des proportions » a une capture de sa salle (`public/assets/captures/`). Les autres œuvres font un zoom simple sur leur photo.

**Ce qui est en ligne :**
- **Fluidbook Toolbox, labo `mmr-lab`** : https://mmr-lab.labs.cubedesigners.com/ (dernière version). Mot de passe HTTP dans la fiche du labo ; filtre IP désactivé à la demande de Ludovic, noindex gardé.
- **Zip à héberger** : `~/MMR/musee-site-a-heberger-2026-10-28-v2.zip` (dernière version, `.htaccess` compris).
- **Vercel** (projet `mmr`) : **pas** mis à jour depuis le 27/10.

**Git :** `musee/` est suivi depuis aujourd'hui dans `enoludo/MMR` (racine `~/MMR`, branche `claude/spirale-interactive-gallery-b4mzwd`). Envoyé sur GitHub jusqu'au commit `a4dfe4e`. Les deux derniers commits (notes de mise en ligne, `ec0b4e2` et `2567c7f`) **et cette passation** sont seulement en local : les envoyer avec l'accord de Ludovic (`git push` depuis `~/MMR`).

## 2. Où est le code des transitions

| Fichier | Rôle |
|---|---|
| `src/transition.ts` | `entrer()`, `sortir()`, préchargement d'une œuvre (`prechargerOeuvre`) |
| `src/store.ts` | `transition` : sens, phase, cadre de la carte, photo |
| `src/ui/Transition.tsx` | déroulé phase par phase, durées (touche M, « Transitions »), la spirale suit la boîte |
| `src/ui/ToileTransition.ts` | canvas plein écran et son shader : masque, parallaxe (`surface()`), photo, vignette, éclairage |
| `src/entree.ts` | mouvement d'entrée commun à l'image et à la 3D (`avancee()`, `poseEntree`), `RECUL`, `ZOOM_CARTE` |
| `src/ui/apparition.ts` | textes de la salle lettre par lettre (`useApparition`) |
| `src/accueil/gallery/Overlay.js` | titre de la spirale : `cacher()` / `montrer()` |
| `src/accueil/Accueil.tsx` | recentrage, poignée de main du retour, spirale préparée cachée |
| `src/main.tsx` | spirale et salle rendues hors des routes, pour survivre au changement d'adresse |
| `src/outils/capture.ts` | (dev) capture d'une salle pour une nouvelle œuvre : `await __visite.capturer('<id>')` |

Phases : entrée `preparation` → `zoom` → `attente` → `fondu` ; retour `retour` → `photo` → `attente` → `zoom` → `fondu`. Le détail est dans `CLAUDE.md`, « Transitions spirale ↔ salle ».

## 3. Mettre en ligne

- **Labo `mmr-lab`** (outil `lab_upload_zip`, mode miroir `clean: true`, versionné) :
  1. `npm run build` ;
  2. copier `dist/` sans le `.htaccess` (refusé sur un labo « static ») ;
  3. y ajouter une copie de `index.html` dans `oeuvre/<id>/` pour chaque œuvre et dans `a-propos/` (sinon une adresse ouverte directement renvoie une erreur) ;
  4. zipper, demander l'URL d'envoi (`lab_upload_zip` sans contenu), envoyer avec `curl -F file=@…`.
- **Zip à héberger (Apache)** : contenu de `dist/` à la racine du zip, `.htaccess` compris, à servir à la racine d'un domaine.
- **Vercel** : `npx vercel --prod --yes` depuis `musee/`, ou `Mettre en ligne.command`.

## 4. Mettre au point

- `npm run dev` → http://localhost:5173. Avant d'annoncer : `npx tsc --noEmit`, `npm run build`, coup d'œil au navigateur.
- **Ralentir ou figer une transition** (console, dev) : importer gsap depuis l'URL exacte de `performance.getEntriesByType('resource')` (elle peut porter un `?t=` après un rechargement à chaud), puis `gsap.globalTimeline.timeScale(0)` pour figer, `1` pour reprendre. S'abonner à `store` (même méthode d'import) pour figer à une phase précise.
- **Isoler l'image ou la photo** pendant le retour : remplacer `obtenirToile().dessiner` par une version qui force `melange` (0 = image seule, 1 = photo seule).
- **Mesurer la fluidité comme en ligne** : `npm run build`, `npx vite preview`, mesurer les écarts entre images (`requestAnimationFrame`) et profiler (`new Profiler(...)`, autorisé par l'en-tête de `vite.config.ts`). Le navigateur intégré tourne à 30 images/s même au repos : raisonner en relatif.

## 5. Pièges rencontrés aujourd'hui

- **Une phase change une image avant l'adresse** (le store est synchrone, la navigation non) : tout ce qui dépend des deux à la fois doit tolérer cet état intermédiaire, sinon un composant est démonté puis recréé (c'était la cause du temps mort au retour).
- **Ne jamais démonter la salle ou créer un moteur de rendu pendant un mouvement** : perdre un contexte WebGL bloque ≈ 0,1 s, en créer un ≈ 0,2 s, compiler les shaders de la spirale ≈ 0,3 s (d'où `compileAsync`, le moteur de la spirale gardé, la salle démontée 1,5 s après le retour).
- **Toute modification de la salle, de sa lumière ou de la vue initiale** oblige à refaire la capture de « Le seuil » (sinon image et 3D ne se superposent plus).
- **Si l'éclairage de la spirale ou la vignette de la salle changent**, mettre à jour leur copie dans le shader de transition (`cardLighting`, fonction `vignette`).
- **SplitText et React** : un élément découpé en lettres doit être rendu vide par React et rempli en JavaScript (`apparition.ts`), sinon React et SplitText se disputent son contenu.
- Les erreurs de la console s'accumulent d'un rechargement à chaud à l'autre : recharger la page avant de conclure.
- Les labos Fluidbook ont un **filtre IP** (403 hors réseau Cubedesigners) et un mot de passe HTTP : la Toolbox voit le site répondre alors que Ludovic reçoit un 403.

## 6. Points ouverts et pistes pour la suite

**À faire valider par Ludovic (transitions) :** durées, force de la parallaxe, rendu sur mobile (rien n'a été essayé sur téléphone), délai entre le clic et le départ du zoom (≈ 1 s dans le navigateur intégré, le temps que la salle se prépare).

**Repris de `CLAUDE.md` :**
- chiffres du popup Maladie (« ACVR1 » ne correspond pas à l'acromégalie), lien Orphanet ;
- recadrage des vues Maladie (main) et Manifeste (visage) avec le popup ouvert ;
- réglages du couloir à fentes, bancs et rayons dans la salle agrandie ;
- mobile : le premier écran pousse l'œuvre vers le haut, le popup Maladie défile ;
- une seule salle provisoire pour toutes les œuvres ;
- ménage de `~/MMR/_to_delete/` et `musee/_a_supprimer/`.

**Pistes de prochaine étape à proposer :**
1. Captures de salle pour les autres œuvres (la transition avec parallaxe ne vaut aujourd'hui que pour « Le seuil »).
2. Vue Grille (Figma `58:207`) et écran d'intro (`118:1180`), encore à faire.
3. Passage sur mobile : transitions, premier écran, popups.
4. Son.
5. Découper le code principal (`index` de 1,3 Mo) pour un premier affichage plus rapide.
6. Mettre Vercel à jour, ou décider si le labo `mmr-lab` le remplace.
