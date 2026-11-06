"""
Lumière du mobilier (sol du centre, socle, bancs) précalculée SANS la statue (06/11, demande de
Ludovic : régler à part l'ombre de la statue, touche M « Salle · <salle> », « ombre de la statue »).

Reprend le salle.blend produit par salle.py ou rotonde.py (mêmes objets, même soleil, mêmes UV),
retire la statue et refait le seul précalcul du mobilier : l'ombre de la statue (soleil presque
au zénith) ne sort pas du sol du centre. Ensuite : denoise.py (même masque), puis ombre-statue.py
qui écrit le rapport avec / sans statue lu par le site.

  Blender -b --python-use-system-env -P sans-statue.py -- <dossier> <échantillons> <limite indirecte>
  dossier : salle (le Seuil, limite 3) ou salle-rotonde (Huntington, limite 1) ; 2048 échantillons
  Produit <dossier>/lightmap-mobilier-sans.exr
"""
import bpy, os, sys, time

argv = sys.argv[sys.argv.index("--") + 1:]
HERE = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(HERE, argv[0])
SAMPLES = int(argv[1]) if len(argv) > 1 else 2048
LIMITE = float(argv[2]) if len(argv) > 2 else 3.0

bpy.ops.wm.open_mainfile(filepath=os.path.join(DOSSIER, "salle.blend"))
scn = bpy.context.scene
sculpture = bpy.data.objects["Sculpture"]
bpy.data.objects.remove(sculpture, do_unlink=True)
mobilier = bpy.data.objects["Mobilier"]

# Mêmes réglages que salle.py / rotonde.py
scn.render.engine = "CYCLES"; scn.cycles.device = "CPU"
try:
    pr = bpy.context.preferences.addons["cycles"].preferences
    pr.compute_device_type = "METAL"; pr.get_devices()
    for d in pr.devices:
        d.use = True
    if any(d.type == "METAL" for d in pr.devices):
        scn.cycles.device = "GPU"
except Exception as e:
    print("GPU indisponible :", e)
scn.cycles.samples = SAMPLES; scn.cycles.max_bounces = 5; scn.cycles.sample_clamp_indirect = LIMITE
scn.render.bake.margin = 8

# Même taille que la lightmap avec statue
avec = bpy.data.images.load(os.path.join(DOSSIER, "lightmap-mobilier.exr"))
RES = avec.size[0]
img = bpy.data.images.new("lightmap-mobilier-sans", RES, RES, float_buffer=True)
mats = {s.material for o in scn.objects if o.type == "MESH" for s in o.material_slots if s.material}
for m in mats:
    if not m.use_nodes:
        continue
    for n in list(m.node_tree.nodes):
        if n.type == "TEX_IMAGE": m.node_tree.nodes.remove(n)
    n = m.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img; m.node_tree.nodes.active = n
for o in scn.objects: o.select_set(False)
mobilier.select_set(True); bpy.context.view_layer.objects.active = mobilier
t = time.time()
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"})
print("BAKE sans statue", round(time.time() - t), "s")
img.filepath_raw = os.path.join(DOSSIER, "lightmap-mobilier-sans.exr"); img.file_format = "OPEN_EXR"; img.save()
