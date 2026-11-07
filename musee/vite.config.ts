import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createWriteStream, readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

/** Empreinte du contenu de chaque fichier de public/models et public/assets, par adresse (voir src/version.ts) */
function empreintes() {
  const publicDir = path.resolve(__dirname, 'public')
  const resultat: Record<string, string> = {}
  for (const dossier of ['models', 'assets']) {
    for (const f of readdirSync(path.join(publicDir, dossier), { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || f.name.startsWith('.')) continue
      const chemin = path.join(f.parentPath, f.name)
      const adresse = '/' + path.relative(publicDir, chemin).split(path.sep).join('/')
      resultat[adresse] = createHash('sha1').update(readFileSync(chemin)).digest('hex').slice(0, 10)
    }
  }
  return resultat
}

/** Calcul de la lumière lancé par le bouton « Figer » de l'éclairage (voir /__eclairage) */
let calculEclairage: { etat: 'libre' | 'calcul' | 'fini' | 'erreur'; debut?: number; fin?: number; message?: string } = { etat: 'libre' }

/**
 * En développement seulement : enregistre dans public/assets/captures les fichiers envoyés
 * par l'outil de capture des salles (src/outils/capture.ts, `__visite.capturer()` dans la console).
 */
function enregistrementCaptures(): Plugin {
  const dossier = path.resolve(__dirname, 'public/assets/captures')
  return {
    name: 'enregistrement-captures',
    apply: 'serve',
    configureServer(serveur) {
      serveur.middlewares.use('/__capture', async (req, res) => {
        const nom = new URL(req.url ?? '', 'http://x').searchParams.get('fichier') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9-]+(\.webp|\.png|\.json|\.mp4)$/.test(nom)) {
          res.statusCode = 400
          return res.end('fichier refusé')
        }
        const morceaux: Buffer[] = []
        for await (const m of req) morceaux.push(m as Buffer)
        await mkdir(dossier, { recursive: true })
        await writeFile(path.join(dossier, nom), Buffer.concat(morceaux))
        res.end('ok')
      })
      // Réglages de la touche M propres à une salle (src/reglages.ts, ui/CopieReglages.tsx) : src/salles/reglages.json
      serveur.middlewares.use('/__reglages', async (req, res) => {
        const morceaux: Buffer[] = []
        for await (const m of req) morceaux.push(m as Buffer)
        try {
          const { salle, reglages } = JSON.parse(Buffer.concat(morceaux).toString())
          const valide = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string' || typeof v === 'boolean'
          if (req.method !== 'POST' || !/^[a-z0-9-]+$/.test(salle) || typeof reglages !== 'object' ||
            !Object.values(reglages).every((p) => typeof p === 'object' && p && Object.values(p).every(valide)))
            throw new Error('réglages refusés')
          const fichier = path.resolve(__dirname, 'src/salles/reglages.json')
          const tous = JSON.parse(await readFile(fichier, 'utf8'))
          tous[salle] = { ...tous[salle], ...reglages }
          await writeFile(fichier, JSON.stringify(tous, null, 2) + '\n')
          res.end('ok')
        } catch (e) {
          res.statusCode = 400
          res.end(String(e))
        }
      })
      // Éclairage réglé en direct puis figé (src/scene/EclairageDirect.tsx, pavillon, 07/11) : POST écrit
      // src/salles/pavillon/eclairage.json et lance le calcul (pavillon.py puis chaine.sh, ≈ 20 min, journal dans
      // blender/salle-pavillon/figer.log) ; GET donne l'état du calcul. Pillow pour chaine.sh : blender/.pylib.
      serveur.middlewares.use('/__eclairage', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET') return res.end(JSON.stringify(calculEclairage))
        const morceaux: Buffer[] = []
        for await (const m of req) morceaux.push(m as Buffer)
        try {
          const { salle, reglages: r } = JSON.parse(Buffer.concat(morceaux).toString())
          const couleur = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
          const nombre = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0
          if (req.method !== 'POST' || salle !== 'pavillon' || typeof r?.puits?.actif !== 'boolean' ||
            !nombre(r.puits.force) || !couleur(r.puits.couleur) || !nombre(r.puits.ouverture) ||
            typeof r.rubans?.actif !== 'boolean' || !nombre(r.rubans.force) || !couleur(r.rubans.couleur) ||
            !couleur(r.rubans.couleur2) || !nombre(r.rubans.melange) || r.rubans.melange > 1 || !(r.rubans.periode > 0) ||
            !nombre(r.lueur?.bleu) || !nombre(r.lueur?.rouge) || typeof r.couleurs !== 'object' ||
            !Object.entries(r.couleurs).every(([k, c]) => /^[A-Za-z]+$/.test(k) && couleur(c)))
            throw new Error('réglages refusés')
          if (calculEclairage.etat === 'calcul') throw new Error('un calcul est déjà en cours')
          await writeFile(path.resolve(__dirname, 'src/salles/pavillon/eclairage.json'), JSON.stringify(r, null, 2) + '\n')
          const dossier = path.resolve(__dirname, 'blender')
          const journal = createWriteStream(path.join(dossier, 'salle-pavillon', 'figer.log'))
          const blender = '/Applications/Blender.app/Contents/MacOS/Blender'
          const commande = `${blender} -b --python-use-system-env -P pavillon.py -- 2048 768 512 && ` +
            `PYLIB=${path.join(dossier, '.pylib')} ./chaine.sh 2048 pavillon`
          calculEclairage = { etat: 'calcul', debut: Date.now() }
          const p = spawn('/bin/zsh', ['-c', commande], { cwd: dossier })
          p.stdout.pipe(journal)
          p.stderr.pipe(journal)
          p.on('close', (code) => {
            calculEclairage = code === 0
              ? { etat: 'fini', debut: calculEclairage.debut, fin: Date.now() }
              : { etat: 'erreur', debut: calculEclairage.debut, fin: Date.now(), message: `code ${code}, voir blender/salle-pavillon/figer.log` }
          })
          res.end(JSON.stringify(calculEclairage))
        } catch (e) {
          res.statusCode = 400
          res.end(JSON.stringify({ erreur: String(e) }))
        }
      })
      // Points de vue réglés en vue libre (src/ui/VueLibre.tsx) : src/salles/points-de-vue.json
      serveur.middlewares.use('/__points-de-vue', async (req, res) => {
        const morceaux: Buffer[] = []
        for await (const m of req) morceaux.push(m as Buffer)
        try {
          const { salle, nom, point, flou } = JSON.parse(Buffer.concat(morceaux).toString())
          const nombres = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x))
          // Un point de vue, ou seulement sa profondeur de champ
          const flouValide = typeof flou?.actif === 'boolean' &&
            ['flou', 'nettete', 'miseAuPoint'].every((k) => Number.isFinite(flou[k]))
          if (req.method !== 'POST' || !/^[a-z0-9-]+$/.test(salle) || !['initiale', 'maladie', 'manifeste'].includes(nom) ||
            (!flouValide && (!nombres(point?.position) || !nombres(point?.cible)))) throw new Error('point de vue refusé')
          const fichier = path.resolve(__dirname, 'src/salles/points-de-vue.json')
          const tous = JSON.parse(await readFile(fichier, 'utf8'))
          const arrondi = (v: number[]) => v.map((x) => Math.round(x * 1000) / 1000)
          const { actif, flou: taille, nettete, miseAuPoint } = flou ?? {}
          tous[salle] = flouValide
            ? { ...tous[salle], flou: { ...tous[salle]?.flou, [nom]: { actif, flou: taille, nettete, miseAuPoint } } }
            : { ...tous[salle], [nom]: { position: arrondi(point.position), cible: arrondi(point.cible) } }
          await writeFile(fichier, JSON.stringify(tous, null, 2) + '\n')
          res.end('ok')
        } catch (e) {
          res.statusCode = 400
          res.end(String(e))
        }
      })
    },
  }
}

/** Logo de l'écran d'accueil écrit dans index.html (src/ui/intro/logo-mmr.svg) : visible dès la première image */
function logoDansLaPage(): Plugin {
  return {
    name: 'logo-dans-la-page',
    transformIndexHtml: (html) =>
      html.replace('<!--logo-mmr-->', readFileSync(path.resolve(__dirname, 'src/ui/intro/logo-mmr.svg'), 'utf8')),
  }
}

export default defineConfig({
  plugins: [react(), enregistrementCaptures(), logoDansLaPage()],
  define: { __EMPREINTES__: JSON.stringify(empreintes()) },
  server: { open: true },
  // Mesures de performance sur le site compilé (npx vite preview) : profilage JavaScript autorisé
  preview: { headers: { 'Document-Policy': 'js-profiling' } },
})
