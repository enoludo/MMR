"""
Ombre de la statue seule (06/11) : rapport de la lumière du mobilier avec / sans la statue, en
niveaux de gris (1 = blanc = pas d'ombre de la statue), lu par le site pour le réglage « ombre de
la statue » (pierre.ts, touche M « Salle · <salle> »).

    blender -b -P ombre-statue.py -- avec-dn.exr sans-dn.exr masque.exr sortie.png

avec-dn.exr : lightmap-mobilier-dn.exr (chaîne habituelle) ; sans-dn.exr : la même, recalculée sans
la statue (sans-statue.py) puis débruitée avec le même masque. Le rapport est adouci îlot par
îlot (le bruit des deux calculs ne s'annule pas), les petits écarts autour de 1 sont effacés, et
il est étendu hors des îlots (lecture filtrée au bord). Même orientation que lightmap.py.
Pillow : voir PYTHONPATH dans chaine.sh.
"""
import sys, numpy as np, bpy
from PIL import Image

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
avec_f, sans_f, masque_f, dst = argv[:4]
RAYON = 3          # adoucissement (pixels de l'atlas)
SEUIL = 0.03       # écarts au-dessous : bruit, effacés


def lire(chemin):
    i = bpy.data.images.load(chemin); w, h = i.size
    a = np.empty(w * h * 4, np.float32); i.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[::-1]


def flou(a, r):
    """Moyenne glissante (2r + 1) sur les deux axes, deux fois (≈ gaussienne)"""
    for _ in range(2):
        for axe in (0, 1):
            p = np.pad(a, [(r + 1, r) if k == axe else (0, 0) for k in range(2)], mode="edge")
            c = np.cumsum(p, axis=axe, dtype=np.float64)
            a = ((np.take(c, range(2 * r + 1, c.shape[axe]), axis=axe) - np.take(c, range(0, c.shape[axe] - 2 * r - 1), axis=axe)) / (2 * r + 1)).astype(np.float32)
    return a


avec = lire(avec_f)[..., :3].mean(2)
sans = lire(sans_f)[..., :3].mean(2)
couvert = (lire(masque_f)[..., 0] > 0.5).astype(np.float32)

r = np.where(sans > 1e-5, avec / np.maximum(sans, 1e-5), 1.0)
r = np.clip(r, 0.0, 1.0) * couvert
poids = flou(couvert, RAYON)
r = np.where(poids > 1e-3, flou(r, RAYON) / np.maximum(poids, 1e-3), 1.0)
# Hors des îlots : prolongé depuis le bord (rayon plus large), 1 ailleurs
poids_l = flou(couvert, 8)
r_l = np.where(poids_l > 1e-3, flou(r * couvert, 8) / np.maximum(poids_l, 1e-3), 1.0)
r = np.where(couvert > 0.5, r, r_l)
d = np.clip((1.0 - r - SEUIL) / (1.0 - SEUIL), 0.0, 1.0)
r = 1.0 - d

Image.fromarray(np.clip(r * 255 + 0.5, 0, 255).astype(np.uint8), mode="L").save(dst, optimize=True)
dans = r[couvert > 0.5]
print("OMBRE min", float(dans.min()), "part < 0.9 :", float((dans < 0.9).mean()), "part < 1 :", float((dans < 1).mean()))
