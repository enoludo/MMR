"""
« Souffle d'éclats » : poumons modélisés par le collègue de Ludovic (3ds Max, maillage d'origine Tripo, reçu le
06/11), qui remplacent ceux de souffle.py. Même encombrement que les anciens : 3,4 m de large au plus, 3,6 m de
haut au plus (de 1,15 à 4,75 m du sol dans le pavillon).

    blender -b -P poumons.py

Lit sculpture-souffle/poumons.glb (millimètres, deux maillages texturés : les poumons, les bronches) et produit
dans sculpture-souffle/ :
  - poumons.blend   : les objets « Verre » (poumons) et « Vaisseaux » (bronches), lus par pavillon.py pour la lueur
                      de l'œuvre dans le précalcul
  - poumons-raw.glb : l'œuvre seule, en mètres ; mêmes conventions que souffle.py : origine au centre, sous l'œuvre,
                      bas des poumons à LEVE au-dessus, face avant vers -y (sud), matières nommées « Verre » et
                      « Vaisseaux » (lues par le site, OeuvreVerre.tsx), avec les textures du collègue (couleur,
                      relief ; la texture métal / rugosité, inutile au verre du site, est laissée)

Puis, depuis musee/ :
  npx @gltf-transform/cli optimize blender/sculpture-souffle/poumons-raw.glb public/models/poumons.glb \
      --compress meshopt --simplify false --join false --texture-compress webp --texture-size 2048
"""
import bpy, os
from mathutils import Vector, Matrix

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "sculpture-souffle")
LARGEUR, HAUTEUR = 3.4, 3.6     # encombrement des anciens poumons (souffle.py)
LEVE = 0.35                     # bas de l'œuvre au-dessus de l'origine, comme souffle.py

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(DOSSIER, "poumons.glb"))
objets = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# Transformations appliquées (nœuds de 3ds Max, millimètres)
for o in objets:
    o.data.transform(o.matrix_world)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
    if o.type != "MESH":
        bpy.data.objects.remove(o)

# Les poumons : le maillage le plus profond ; les bronches : l'autre (trachée comprise)
def boite(o):
    pts = [v.co for v in o.data.vertices]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
poumons = max(objets, key=lambda o: (boite(o)[1] - boite(o)[0]).y)
bronches = next(o for o in objets if o is not poumons)

mins, maxs = zip(*(boite(o) for o in objets))
bas = Vector([min(m[i] for m in mins) for i in range(3)])
haut = Vector([max(m[i] for m in maxs) for i in range(3)])
echelle = min(LARGEUR / (haut.x - bas.x), HAUTEUR / (haut.z - bas.z))
# Centré sur les poumons en largeur et en profondeur
pb, ph = boite(poumons)
centre = Vector(((pb.x + ph.x) / 2, (pb.y + ph.y) / 2, bas.z))
transfo = Matrix.Translation((0, 0, LEVE)) @ Matrix.Scale(echelle, 4) @ Matrix.Translation(-centre)
for o in objets:
    o.data.transform(transfo)
    o.data.update()

poumons.name = poumons.data.name = "Verre"
bronches.name = bronches.data.name = "Vaisseaux"
poumons.active_material.name = "Verre"
bronches.active_material.name = "Vaisseaux"
# Texture métal / rugosité du collègue retirée (le verre du site ne la lit pas)
for o in objets:
    nt = o.active_material.node_tree
    for n in list(nt.nodes):
        if n.type == "TEX_IMAGE" and any(l.to_socket.name in ("Metallic", "Roughness") or l.to_node.type == "SEPARATE_COLOR"
                                         for s in n.outputs for l in s.links):
            nt.nodes.remove(n)

for o in objets:
    b, h = boite(o)
    print("OBJET", o.name, len(o.data.polygons), "faces, de", tuple(round(v, 3) for v in b), "à", tuple(round(v, 3) for v in h))
print("ÉCHELLE", round(echelle * 1000, 4), "(du millimètre au mètre)")

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(DOSSIER, "poumons.blend"))
for o in bpy.context.scene.objects:
    o.select_set(o in objets)
bpy.ops.export_scene.gltf(filepath=os.path.join(DOSSIER, "poumons-raw.glb"), export_format="GLB", use_selection=True,
                          export_materials="EXPORT", export_apply=True)
