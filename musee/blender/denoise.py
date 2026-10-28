"""
Débruitage de la lightmap avec OpenImageDenoise (inclus dans Blender).

    python3 denoise.py salle/lightmap.exr salle/lightmap-dn.exr [salle/lightmap-masque.exr]
    (ou : blender -b -P denoise.py -- entree.exr sortie.exr [masque.exr])

Avec le masque (voir masque.py), quelques pixels du bord de chaque îlot sont
reconstruits depuis l'intérieur avant débruitage : plus de coutures.

Permet de précalculer avec peu d'échantillons (donc vite) tout en gardant
une lumière lisse.
"""
import bpy, sys
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
src, dst = argv[0], argv[1]
masque = argv[2] if len(argv) > 2 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
img = bpy.data.images.load(src)

# Le fond de l'atlas (hors surfaces) est noir : on le remplit par extension des
# bords, sinon le débruiteur « bave » du noir sur les bords et crée des coutures.
w, h = img.size
px = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(px)
a = px.reshape(h, w, 4)
ok = a[..., :3].max(2) > 1e-6
couvert = None
if masque:
    mi = bpy.data.images.load(masque)
    mp = np.empty(w * h * 4, np.float32); mi.pixels.foreach_get(mp)
    mp = mp.reshape(h, w, 4)
    couvert = mp[..., 0] > 0.5
    coeur_masque = mp[..., 1] > 0.5
def remplir(a, ok):
    """Étend les pixels valides (ok) vers les autres, de proche en proche."""
    ok = ok.copy()
    for _ in range(256):
        if ok.all():
            break
        somme = np.zeros_like(a[..., :3]); n = np.zeros(ok.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            somme += np.roll(np.roll(a[..., :3] * ok[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(ok, dy, 0), dx, 1)
        neuf = (~ok) & (n > 0)
        a[neuf, :3] = somme[neuf] / n[neuf, None]
        ok = ok | neuf

remplir(a, ok)
a[..., 3] = 1
img.pixels.foreach_set(a.ravel())
import os, tempfile
tmp = os.path.join(tempfile.gettempdir(), 'lightmap-rempli.exr')
img.filepath_raw = tmp; img.file_format = 'OPEN_EXR'; img.save()
img = bpy.data.images.load(tmp)
scn.render.resolution_x, scn.render.resolution_y = img.size
scn.render.resolution_percentage = 100
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera = cam
scn.render.engine = "BLENDER_WORKBENCH"

ng = bpy.data.node_groups.new("debruitage", "CompositorNodeTree")
scn.compositing_node_group = ng
n_img = ng.nodes.new("CompositorNodeImage"); n_img.image = img
n_dn = ng.nodes.new("CompositorNodeDenoise")
out = ng.nodes.new("NodeGroupOutput")
ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
ng.links.new(n_img.outputs[0], n_dn.inputs[0])
n_dn.inputs['HDR'].default_value = True
n_dn.inputs['Quality'].default_value = 'High'
ng.links.new(n_dn.outputs[0], out.inputs[0])
scn.render.image_settings.file_format = "OPEN_EXR"
scn.render.image_settings.color_depth = "32"
scn.render.filepath = dst
bpy.ops.render.render(write_still=True)

# 2) après débruitage : quelques pixels du bord de chaque îlot sont reconstruits depuis
#    l'intérieur (lisse), et le fond de l'atlas aussi.
if couvert is not None:
    coeur = coeur_masque
    res = bpy.data.images.load(dst)
    b = np.empty(w * h * 4, np.float32); res.pixels.foreach_get(b); b = b.reshape(h, w, 4)
    remplir(b, coeur)
    b[..., 3] = 1
    res.pixels.foreach_set(b.ravel()); res.filepath_raw = dst; res.file_format = "OPEN_EXR"; res.save()
print("OK", dst)
