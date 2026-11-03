"""
« La maladie de Huntington » : statue modélisée par Jeff (3ds Max, 03/11), qui remplace celle de
huntington.py. Même taille que l'ancienne : silhouette de 2,70 m des pieds au haut de la tête.

    blender -b -P huntington-jeff.py

Lit sculpture-huntington/huntington-jeff.glb (millimètres, un corps texturé et 10 éclats « moving »)
et produit dans sculpture-huntington/ :
  - huntington-jeff.blend   : l'objet « Sculpture » (lu par rotonde.py pour l'ombre du précalcul)
  - huntington-jeff-raw.glb : l'œuvre seule, en mètres, pieds à z = 0, centrée sur le socle

Puis, depuis musee/ :
  npx @gltf-transform/cli optimize blender/sculpture-huntington/huntington-jeff-raw.glb <tmp> \
      --compress meshopt --simplify false --texture-compress webp --texture-size 2048
  node blender/occlusion.mjs <tmp> public/models/huntington.glb 0.005
"""
import bpy, os
from mathutils import Vector, Matrix

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "sculpture-huntington")
HAUTEUR = 2.70  # silhouette de l'ancienne statue (huntington.py)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(DOSSIER, "huntington-jeff.glb"))
objets = [o for o in bpy.context.scene.objects if o.type == "MESH"]
corps = max(objets, key=lambda o: len(o.data.vertices))

# Transformations appliquées (les nœuds « Dummy » de 3ds Max), puis un seul objet
for o in objets:
    o.data.transform(o.matrix_world)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
for o in bpy.context.scene.objects:
    if o.type != "MESH":
        bpy.data.objects.remove(o)
pts = [v.co.copy() for v in corps.data.vertices]
zmin, zmax = min(p.z for p in pts), max(p.z for p in pts)
echelle = HAUTEUR / (zmax - zmin)
# Centre des pieds (le bas du corps) sur l'axe du socle
pieds = [p for p in pts if p.z < zmin + 0.06 * (zmax - zmin)]
cx = (min(p.x for p in pieds) + max(p.x for p in pieds)) / 2
cy = (min(p.y for p in pieds) + max(p.y for p in pieds)) / 2
mise = Matrix.Diagonal((echelle, echelle, echelle, 1)) @ Matrix.Translation((-cx, -cy, -zmin))
for o in objets:
    o.data.transform(mise)
bpy.ops.object.select_all(action="DESELECT")
for o in objets:
    o.select_set(True)
bpy.context.view_layer.objects.active = corps
bpy.ops.object.join()
corps.name = corps.data.name = "Sculpture"

tout = [v.co for v in corps.data.vertices]
print("ECHELLE", round(echelle, 6), "PIEDS", round(cx * echelle, 3), round(cy * echelle, 3))
print("BOITE", [round(min(p[i] for p in tout), 3) for i in range(3)], [round(max(p[i] for p in tout), 3) for i in range(3)])
print("PIEDS RAYON", round(max(Vector((p.x, p.y)).length for p in tout if p.z < 0.15), 3))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DOSSIER, "huntington-jeff.blend"))
bpy.ops.export_scene.gltf(filepath=os.path.join(DOSSIER, "huntington-jeff-raw.glb"), export_format="GLB",
                          use_selection=True, export_yup=True, export_apply=True)
