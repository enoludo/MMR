import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
  server: { open: true },
  // Mesures de performance sur le site compilé (npx vite preview) : profilage JavaScript autorisé
  preview: { headers: { 'Document-Policy': 'js-profiling' } },
})
