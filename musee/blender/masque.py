"""
Masque des surfaces dans l'atlas de la lightmap (1 = pixel couvert par une face).

    python3 masque.py salle/salle.blend Salle 2048 salle/lightmap-masque.exr
    python3 masque.py salle/salle.blend Mobilier 1024 salle/lightmap-mobilier-masque.exr

Canal R : pixels couverts par une face. Canal G : « cœur » de chaque îlot, rétréci
de quelques pixels (jusqu'à 4, moins pour les petits îlots). denoise.py reconstruit
le bord des îlots depuis ce cœur : le bord sort du précalcul légèrement assombri,
ce qui ferait de fines coutures en pointillé aux jonctions entre surfaces.

5e argument « triangles » (rotonde.py : faces triangulées, îlots de toutes formes) : chaque triangle
est rastérisé, et le cœur est la couverture rétrécie d'un pixel. Canal B : numéro de l'îlot de chaque
pixel (1, 2, …), pour le lissage îlot par îlot (lissage.py).
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
TRIANGLES = len(argv) > 4 and argv[4] == "triangles"
for p in (me.polygons if not TRIANGLES else []):
    us = [uv[i].uv for i in p.loop_indices]
    u0, u1 = min(c.x for c in us), max(c.x for c in us)
    v0, v1 = min(c.y for c in us), max(c.y for c in us)
    x0, x1 = int(np.floor(u0 * res)), int(np.ceil(u1 * res))
    y0, y1 = int(np.floor(v0 * res)), int(np.ceil(v1 * res))
    m[max(y0, 0):min(y1, res), max(x0, 0):min(x1, res)] = 1  # lightmap_pack : îlots rectangulaires
    k = int(np.clip(min(x1 - x0, y1 - y0) // 6, 1, 4))
    coeur[max(y0 + k, 0):min(y1 - k, res), max(x0 + k, 0):min(x1 - k, res)] = 1
if not TRIANGLES:
    # Le cœur est aussi la couverture entière rétrécie de 4 pixels : seuls les vrais bords d'îlot sont
    # reconstruits, pas les jonctions entre faces voisines d'un même îlot (dalles du sol). Reconstruites,
    # elles faisaient des rayures en travers des dégradés d'ombre (vues par Ludovic le 05/11)
    interieur = m.copy()
    for _ in range(4):
        interieur = interieur * np.roll(interieur, 1, 0) * np.roll(interieur, -1, 0) * np.roll(interieur, 1, 1) * np.roll(interieur, -1, 1)
    coeur = np.maximum(coeur, interieur)
ilot = np.zeros((res, res), np.float32)
if TRIANGLES:
    # Îlots : faces reliées par une arête dont les deux côtés ont les mêmes UV
    parent = list(range(len(me.polygons)))
    def racine(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    cotes = {}
    for p in me.polygons:
        for li in p.loop_indices:
            lo = me.loops[li]
            suivant = me.loops[p.loop_indices[(list(p.loop_indices).index(li) + 1) % p.loop_total]]
            cle = tuple(sorted((lo.vertex_index, suivant.vertex_index)))
            uvs = {lo.vertex_index: tuple(round(c, 6) for c in uv[li].uv),
                   suivant.vertex_index: tuple(round(c, 6) for c in uv[suivant.index].uv)}
            if cle in cotes:
                q, uvq = cotes[cle]
                if uvq == uvs:
                    parent[racine(p.index)] = racine(q)
            else:
                cotes[cle] = (p.index, uvs)
    numeros = {}
    for p in me.polygons:
        t = np.array([[uv[i].uv.x * res, uv[i].uv.y * res] for i in p.loop_indices])
        x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, res), min(y1, res)
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        dedans = np.ones(gx.shape, bool)
        signe = np.sign((t[1, 0] - t[0, 0]) * (t[2, 1] - t[0, 1]) - (t[1, 1] - t[0, 1]) * (t[2, 0] - t[0, 0])) or 1
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            # demi-plan de chaque côté, élargi d'un demi-pixel (les pixels touchés par le bord comptent)
            cote = ((b[0] - a[0]) * (gy - a[1]) - (b[1] - a[1]) * (gx - a[0])) * signe
            dedans &= cote >= -0.5 * np.hypot(b[0] - a[0], b[1] - a[1])
        m[y0:y1, x0:x1][dedans] = 1
        ilot[y0:y1, x0:x1][dedans] = numeros.setdefault(racine(p.index), len(numeros) + 1)
    # Rétréci d'un pixel seulement : les îlots étroits (faces des colonnes, 5 pixels de large) disparaissaient
    # presque entièrement à 3 pixels et se reconstruisaient en carrés (31/10)
    coeur = m.copy()
    for _ in range(1):
        coeur = coeur * np.roll(coeur, 1, 0) * np.roll(coeur, -1, 0) * np.roll(coeur, 1, 1) * np.roll(coeur, -1, 1)
img = bpy.data.images.new("masque", res, res, float_buffer=True)
px = np.zeros((res, res, 4), np.float32); px[..., 0] = m; px[..., 1] = coeur; px[..., 2] = ilot; px[..., 3] = 1
img.pixels.foreach_set(px.ravel())
img.filepath_raw = dst; img.file_format = "OPEN_EXR"; img.save()
print("OK", int(m.sum()), "pixels couverts")
