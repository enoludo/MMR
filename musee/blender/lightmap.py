"""
Lightmap EXR (lumière reçue, linéaire) -> image web 8 bits.

    python3 lightmap.py salle/lightmap.exr ../public/models/salle-lightmap.webp

La lumière est divisée par une valeur d'échelle (le percentile 99,95, pour ne
pas écrêter les taches de soleil), puis encodée sur une courbe logarithmique :
  v = log(1 + K·x) / log(1 + K)
Cette courbe garde beaucoup de précision dans les ombres profondes (pas de
paliers visibles), avec un léger tramage pour casser les derniers paliers.
L'image est enregistrée sans perte. Le script écrit l'échelle et K dans un
.json à côté de l'image : le site s'en sert pour décoder (voir pierre.ts).
"""
import sys, json, numpy as np, bpy
from PIL import Image

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, dst = argv[0], argv[1]
img = bpy.data.images.load(src); w, hh = img.size
px = np.empty(w * hh * 4, np.float32); img.pixels.foreach_get(px)
a = px.reshape(hh, w, 4)[::-1, :, :3]
lum = a.mean(2)
echelle = float(np.percentile(lum[lum > 1e-4], 99.95))
K = 2000.0
x = np.clip(a / echelle, 0, 1)
v = np.log1p(K * x) / np.log1p(K)
rng = np.random.default_rng(1)
tramage = (rng.random(v.shape) - rng.random(v.shape)) / 255.0   # tramage triangulaire ±1 niveau
im = Image.fromarray(np.clip((v + tramage) * 255 + 0.5, 0, 255).astype(np.uint8))
im.save(dst, lossless=True) if dst.endswith(".webp") else im.save(dst)
json.dump({"echelle": round(echelle, 4), "k": K, "mediane": round(float(np.median(lum[lum > 1e-4])), 4)},
          open(dst.rsplit(".", 1)[0] + ".json", "w"))
print("echelle", echelle, "mediane", np.median(lum[lum > 1e-4]))
