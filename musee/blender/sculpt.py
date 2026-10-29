import bpy, bmesh, sys, os
from mathutils import Vector

import os
D = os.environ.get("SCULPT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "sculpture"))
TARGET_H = 8.0   # hauteur de la sculpture en mètres (œuvre monumentale)
RATIO = 0.4      # ~100K -> ~40K triangles

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=f"{D}/model.obj", forward_axis='NEGATIVE_Z', up_axis='Y')
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
obj.name = "Sculpture"
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# Décimation
m = obj.modifiers.new("dec", "DECIMATE"); m.ratio = RATIO
bpy.ops.object.modifier_apply(modifier="dec")
# L'allègement retourne ou replie quelques triangles : affichés d'un seul côté dans le site, ils y
# font des trous. On réoriente toutes les faces vers l'extérieur (les plis restants se corrigent à la
# main : voir JOURNAL.md du 28/10)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

# Mise à l'échelle + origine au pied, centrée
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
minz = min(v.z for v in bb); maxz = max(v.z for v in bb)
cx = (min(v.x for v in bb) + max(v.x for v in bb)) / 2
cy = (min(v.y for v in bb) + max(v.y for v in bb)) / 2
s = TARGET_H / (maxz - minz)
me = obj.data
for v in me.vertices:
    v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - minz) * s))
bpy.ops.object.shade_smooth()

# Matériau PBR (convention glTF : rm.G = rugosité, rm.B = métal)
mat = bpy.data.materials.new("Sculpture"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
def tex(name, cs):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(f"{D}/{name}.png"); n.image.colorspace_settings.name = cs
    return n
bc = tex("basecolor", "sRGB"); nt.links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
rm = tex("rm", "Non-Color"); sep = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(rm.outputs["Color"], sep.inputs["Color"])
nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
nm = tex("normal", "Non-Color"); nmap = nt.nodes.new("ShaderNodeNormalMap")
nt.links.new(nm.outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
me.materials.clear(); me.materials.append(mat)

print("TRIS", sum(len(p.vertices) - 2 for p in me.polygons), "scale", s)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=f"{D}/sculpture.blend")
bpy.ops.export_scene.gltf(filepath=f"{D}/sculpture-raw.glb", export_format='GLB', use_selection=True)
