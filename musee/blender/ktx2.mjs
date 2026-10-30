/**
 * Lightmap WebP (sortie de lightmap.py) -> KTX2, format compressé que la carte graphique lit tel
 * quel : envoi sans arrêt de l'image à l'arrivée dans une salle, et 4 fois moins de mémoire.
 *
 *     PYLIB=<dossier de Pillow> node blender/ktx2.mjs public/models/salle-lightmap.webp [sortie.ktx2]
 *
 * Mode UASTC (le plus fidèle de Basis Universal), effort 2 sur 4 (NIVEAU ; 4 prend plus de 10 min par image), sans optimisation qui dégrade
 * l'image (RDO), données linéaires (l'encodage logarithmique est décodé dans les shaders),
 * niveaux de détail précalculés, compression sans perte du fichier (Zstandard).
 * Le décodage du WebP passe par Pillow (le Python de Blender, comme lightmap.py).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { encodeToKTX2 } from 'ktx2-encoder'

const [entree, sortie = entree.replace(/\.\w+$/, '.ktx2')] = process.argv.slice(2)
const PYTHON = '/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13'

// Pixels bruts RGBA (8 bits par canal), dans l'ordre du fichier (première ligne en haut)
function decoder() {
  const brut = path.join(mkdtempSync(path.join(tmpdir(), 'ktx2-')), 'image.rgba')
  const dims = execFileSync(
    PYTHON,
    ['-c', 'import sys;from PIL import Image;i=Image.open(sys.argv[1]).convert("RGBA");open(sys.argv[2],"wb").write(i.tobytes());print(i.width,i.height)', entree, brut],
    { env: { ...process.env, PYTHONPATH: process.env.PYLIB ?? '' } },
  )
  const [width, height] = String(dims).trim().split(' ').map(Number)
  return { width, height, data: new Uint8Array(readFileSync(brut)) }
}

const image = decoder()
const ktx2 = await encodeToKTX2(new Uint8Array(0), {
  isUASTC: true,
  uastcLDRQualityLevel: Number(process.env.NIVEAU ?? 2),
  enableRDO: false,
  needSupercompression: true,
  isPerceptual: false,
  isKTX2SRGBTransferFunc: false,
  generateMipmap: true,
  imageDecoder: async () => image,
})
writeFileSync(sortie, ktx2)
console.log(`${sortie} : ${image.width} × ${image.height}, ${(ktx2.byteLength / 1048576).toFixed(2)} Mo`)
