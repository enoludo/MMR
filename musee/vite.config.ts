import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
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
        if (req.method !== 'POST' || !/^[a-z0-9-]+(\.webp|\.png|\.json)$/.test(nom)) {
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
