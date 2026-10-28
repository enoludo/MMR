"""
Masque des surfaces dans l'atlas de la lightmap (1 = pixel couvert par une face).

    python3 masque.py salle/salle.blend Salle 2048 salle/lightmap-masque.exr
    python3 masque.py salle/salle.blend Mobilier 1024 salle/lightmap-mobilier-masque.exr

Canal R : pixels couverts par une face. Canal G : « cœur » de chaque îlot, rétréci
de quelques pixels (jusqu'à 4, moins pour les petits îlots). denoise.py reconstruit
le bord des îlots depuis ce cœur : le bord sort du précalcul légèrement assombri,
ce qui ferait de fines coutures en pointillé aux jonctions entre surfaces.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, nom, res, dst = argv[0], argv[1], int(argv[2]), argv[3]
bpy.ops.wm.open_mainfile(filepath=src)
me = bpy.data.objects[nom].data
uv = me.uv_layers["lightmap"].data
m = np.zeros((res, res), np.float32)
coeur = np.zeros((res, res), np.float32)
for p in me.polygons:
    us = [uv[i].uv for i in p.loop_indices]
    u0, u1 = min(c.x for c in us), max(c.x for c in us)
    v0, v1 = min(c.y for c in us), max(c.y for c in us)
    x0, x1 = int(np.floor(u0 * res)), int(np.ceil(u1 * res))
    y0, y1 = int(np.floor(v0 * res)), int(np.ceil(v1 * res))
    m[max(y0, 0):min(y1, res), max(x0, 0):min(x1, res)] = 1  # lightmap_pack : îlots rectangulaires
    k = int(np.clip(min(x1 - x0, y1 - y0) // 6, 1, 4))
    coeur[max(y0 + k, 0):min(y1 - k, res), max(x0 + k, 0):min(x1 - k, res)] = 1
img = bpy.data.images.new("masque", res, res, float_buffer=True)
px = np.zeros((res, res, 4), np.float32); px[..., 0] = m; px[..., 1] = coeur; px[..., 3] = 1
img.pixels.foreach_set(px.ravel())
img.filepath_raw = dst; img.file_format = "OPEN_EXR"; img.save()
print("OK", int(m.sum()), "pixels couverts")
