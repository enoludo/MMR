"""
Rotonde (plan de Ludovic du 30/10, plans/planCercleColonne.svg ; décisions des 30 et 31/10 dans JOURNAL.md),
pour « La maladie de Huntington » : géométrie, précalcul de la lumière et export, comme salle.py.

    blender -b --python-use-system-env -P rotonde.py -- [resolution] [echantillons] [echantillons du mobilier]
    puis : PYLIB=… ./chaine.sh RES rotonde

Produit dans salle-rotonde/ : salle.blend, lightmap.exr, lightmap-mobilier.exr, salle-raw.glb
(objets « Salle », « Mobilier » et « Fentes », la paroi lumineuse des fentes, sans lightmap).
Mêmes cotes que l'aperçu (apercu-rotonde.py, plans/salle-rotonde.html) : les garder identiques.

Construction : un bloc de pierre creusé (booléens), puis découpé selon une grille régulière (GRILLE) :
sol, plafond, coupole et murs en petites faces, sans longs triangles en éventail (le précalcul y
ferait des dents de scie). Les colonnes, les bancs et le socle sont ôtés du volume creusé : pas de
sol caché sous eux (il resterait noir et déborderait en frange à leur pied).
Unités : mètres. Repère Blender : Z vers le haut (Y du site = Z Blender, Z du site = -Y Blender).
"""
import bpy, bmesh, sys, os, time, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
RES = int(argv[0]) if len(argv) > 0 else 1024
SAMPLES = int(argv[1]) if len(argv) > 1 else 128
SAMPLES_MOB = int(argv[2]) if len(argv) > 2 else SAMPLES
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "salle-rotonde")
os.makedirs(OUT, exist_ok=True)

# --- Paramètres (ceux de apercu-rotonde.py) ------------------------------------------------------
C, H = 40.0, 17.5
h = C / 2
R = 20.0                                   # rotonde tangente aux murs
PORTE, SAS = 4.0, 1.0                      # portes dans les angles ; sas fermé derrière (masqué par le site)
PIL_P, PIL_L, PIL_PENTE = 1.0, 4.2, 0.714  # pilastres au milieu des murs
# Fentes en L : de FENTE_BAS du sol jusqu'au plafond dans le pilastre, puis FENTE_PLAF au plafond vers le
# centre, chambre de FENTE_P au-dessus ; paroi lumineuse au fond (objet « Fentes »)
FENTE_L, FENTE_BAS, FENTE_PLAF, FENTE_FOND, FENTE_P = 0.6, 3.0, 5.0, 0.6, 3.0
FENTE_LUEUR = 2.5
COUPOLE_R, COUPOLE_H = 10.0, 7.0           # coupole : pied à 10 m du centre, 7 m au-dessus du plafond plat
PUITS_R, PUITS_P = 5.5, 3.0                # oculus de 11 m, centré, conduit de 3 m
LAME_E, LAME_H = 0.25, 1.5
VIDES = [v * (2 * PUITS_R - 6 * LAME_E) / 8.5 for v in [1.58, 0.85, 1.7, 0.97, 1.46, 0.73, 1.21]]
COL_R, COL_D = 13.0, 1.5                   # 8 colonnes : une tous les 30°, sauf dans les axes
COL_ANGLES = [a for a in range(0, 360, 30) if a % 90]
BANC_R, BANC_P, BANC_H = 6.47, 0.76, 0.45
BANCS = [(a - 22.5, a + 22.5) for a in (0, 90, 180, 270)]
SOCLE_R, SOCLE_H, GORGE_H, GORGE_R = 1.2, 0.8, 0.12, 0.10
LUEUR_FORCE, LUEUR_COULEUR = 6.0, (1.0, 0.95, 0.88, 1)  # blanc chaud (blanc froid avant le 05/11)
ENFONCE = 0.005
# Soleil propre à la salle, presque vertical (sud 4°, est 3°) : le faisceau de l'oculus centré tombe sur l'œuvre
SOLEIL = Vector((-math.tan(math.radians(3)), math.tan(math.radians(4)), -1.0)).normalized()
SOLEIL_ANGLE, SOLEIL_FORCE = 10.0, 5.0
CIEL_FORCE = 1.0
# Sol fin (atlas « Mobilier ») : carré autour de l'œuvre, où tombe toute la tache de l'oculus et son
# fondu, avec les bancs et le socle
SOL_FIN = 10.5
GRILLE = 1.5                               # pas de la grille de découpe (10,5 en est un multiple)

zc = ((PUITS_R ** 2 + (H + COUPOLE_H) ** 2) - (COUPOLE_R ** 2 + H ** 2)) / (2 * COUPOLE_H)
RHO = math.hypot(COUPOLE_R, H - zc)
TOIT = H + COUPOLE_H + PUITS_P
HAUT_FENTE = H + FENTE_P - 0.2             # chambre fermée : 20 cm de pierre au-dessus
FOND = h - PIL_P + FENTE_FOND              # fond de la fente, dans le pilastre
F0 = h - PIL_P - FENTE_PLAF                # bout de la fente au plafond

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

def lineaire(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    return m
# Albédos : ambiance « calcaire doré » (choix de Ludovic du 05/11 ; gris bleu avant), aussi
# lumineux que les anciens pour garder la pénombre ; le site les éclaircit un peu (touche M « Couleurs »)
MATS = [mat("Mur", lineaire("#c4b7a3")), mat("Sol", lineaire("#7d7163"), 0.6),
        mat("Plafond", lineaire("#bfb2a0")), mat("SolCentre", lineaire("#7d7163"), 0.61),
        mat("Banc", lineaire("#ad9f8c"))]
MUR, SOL, PLAF, SOL_C, BANC = range(5)
# SolCentre a une rugosité à peine différente de Sol : sinon gltf-transform fusionne les deux matières

def emission(nom, couleur, force):
    m = bpy.data.materials.new(nom); m.use_nodes = True
    e = m.node_tree.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = couleur; e.inputs["Strength"].default_value = force
    m.node_tree.links.new(e.outputs[0], m.node_tree.nodes["Material Output"].inputs["Surface"])
    return m
SOLEIL_COULEUR = lineaire("#fff0d8")  # blanc doré (#eef3ff, froid, avant le 05/11)
FENTE_MAT = emission("Fente", (*SOLEIL_COULEUR, 1), FENTE_LUEUR)

# --- Volumes ----------------------------------------------------------------------------------------
def objet(nom, bm):
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    return o

def prisme(nom, contour, z0, z1):
    bm = bmesh.new()
    bas = [bm.verts.new((x, y, z0)) for x, y in contour]
    haut = [bm.verts.new((x, y, z1)) for x, y in contour]
    bm.faces.new(bas[::-1]); bm.faces.new(haut)
    n = len(contour)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bas[i], bas[j], haut[j], haut[i]])
    return objet(nom, bm)

def revolution(nom, profil, n=180):
    """Solide de révolution autour de z ; profil : (r, z) de r > 0 jusqu'à r = 0 (pointe)."""
    bm = bmesh.new()
    anneaux = [[bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z)) for k in range(n)]
               for r, z in profil[:-1]]
    pointe = bm.verts.new((0, 0, profil[-1][1]))
    bm.faces.new(anneaux[0][::-1])
    for a, b in zip(anneaux, anneaux[1:]):
        for k in range(n):
            bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]])
    for k in range(n):
        bm.faces.new([anneaux[-1][k], anneaux[-1][(k + 1) % n], pointe])
    return objet(nom, bm)

def cercle(r, n=180, cx=0, cy=0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def arc(a0, a1, r=R, pas=2.0):
    n = max(2, math.ceil(abs(a1 - a0) / pas))
    return [(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]

def tourner(pts, quarts):
    for _ in range(quarts % 4):
        pts = [(-y, x) for x, y in pts]
    return pts

def booleen(o, op, cible):
    m = o.modifiers.new(op, "BOOLEAN"); m.operation, m.solver = op, "EXACT"
    if isinstance(cible, bpy.types.Collection):
        m.operand_type, m.collection = "COLLECTION", cible
    else:
        m.object = cible
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)

def collection(nom, objets):
    c = bpy.data.collections.new(nom)
    for o in objets:
        scn.collection.objects.unlink(o); c.objects.link(o)
    return c

def jeter(c):
    for o in list(c.objects):
        bpy.data.objects.remove(o)

# Contour de la salle (rotonde, pilastres, pans coupés vers les portes)
x0, y0 = R - PIL_P, PIL_L / 2
a_, b_, c_ = 1 + PIL_PENTE ** 2, 2 * (x0 + y0 * PIL_PENTE), x0 ** 2 + y0 ** 2 - R ** 2
u = (-b_ + math.sqrt(b_ ** 2 - 4 * a_ * c_)) / (2 * a_)
pil = (x0 + u, y0 + PIL_PENTE * u)
a_pil = math.degrees(math.atan2(pil[1], pil[0]))
quart = [(x0, 0), (x0, y0), pil] + arc(a_pil, math.degrees(math.atan2(12, 16)))[1:] + \
        [(h, h - PORTE), (h, h), (h - PORTE, h)] + arc(math.degrees(math.atan2(16, 12)), 90 - a_pil) + [(y0, x0)]
contour = [p for q in range(4) for p in tourner(quart, q)]

# Volume intérieur, moins les colonnes, les bancs et le socle (ils deviennent de la pierre pleine)
interieur = prisme("Interieur", contour, 0, H)
pleins = [prisme("Colonne", cercle(COL_D / 2, 48, COL_R * math.cos(math.radians(a)), COL_R * math.sin(math.radians(a))),
                 -1, H + 1) for a in COL_ANGLES]
pleins += [prisme("Banc", arc(a0, a1, BANC_R + BANC_P, 3) + arc(a1, a0, BANC_R, 3), -1, BANC_H) for a0, a1 in BANCS]
pleins += [prisme("Pied", cercle(SOCLE_R - GORGE_R, 96), -1, GORGE_H + 0.001), prisme("Socle", cercle(SOCLE_R, 96), GORGE_H, SOCLE_H)]
c_pleins = collection("Pleins", pleins)
booleen(interieur, "DIFFERENCE", c_pleins)
jeter(c_pleins)

# Oculus moins ses lames
oculus = prisme("Oculus", cercle(PUITS_R), H + 1, TOIT + 1)
lames, x = [], -PUITS_R
for v in VIDES[:-1]:
    x += v
    lames.append(prisme("Lame", [(x, -PUITS_R - 1), (x + LAME_E, -PUITS_R - 1), (x + LAME_E, PUITS_R + 1), (x, PUITS_R + 1)],
                        TOIT - LAME_H, TOIT))
    x += LAME_E
c_lames = collection("Lames", lames)
booleen(oculus, "DIFFERENCE", c_lames)
jeter(c_lames)

calotte = [(COUPOLE_R, H - 0.1)] + [(r, zc + math.sqrt(RHO ** 2 - r ** 2)) for r in [COUPOLE_R * (1 - k / 45) for k in range(46)]]
outils = [interieur, oculus, revolution("Coupole", calotte)]
for q in range(4):
    y_ = FENTE_L / 2
    outils.append(prisme(f"FenteMur{q}", tourner([(h - PIL_P - 0.01, -y_), (FOND, -y_), (FOND, y_), (h - PIL_P - 0.01, y_)], q),
                         FENTE_BAS, HAUT_FENTE))
    outils.append(prisme(f"FentePlafond{q}", tourner([(F0, -y_), (FOND, -y_), (FOND, y_), (F0, y_)], q), H - 0.1, HAUT_FENTE))
    # porte et sas fermé derrière elle
    outils.append(prisme(f"Porte{q}", tourner([(h - PORTE, h - 0.01), (h, h - 0.01), (h, h + SAS), (h - PORTE, h + SAS)], q), 0, H))
bloc = prisme("Pierre", [(-h - 5, -h - 5), (h + 5, -h - 5), (h + 5, h + 5), (-h - 5, h + 5)], -0.5, H + FENTE_P)
cheminee = prisme("Cheminee", cercle(COUPOLE_R + 1), H, TOIT)
booleen(bloc, "UNION", cheminee)
bpy.data.objects.remove(cheminee)
c_outils = collection("Outils", outils)
booleen(bloc, "DIFFERENCE", c_outils)
jeter(c_outils)

# --- Nettoyage, découpe en grille, matières -----------------------------------------------------------
bm = bmesh.new(); bm.from_mesh(bloc.data)
bpy.data.objects.remove(bloc)
bm.normal_update()
def exterieure(f):
    """Faces jamais vues de l'intérieur : dessous et côtés du bloc, dessus du toit, de la cheminée et des lames."""
    c, n = f.calc_center_median(), f.normal
    if c.z < -0.45 or abs(c.x) > h + 4.9 or abs(c.y) > h + 4.9:
        return True
    if n.z > 0.9 and c.z > H + 1:
        return True
    r = math.hypot(c.x, c.y)
    return c.z > H + FENTE_P - 0.01 and r > COUPOLE_R + 0.5 and abs(n.z) < 0.1 and (n.x * c.x + n.y * c.y) / r > 0.9
bmesh.ops.delete(bm, geom=[f for f in bm.faces if exterieure(f)], context="FACES")
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts[:], edges=bm.edges[:])
lignes = [k * GRILLE for k in range(-int((h + 5) / GRILLE), int((h + 5) / GRILLE) + 1)]
for v in lignes:
    for no in ((1, 0, 0), (0, 1, 0)):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(no) * v, plane_no=Vector(no), dist=1e-5)
# Murs et coupole hauts : découpés aussi en hauteur (bandes de 3 m)
for z in (3.0, 6.0, 9.0, 12.0, 15.0, H + 2.5, H + 5):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector((0, 0, z)), plane_no=Vector((0, 0, 1)), dist=1e-5)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
bm.normal_update()

def dans_repere_fente(c):
    """Position ramenée dans le repère de la fente est (q = 0), pour chacune des quatre fentes."""
    for q in range(4):
        x, y = tourner([(c.x, c.y)], -q)[0]
        if abs(y) <= FENTE_L / 2 + 1e-3:
            yield q, x, y

def matiere(f):
    c, n = f.calc_center_median(), f.normal
    for q, x, y in dans_repere_fente(c):
        nl = Vector((*tourner([(n.x, n.y)], -q)[0], n.z))
        if abs(x - FOND) < 1e-3 and nl.x < -0.9 and FENTE_BAS - 1e-3 < c.z < HAUT_FENTE + 1e-3:
            return "Fente"
        if abs(c.z - HAUT_FENTE) < 1e-3 and n.z < -0.9 and F0 - 1e-3 < x < FOND + 1e-3:
            return "Fente"
    if abs(c.z) < 1e-3 and n.z > 0.9:
        return SOL_C if abs(c.x) < SOL_FIN and abs(c.y) < SOL_FIN else SOL
    if math.hypot(c.x, c.y) < BANC_R + BANC_P + 0.1 and 1e-3 < c.z < SOCLE_H + 1e-3:
        return BANC
    if n.z < -0.3:
        return PLAF
    return MUR
groupes = {"Salle": bmesh.new(), "Mobilier": bmesh.new(), "Fentes": bmesh.new()}
def ajouter(dst, f, mi):
    vs = [dst.verts.new(v.co) for v in f.verts]
    nf = dst.faces.new(vs); nf.material_index = mi
for f in bm.faces:
    m = matiere(f)
    if m == "Fente":
        ajouter(groupes["Fentes"], f, 0)
    elif m in (SOL_C, BANC):
        ajouter(groupes["Mobilier"], f, m)
    else:
        ajouter(groupes["Salle"], f, m)
bm.free()

def finir(nom, b, materiaux, uv=True):
    bmesh.ops.remove_doubles(b, verts=b.verts[:], dist=1e-5)
    o = objet(nom, b)
    for m in materiaux:
        o.data.materials.append(m)
    if uv:
        o.data.uv_layers.new(name="lightmap")
        for x in scn.objects: x.select_set(False)
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(30), island_margin=8 / RES, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    return o
room = finir("Salle", groupes["Salle"], MATS)
mobilier = finir("Mobilier", groupes["Mobilier"], MATS)
fentes = finir("Fentes", groupes["Fentes"], [FENTE_MAT], uv=False)
print("FACES", len(room.data.polygons), len(mobilier.data.polygons), len(fentes.data.polygons))

# Sculpture : porte son ombre dans le précalcul (elle-même est éclairée en temps réel). Depuis le 03/11,
# la statue de Jeff (huntington-jeff.py) ; avant : huntington.blend (huntington.py)
with bpy.data.libraries.load(os.path.join(HERE, "sculpture-huntington", "huntington-jeff.blend")) as (src, dst):
    dst.objects = ["Sculpture"]
sc = dst.objects[0]; scn.collection.objects.link(sc)
sc.location.z = SOCLE_H - ENFONCE

# --- Lumière -------------------------------------------------------------------------------------------
sun_d = bpy.data.lights.new("Soleil", "SUN"); sun_d.energy = SOLEIL_FORCE; sun_d.angle = math.radians(SOLEIL_ANGLE)
sun_d.color = SOLEIL_COULEUR
sun = bpy.data.objects.new("Soleil", sun_d); scn.collection.objects.link(sun)
sun.rotation_euler = SOLEIL.to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("Ciel"); scn.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]
# Ciel à peine froid (#9fb6d6 avant le 05/11)
bg.inputs["Color"].default_value = (*lineaire("#b9c0c8"), 1); bg.inputs["Strength"].default_value = CIEL_FORCE
# Ruban lumineux dans la gorge du socle (précalculé seulement, comme dans salle.py)
rl = SOCLE_R - GORGE_R + 0.01
b = bmesh.new()
bas = [b.verts.new((rl * math.cos(2 * math.pi * k / 96), rl * math.sin(2 * math.pi * k / 96), 0.01)) for k in range(96)]
haut = [b.verts.new(v.co + Vector((0, 0, GORGE_H - 0.03))) for v in bas]
for i in range(96):
    j = (i + 1) % 96
    b.faces.new([bas[i], bas[j], haut[j], haut[i]])
lueur = objet("Lueur", b)
lueur.data.materials.append(emission("Lueur", LUEUR_COULEUR, LUEUR_FORCE))

# --- Précalcul ---------------------------------------------------------------------------------------
scn.render.engine = "CYCLES"; scn.cycles.device = "CPU"
# Carte graphique du Mac (Metal) avec le processeur, si elle est là : le précalcul complet prenait plus
# de 2 h sur le seul processeur d'un M1 occupé par ailleurs (31/10)
try:
    pr = bpy.context.preferences.addons["cycles"].preferences
    pr.compute_device_type = "METAL"; pr.get_devices()
    for d in pr.devices:
        d.use = True
    if any(d.type == "METAL" for d in pr.devices):
        scn.cycles.device = "GPU"
except Exception as e:
    print("GPU indisponible :", e)
# Lumière renvoyée bornée à 1 (3 dans salle.py) : les parois lumineuses des fentes, petites et vives,
# semaient des « lucioles » que le débruitage laissait en taches de grain (carrés sur les murs, 31/10)
scn.cycles.max_bounces = 5; scn.cycles.sample_clamp_indirect = 1.0
scn.render.bake.margin = 8
for obj, fichier, ech in ((room, "lightmap.exr", SAMPLES), (mobilier, "lightmap-mobilier.exr", SAMPLES_MOB)):
    scn.cycles.samples = ech
    img = bpy.data.images.new(fichier, RES, RES, float_buffer=True)
    for m in MATS:
        for n in list(m.node_tree.nodes):
            if n.type == "TEX_IMAGE": m.node_tree.nodes.remove(n)
        n = m.node_tree.nodes.new("ShaderNodeTexImage"); n.image = img; m.node_tree.nodes.active = n
    for o in scn.objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"})
    print("BAKE", obj.name, round(time.time() - t), "s")
    img.filepath_raw = os.path.join(OUT, fichier); img.file_format = "OPEN_EXR"; img.save()

for m in MATS:
    for n in list(m.node_tree.nodes):
        if n.type == "TEX_IMAGE": m.node_tree.nodes.remove(n)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "salle.blend"))

# Export (voir salle.py : image factice pour que l'exporteur écrive les UV de lightmap)
factice = bpy.data.images.new("factice", 4, 4)
for m in MATS:
    nt = m.node_tree; b_ = nt.nodes["Principled BSDF"]
    t_ = nt.nodes.new("ShaderNodeTexImage"); t_.image = factice
    u_ = nt.nodes.new("ShaderNodeUVMap"); u_.uv_map = "lightmap"
    nt.links.new(u_.outputs[0], t_.inputs[0]); nt.links.new(t_.outputs[0], b_.inputs["Emission Color"])
for o in scn.objects: o.select_set(o in (room, mobilier, fentes))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "salle-raw.glb"), export_format="GLB",
                          use_selection=True, export_materials="EXPORT", export_image_format="JPEG")
print("SOLEIL", tuple(round(c, 4) for c in SOLEIL))
print("OK")
