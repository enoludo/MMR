import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
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
    },
  }
}

export default defineConfig({
  plugins: [react(), enregistrementCaptures()],
  define: { __EMPREINTES__: JSON.stringify(empreintes()) },
  server: { open: true },
  // Mesures de performance sur le site compilé (npx vite preview) : profilage JavaScript autorisé
  preview: { headers: { 'Document-Policy': 'js-profiling' } },
})
