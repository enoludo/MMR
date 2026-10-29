"""
« La maladie de Huntington » : silhouette humaine en mouvement, faite de plaques anguleuses,
dont des éclats se détachent et s'envolent (d'après la vignette de l'œuvre).

    blender -b -P huntington.py -- [aperçu.png]

Produit dans sculpture-huntington/ :
  - huntington.blend  : l'objet « Sculpture » (lu par salle.py pour l'ombre et l'occlusion)
  - huntington-raw.glb : l'œuvre seule, pieds à z = 0 (le site la pose sur son socle)

Unités : mètres, Z vers le haut, l'œuvre regarde vers -Y (le sud, côté de l'arrivée).
Hauteur de la silhouette : 2,70 m (2,20 m jusqu'au 29/10). Construction : un squelette posé, chaque membre est un
volume anguleux (enveloppe convexe de points jetés au hasard), couvert de plaques un peu
décollées (les jointures sombres dessinent les fragments), et des éclats volent autour du
haut du corps. Une seule matière, couleurs par sommet (bronze sombre et plaques dorées).
"""
import bpy, bmesh, sys, os, math, random
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
APERCU = argv[0] if argv else None
ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ICI, "sculpture-huntington")
os.makedirs(OUT, exist_ok=True)
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

# --- Squelette posé (m), d'après la vignette : une figure qui danse et se défait. Le buste penche
# sur sa droite (-x) et tourne un peu (épaule droite en arrière), la tête s'incline vers l'avant,
# le bras droit est tendu à l'horizontale, le bras gauche plié, la main au-dessus de l'épaule,
# la jambe droite porte, la gauche part en arrière, genou fléchi
J = {
    "bassin": (0.26, 0.02, 1.25), "ventre": (0.18, 0.03, 1.55), "poitrine": (0.04, 0.04, 1.86),
    "cou": (-0.09, 0.01, 2.18), "tete": (-0.18, -0.07, 2.51),
    "epaule_d": (-0.30, 0.10, 2.06), "coude_d": (-0.70, 0.06, 2.02), "main_d": (-1.10, -0.02, 2.10),
    "epaule_g": (0.27, -0.04, 2.13), "coude_g": (0.70, -0.18, 2.00), "main_g": (0.86, -0.36, 2.30),
    "hanche_d": (0.14, 0.02, 1.20), "genou_d": (0.06, -0.07, 0.64), "cheville_d": (0.02, 0.02, 0.10),
    "pied_d": (0.02, -0.21, 0.035),
    "hanche_g": (0.38, 0.02, 1.21), "genou_g": (0.42, -0.16, 0.78), "cheville_g": (0.62, 0.28, 0.56),
    "pied_g": (0.70, 0.46, 0.47),
}
J = {k: Vector(v) for k, v in J.items()}
# Os : (début, fin, rayon au début, rayon à la fin)
OS = [
    ("bassin", "ventre", 0.18, 0.14), ("ventre", "poitrine", 0.14, 0.22), ("poitrine", "cou", 0.22, 0.08),
    ("cou", "tete", 0.075, 0.065), ("epaule_d", "epaule_g", 0.15, 0.15),
    ("epaule_d", "coude_d", 0.10, 0.08), ("coude_d", "main_d", 0.075, 0.06),
    ("epaule_g", "coude_g", 0.10, 0.08), ("coude_g", "main_g", 0.075, 0.06),
    ("hanche_d", "hanche_g", 0.17, 0.17),
    ("hanche_d", "genou_d", 0.15, 0.10), ("genou_d", "cheville_d", 0.10, 0.065), ("cheville_d", "pied_d", 0.07, 0.05),
    ("hanche_g", "genou_g", 0.15, 0.10), ("genou_g", "cheville_g", 0.10, 0.065), ("cheville_g", "pied_g", 0.07, 0.05),
]

BRONZE = (0.27, 0.23, 0.19, 1.0)  # un peu plus clairs depuis le 29/10 : l'œuvre se lisait en silhouette
OR = (0.74, 0.62, 0.44, 1.0)
JOINT = (0.05, 0.045, 0.04, 1.0)

bm = bmesh.new()
couleur = bm.loops.layers.color.new("Col")


def peindre(faces, c):
    for f in faces:
        for l in f.loops:
            l[couleur] = c


def volume(points):
    """Enveloppe convexe de points : un volume à facettes, ajouté au maillage."""
    vs = [bm.verts.new(p) for p in points]
    r = bmesh.ops.convex_hull(bm, input=vs)
    # points restés à l'intérieur de l'enveloppe : retirés
    garde = {v for f in r["geom"] if isinstance(f, bmesh.types.BMFace) for v in f.verts}
    bmesh.ops.delete(bm, geom=[v for v in vs if v.is_valid and v not in garde], context="VERTS")
    return [f for f in r["geom"] if isinstance(f, bmesh.types.BMFace)]


def anneau(c, axe, r, n, jitter):
    """Points d'un anneau irrégulier autour de axe, centré en c."""
    a = axe.normalized()
    u = a.orthogonal().normalized()
    v = a.cross(u)
    pts = []
    for k in range(n):
        t = 2 * math.pi * (k + random.uniform(-0.25, 0.25)) / n
        rr = r * random.uniform(1 - jitter, 1 + jitter)
        pts.append(c + (u * math.cos(t) + v * math.sin(t)) * rr)
    return pts


# Volumes du corps, à facettes
coeurs = []
for a, b, ra, rb in OS:
    pa, pb = J[a], J[b]
    axe = pb - pa
    pts = []
    for t, r in ((0.0, ra), (0.5, (ra + rb) / 2 * 1.08), (1.0, rb)):
        pts += anneau(pa.lerp(pb, t), axe, r, 6, 0.22)
    coeurs += volume(pts)
# Tête : un caillou anguleux
tete = [J["tete"] + Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1.35))).normalized() * random.uniform(0.14, 0.17)
        for _ in range(24)]
coeurs += volume(tete)
# Mains : petits blocs
for m in ("main_d", "main_g"):
    coeurs += volume([J[m] + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.09 for _ in range(12)])
peindre(coeurs, JOINT)

# Plaques : chaque facette du corps est recouverte d'une plaque un peu plus petite, légèrement
# décollée et inclinée ; entre elles, le cœur sombre dessine les jointures des fragments
plaques = []
for f in list(coeurs):
    if f.calc_area() < 2e-4:
        continue
    c = f.calc_center_median()
    n = f.normal.copy()
    retrait = random.uniform(0.80, 0.90)
    leve = random.uniform(0.006, 0.022)
    bascule = Matrix.Rotation(random.uniform(-0.12, 0.12), 3, n.orthogonal())
    haut = [bm.verts.new(c + bascule @ ((l.vert.co - c) * retrait) + n * leve) for l in f.loops]
    bas = [bm.verts.new(v.co - n * 0.012) for v in haut]
    nouvelles = [bm.faces.new(haut)]
    for i in range(len(haut)):
        j = (i + 1) % len(haut)
        nouvelles.append(bm.faces.new([haut[j], haut[i], bas[i], bas[j]]))
    peindre(nouvelles, OR if random.random() < 0.33 else BRONZE)
    plaques += nouvelles

# Éclats : un nuage de plaques autour du haut du corps, plus dense du côté de la main gauche levée
# (+x) et qui s'élève en s'éloignant ; jamais dans le corps ni les uns dans les autres
segments = [(J[a], J[b], max(ra, rb)) for a, b, ra, rb in OS]


def ecart_au_corps(p):
    d = (p - J["tete"]).length - 0.2
    for a, b, r in segments:
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        d = min(d, (a + ab * t - p).length - r)
    return d


axe = Vector((0.15, 0.0, 0.0))
eclats = []
while len(eclats) < 36:
    t = random.gauss(0, 0.75) if random.random() < 0.65 else random.uniform(-math.pi, math.pi)
    r = random.uniform(0.3, 1.3)
    z = random.triangular(1.0, 2.8, 2.15) + 0.35 * max(0.0, r - 0.5)
    centre = axe + Vector((r * math.cos(t), 0.85 * r * math.sin(t), z))
    cote = random.uniform(0.07, 0.14)
    if ecart_au_corps(centre) < cote + 0.06 or any((centre - c).length < cote + k + 0.08 for c, k in eclats):
        continue
    eclats.append((centre, cote))
for centre, cote in eclats:
    rot = Matrix.Rotation(random.uniform(0, math.pi), 3, Vector((random.random(), random.random(), random.random())).normalized())
    coins = [Vector((sx * cote, sy * cote * random.uniform(0.6, 1.0), 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    e = 0.009
    haut = [bm.verts.new(centre + rot @ (p + Vector((0, 0, e)))) for p in coins]
    bas = [bm.verts.new(centre + rot @ (p - Vector((0, 0, e)))) for p in coins]
    faces = [bm.faces.new(haut), bm.faces.new(bas[::-1])]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new([haut[i], haut[j], bas[j], bas[i]]))
    peindre(faces, OR if random.random() < 0.4 else BRONZE)

bm.normal_update()
# Pieds au niveau 0 (le pied d'appui) : la silhouette fait 2,70 m de haut
zmin = min(v.co.z for v in bm.verts if (v.co - J["pied_d"]).length < 0.4)
for v in bm.verts:
    v.co.z -= zmin
haut_total = max(v.co.z for v in bm.verts if (v.co - J["tete"]).length < 0.4)
print("HAUTEUR", round(haut_total, 3), "FACES", len(bm.faces))

me = bpy.data.meshes.new("Sculpture"); bm.to_mesh(me); bm.free()
o = bpy.data.objects.new("Sculpture", me); scn.collection.objects.link(o)
mat = bpy.data.materials.new("Sculpture"); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.55
bsdf.inputs["Metallic"].default_value = 0.1  # sans reflets d'environnement dans le site, le métal assombrit
me.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "huntington.blend"))
for x in scn.objects: x.select_set(x is o)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "huntington-raw.glb"), export_format="GLB", use_selection=True)

if APERCU:
    # Aperçu rapide : vue de face (depuis le sud), œil à 1,70 m au-dessus du sol (socle de 80 cm)
    cam_d = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_d); scn.collection.objects.link(cam)
    cam.location = (0.0, -7.5, 0.9); cam.rotation_euler = (math.radians(93.5), 0, 0); cam_d.lens = 40
    # socle de 80 cm (le haut à z = 0), pour juger le cadrage
    bpy.ops.mesh.primitive_cylinder_add(radius=1.2, depth=0.8, location=(0, 0, -0.4), vertices=48)
    scn.camera = cam
    sol = bpy.data.lights.new("s", "SUN"); sol.energy = 4; ls = bpy.data.objects.new("s", sol)
    ls.rotation_euler = (math.radians(30), math.radians(-20), math.radians(10)); scn.collection.objects.link(ls)
    w = bpy.data.worlds.new("w"); scn.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.65, 0.7, 1)
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scn.render.resolution_x, scn.render.resolution_y = 968, 720
    scn.render.filepath = APERCU
    bpy.ops.render.render(write_still=True)
print("OK")
