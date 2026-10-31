"""
Lissage de la lightmap débruitée, îlot par îlot, qui garde les ombres (filtre bilatéral, rotonde).

    blender -b -P lissage.py -- lightmap-dn.exr lightmap-masque.exr sortie.exr [rayon] [sigma_lumiere]

La lumière renvoyée seule (colonnes, murs dans la pénombre) sort du précalcul en taches que le
débruitage n'efface pas (31/10, « je ne veux pas de toutes ces tâches ») : chaque pixel prend la
moyenne de ses voisins du même îlot (canal B du masque, voir masque.py), pondérée par la distance
(rayon en pixels) et par l'écart de lumière (en logarithme : sigma_lumiere) ; les vraies ombres et
les bords de lumière, bien plus contrastés que les taches, ne sont pas adoucis.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, masque, dst = argv[0], argv[1], argv[2]
RAYON = int(argv[3]) if len(argv) > 3 else 7
SIGMA_L = float(argv[4]) if len(argv) > 4 else 0.2

def lire(chemin):
    i = bpy.data.images.load(chemin); w, h = i.size
    a = np.empty(w * h * 4, np.float32); i.pixels.foreach_get(a)
    return i, a.reshape(h, w, 4)

img, a = lire(src)
_, m = lire(masque)
ilot = np.rint(m[..., 2]).astype(np.int32)
couvert = ilot > 0
rgb = a[..., :3].copy()
L = np.log(rgb.mean(2) + 1e-4)
h, w = L.shape
R = RAYON
sigma_s = R / 2
pad = lambda x: np.pad(x, [(R, R), (R, R)] + [(0, 0)] * (x.ndim - 2), mode="edge")
Lp, Ip, Cp = pad(L), pad(ilot), pad(rgb)
somme = np.zeros_like(rgb); poids = np.zeros_like(L)
for dy in range(-R, R + 1):
    for dx in range(-R, R + 1):
        d2 = dy * dy + dx * dx
        if d2 > R * R:
            continue
        ys, xs = slice(R + dy, R + dy + h), slice(R + dx, R + dx + w)
        wgt = np.exp(-d2 / (2 * sigma_s ** 2)) * np.exp(-((Lp[ys, xs] - L) ** 2) / (2 * SIGMA_L ** 2))
        wgt = wgt * (Ip[ys, xs] == ilot)
        somme += Cp[ys, xs] * wgt[..., None]
        poids += wgt
lisse = somme / np.maximum(poids, 1e-12)[..., None]
a[..., :3] = np.where(couvert[..., None], lisse, rgb)
img.pixels.foreach_set(a.ravel())
img.filepath_raw = dst; img.file_format = "OPEN_EXR"; img.save()
print("OK", dst, int(couvert.sum()), "pixels lissés, rayon", R, "sigma", SIGMA_L)
