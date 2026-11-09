"""
Aperçu rapide du « pavillon » (plan de Ludovic du 05/11, plans/Fichier 2.svg, plan coté plans/salle-pavillon.html) :
quelques vues rendues directement (Cycles, peu d'échantillons et débruitage), sans précalcul de lumière.
Sert à juger les volumes avec Ludovic avant d'écrire la salle dans la chaîne (salle.py).

    blender -b --python-use-system-env -P apercu-pavillon.py -- [échantillons] [largeur] [vues…]

Images : plans/captures/pavillon-<vue>.png. Repère Blender : x vers l'est, y vers le nord, z en haut.
Mêmes cotes que plans/generer-plan-pavillon.py.
"""
import bpy, bmesh, sys, os, math, time
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ECHANTILLONS = int(argv[0]) if len(argv) > 0 else 64
LARGEUR = int(argv[1]) if len(argv) > 1 else 1280
VUES = argv[2:]
HERE = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(HERE, "..", "plans", "captures")

# --- Grande salle ---------------------------------------------------------------------------------
C, H = 40.0, 17.5
h = C / 2
T = 1.6                       # murs extérieurs épais (SVG), embrasures profondes
PORTE, TC, AMORCE = 4.0, 0.5, 4.0   # portes de 4 m ; amorce de couloir fermée de 4 m derrière le mur
BAIES = [(-13.0, -3.0), (3.0, 13.0)]
BAIE_H = 14.0
VITRE = 0.3                   # vitrage à 0,3 m de la face extérieure
MENEAU_PAS, TRAVERSE_PAS = 2.5, 3.5
MENEAU_E, MENEAU_P = 0.06, 0.35
TRAVERSE_P, DORMANT, DORMANT_P = 0.15, 0.12, 0.22
# Soleil proposé : du sud-est, bas (30°), voilé
SOLEIL_HAUTEUR, SOLEIL_ANGLE = 30.0, 4.0
SOLEIL = Vector((-math.cos(math.radians(SOLEIL_HAUTEUR)) / math.sqrt(2),
                 math.cos(math.radians(SOLEIL_HAUTEUR)) / math.sqrt(2),
                 -math.sin(math.radians(SOLEIL_HAUTEUR)))).normalized()

# --- Espace central -------------------------------------------------------------------------------
INT, EXT, PLAT, CONGE = 15.5, 18.971, 16.0, 1.0
OUV = 4 * math.sqrt(2)
H_INT, TOIT = 6.0, 1.0
SOCLE_R, SOCLE_H, GORGE_H, GORGE_R = 1.2, 0.8, 0.12, 0.10
LUEUR_FORCE, LUEUR_COULEUR = 6.0, (1.0, 0.86, 0.66, 1)
BANC_R, BANC_P, BANC_H = 6.47, 0.76, 0.45
BANCS = [(-45 - 22.5, -45 + 22.5), (135 - 22.5, 135 + 22.5)]
LAMPE_R, LAMPE_W, LAMPE_CONE = 2.0, 1500.0, 40.0   # lumière ronde au plafond, resserrée sur le socle (fort contraste)
GORGE_MUR_FORCE = 0.5               # gorge lumineuse discrète en haut des murs

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def lineaire(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def matiere(nom, couleur, rugosite=0.9, metal=0.0):
    m = bpy.data.materials.new(nom); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*couleur, 1); b.inputs["Roughness"].default_value = rugosite
    b.inputs["Metallic"].default_value = metal
    return m


def emission(nom, couleur, force):
    m = bpy.data.materials.new(nom); m.use_nodes = True
    e = m.node_tree.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = couleur; e.inputs["Strength"].default_value = force
    m.node_tree.links.new(e.outputs[0], m.node_tree.nodes["Material Output"].inputs["Surface"])
    return m


# Pierre entre beige et gris neutre (comme la salle du Seuil)
MUR = matiere("Mur", lineaire("#b8afa3"))
SOL = matiere("Sol", lineaire("#8c857b"), 0.6)
BANC = matiere("Banc", lineaire("#a59c90"))
ACIER = matiere("Acier", lineaire("#161616"), 0.45, 0.7)
DEHORS = matiere("Dehors", lineaire("#d9d2c6"), 0.95)
VERRE = bpy.data.materials.new("Verre"); VERRE.use_nodes = True
nt = VERRE.node_tree
for n in list(nt.nodes):
    if n.type != "OUTPUT_MATERIAL":
        nt.nodes.remove(n)
tr, gl, mx, fr = (nt.nodes.new(t) for t in ("ShaderNodeBsdfTransparent", "ShaderNodeBsdfGlossy", "ShaderNodeMixShader", "ShaderNodeFresnel"))
gl.inputs["Roughness"].default_value = 0.02; fr.inputs["IOR"].default_value = 1.5
nt.links.new(fr.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(gl.outputs[0], mx.inputs[2])
nt.links.new(mx.outputs[0], nt.nodes["Material Output"].inputs["Surface"])


def objet(nom, bm, mat):
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    me.materials.append(mat)
    return o


def aire(contour):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(contour, contour[1:] + contour[:1])) / 2


def prisme(nom, contour, z0, z1, mat=MUR):
    if aire(contour) < 0:
        contour = contour[::-1]
    bm = bmesh.new()
    bas = [bm.verts.new((x, y, z0)) for x, y in contour]
    haut = [bm.verts.new((x, y, z1)) for x, y in contour]
    bm.faces.new(bas[::-1]); bm.faces.new(haut)
    n = len(contour)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bas[i], bas[j], haut[j], haut[i]])
    return objet(nom, bm, mat)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def tourner(pts, quarts):
    for _ in range(quarts % 4):
        pts = [(-y, x) for x, y in pts]
    return pts


def cercle(r, n=96, cx=0, cy=0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def arc(a0, a1, r, pas=3.0):
    n = max(2, math.ceil(abs(a1 - a0) / pas))
    return [(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]


def conge(p, c, n, r=CONGE, k=8):
    def unit(a, b):
        l = math.hypot(b[0] - a[0], b[1] - a[1])
        return ((b[0] - a[0]) / l, (b[1] - a[1]) / l)
    u, v = unit(c, p), unit(c, n)
    theta = math.acos(max(-1, min(1, u[0] * v[0] + u[1] * v[1])))
    d = r / math.tan(theta / 2)
    t1 = (c[0] + u[0] * d, c[1] + u[1] * d)
    t2 = (c[0] + v[0] * d, c[1] + v[1] * d)
    return [((1 - s) ** 2 * t1[0] + 2 * (1 - s) * s * c[0] + s * s * t2[0],
             (1 - s) ** 2 * t1[1] + 2 * (1 - s) * s * c[1] + s * s * t2[1]) for s in [i / k for i in range(k + 1)]]


def moitie_pavillon():
    m = (INT / 2, INT / 2)
    d = OUV / 2 / math.sqrt(2)
    A = (m[0] + d, m[1] - d)
    B = (-INT / 2 + d, -INT / 2 - d)
    k = (EXT - INT) / 2
    A2, B2 = (A[0] + k, A[1] + k), (B[0] - k, B[1] - k)
    c = EXT - PLAT
    suite = [B2, (-c, -PLAT), (c, -PLAT), (PLAT, -c), (PLAT, c), A2]
    ext = [B2]
    for i in range(1, len(suite) - 1):
        ext += conge(suite[i - 1], suite[i], suite[i + 1])
    ext.append(A2)
    return [A, (INT, 0), (0, -INT), B] + ext, (A, (INT, 0), (0, -INT), B)


def contour_pavillon():
    c = EXT - PLAT
    coins = [(c, -PLAT), (PLAT, -c), (PLAT, c), (c, PLAT), (-c, PLAT), (-PLAT, c), (-PLAT, -c), (-c, -PLAT)]
    pts = []
    for i in range(8):
        pts += conge(coins[i - 1], coins[i], coins[(i + 1) % 8])
    return pts


# --- Grande salle : un bloc de pierre creusé ---------------------------------------------------------
bloc = prisme("Pierre", rect(-h - T, -h - T, h + T, h + T), -0.5, H + 0.8)
ajouts, outils = [], bpy.data.collections.new("Outils")


def outil(o):
    scn.collection.objects.unlink(o); outils.objects.link(o)


outil(prisme("Interieur", rect(-h, -h, h, h), 0, H))
for q in range(4):
    # porte et amorce de couloir fermée (le vrai couloir est calculé dans le site)
    ajouts.append(prisme(f"Couloir{q}", tourner(rect(h - PORTE - TC, h, h + TC, h + T + AMORCE + TC), q), -0.5, H + 0.8))
    outil(prisme(f"Porte{q}", tourner(rect(h - PORTE, h - 0.01, h, h + T + AMORCE), q), 0, H))
    for a, b in BAIES:
        outil(prisme(f"Baie{q}", tourner(rect(a, h - 0.01, b, h + T + 0.01), q), 0, BAIE_H))
for o in ajouts:
    m = bloc.modifiers.new("U", "BOOLEAN"); m.operation, m.solver, m.object = "UNION", "EXACT", o
m = bloc.modifiers.new("D", "BOOLEAN"); m.operation, m.solver = "DIFFERENCE", "EXACT"
m.operand_type, m.collection = "COLLECTION", outils
bpy.context.view_layer.objects.active = bloc
for m in list(bloc.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
for o in ajouts + list(outils.objects):
    bpy.data.objects.remove(o)
bloc.data.materials.append(SOL)
for p in bloc.data.polygons:
    if p.normal.z > 0.9 and abs(p.center.z) < 1e-3:
        p.material_index = 1
# Dehors : sol minéral clair, sous la salle
prisme("Dehors", rect(-300, -300, 300, 300), -0.6, -0.02, DEHORS)

# --- Baies : vitrage et huisseries en acier noir -------------------------------------------------------
yv = h + T - VITRE
bm_v = bmesh.new()
for q in range(4):
    for a, b in BAIES:
        pts = tourner([(a, yv), (b, yv)], q)
        vs = [bm_v.verts.new((x, y, z)) for (x, y), z in ((pts[0], 0), (pts[1], 0), (pts[1], BAIE_H), (pts[0], BAIE_H))]
        bm_v.faces.new(vs)
        pieces = [
            (a, yv - DORMANT_P + 0.05, a + DORMANT, yv + 0.05, 0, BAIE_H),               # dormant : montants
            (b - DORMANT, yv - DORMANT_P + 0.05, b, yv + 0.05, 0, BAIE_H),
            (a, yv - DORMANT_P + 0.05, b, yv + 0.05, BAIE_H - DORMANT, BAIE_H),          # haut
            (a, yv - DORMANT_P + 0.05, b, yv + 0.05, 0, 0.1),                            # seuil
        ]
        for i in range(1, round((b - a) / MENEAU_PAS)):
            x = a + i * MENEAU_PAS
            pieces.append((x - MENEAU_E / 2, yv - MENEAU_P, x + MENEAU_E / 2, yv + 0.03, 0.1, BAIE_H - DORMANT))
        for j in range(1, round(BAIE_H / TRAVERSE_PAS)):
            z = j * TRAVERSE_PAS
            pieces.append((a + DORMANT, yv - TRAVERSE_P, b - DORMANT, yv + 0.03, z - MENEAU_E / 2, z + MENEAU_E / 2))
        for x0, y0, x1, y1, z0, z1 in pieces:
            prisme("Huisserie", tourner(rect(x0, y0, x1, y1), q), z0, z1, ACIER)
objet("Vitrage", bm_v, VERRE)

# --- Espace central -------------------------------------------------------------------------------------
faces_int = []
for q in (0, 2):
    contour, interieur = moitie_pavillon()
    prisme(f"Pavillon{q}", tourner(contour, q), 0, H_INT)
    faces_int.append(tourner(list(interieur), q))
prisme("Toit", contour_pavillon(), H_INT, H_INT + TOIT)
for a0, a1 in BANCS:
    prisme("Banc", arc(a0, a1, BANC_R + BANC_P) + arc(a1, a0, BANC_R), 0, BANC_H, BANC)
# Socle de Huntington, sans la statue, et sa gorge lumineuse
prisme("Socle", cercle(SOCLE_R, 48), GORGE_H, SOCLE_H, BANC)
prisme("Pied", cercle(SOCLE_R - GORGE_R, 48), 0, GORGE_H, BANC)
bm = bmesh.new()
rl = SOCLE_R - GORGE_R + 0.01
bas = [bm.verts.new((rl * math.cos(2 * math.pi * k / 96), rl * math.sin(2 * math.pi * k / 96), 0.01)) for k in range(96)]
haut = [bm.verts.new(v.co + Vector((0, 0, GORGE_H - 0.03))) for v in bas]
for i in range(96):
    j = (i + 1) % 96
    bm.faces.new([bas[i], bas[j], haut[j], haut[i]])
objet("Lueur", bm, emission("Lueur", LUEUR_COULEUR, LUEUR_FORCE))
# Gorge lumineuse en haut des murs intérieurs (bande émissive tournée vers le centre)
bm = bmesh.new()
for pts in faces_int:
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        nx, ny = -(x0 + x1) / 2, -(y0 + y1) / 2
        l = math.hypot(nx, ny); nx, ny = nx / l * 0.03, ny / l * 0.03
        vs = [bm.verts.new((x + nx, y + ny, z)) for (x, y), z in (((x0, y0), H_INT - 0.45), ((x1, y1), H_INT - 0.45),
                                                                   ((x1, y1), H_INT - 0.3), ((x0, y0), H_INT - 0.3))]
        f = bm.faces.new(vs); f.normal_update()
        if f.normal.x * nx + f.normal.y * ny < 0:
            f.normal_flip()
objet("GorgeMurs", bm, emission("GorgeMurs", (1.0, 0.84, 0.62, 1), GORGE_MUR_FORCE))
# Lumière ronde au plafond, au-dessus du socle : disque lumineux et lampe surfacique
bm = bmesh.new()
f = bm.faces.new([bm.verts.new((x, y, H_INT - 0.02)) for x, y in cercle(LAMPE_R, 64)])
f.normal_update()
if f.normal.z > 0:
    f.normal_flip()
objet("Disque", bm, emission("Disque", (1.0, 0.9, 0.75, 1), 3.0))
ld = bpy.data.lights.new("Lampe", "AREA"); ld.shape = "DISK"; ld.size = 2 * LAMPE_R
ld.energy = LAMPE_W; ld.color = (1.0, 0.88, 0.72); ld.spread = math.radians(LAMPE_CONE)
lo = bpy.data.objects.new("Lampe", ld); scn.collection.objects.link(lo); lo.location = (0, 0, H_INT - 0.05)
for o in scn.objects:
    if o.type == "MESH":
        for p in o.data.polygons:
            p.use_smooth = False

# --- Soleil et ciel ---------------------------------------------------------------------------------------
sd = bpy.data.lights.new("Soleil", "SUN"); sd.energy = 5.0; sd.angle = math.radians(SOLEIL_ANGLE)
sd.color = lineaire("#fff1dc")
so = bpy.data.objects.new("Soleil", sd); scn.collection.objects.link(so)
so.rotation_euler = SOLEIL.to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("Ciel"); scn.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*lineaire("#c9d6e6"), 1); bg.inputs["Strength"].default_value = 1.0

# --- Rendu --------------------------------------------------------------------------------------------------
scn.render.engine = "CYCLES"
try:
    pr = bpy.context.preferences.addons["cycles"].preferences
    pr.compute_device_type = "METAL"; pr.get_devices()
    for d in pr.devices:
        d.use = True
    scn.cycles.device = "GPU"
except Exception as e:
    print("GPU indisponible :", e)
scn.cycles.samples = ECHANTILLONS; scn.cycles.max_bounces = 5; scn.cycles.sample_clamp_indirect = 3.0
scn.cycles.transparent_max_bounces = 8
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = LARGEUR, LARGEUR * 9 // 16
scn.view_settings.view_transform = "AgX"
# exposition du site (3,4) moins un écart : les baies font entrer bien plus de lumière que le puits
EXPO_ECART = 1.5
scn.view_settings.exposure = math.log2(3.4) - EXPO_ECART

cam_d = bpy.data.cameras.new("Camera"); cam_d.sensor_fit = "VERTICAL"
cam = bpy.data.objects.new("Camera", cam_d); scn.collection.objects.link(cam); scn.camera = cam


def polaire(r, a, z=1.7):
    return (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), z)


# (position, point regardé, champ vertical en degrés[, plan de coupe])
CAMERAS = {
    "entree": ((-17.6, -18.6, 1.7), (2, 2, 5), 60),            # en entrant par la porte sud
    "arrivee": (polaire(8.5, -135), (0, 0, 1.6), 60),          # vue d'arrivée proposée, dans l'espace central
    "dedans": (polaire(9.5, 45), (0, 0, 1.4), 70),             # depuis l'ouverture nord-est, vers le sud-ouest
    "galerie-est": ((17.6, 15.0, 1.7), (17.0, -10, 5), 65),    # entre l'espace central et le mur est
    "galerie-ouest": ((-17.6, 15.0, 1.7), (-17.0, -10, 5), 65),  # entre l'espace central et le mur ouest, vers le sud
    "baie": ((-8, -15.5, 1.7), (-8, -21.0, 6.5), 70),          # une baie sud de près
    # vus de dessus, plafond retiré par le plan de coupe de la caméra (lumière de la salle couverte)
    "dessus": ((0, 0, 70), (0, 0.001, 0), 42, 70 - H + 0.3),
    "dessus-centre": ((0, 0, 70), (0, 0.001, 0), 42, 70 - H_INT + 0.3),
}
os.makedirs(SORTIE, exist_ok=True)
for nom, (pos, cible, champ, *coupe) in CAMERAS.items():
    if VUES and nom not in VUES:
        continue
    cam_d.clip_start = coupe[0] if coupe else 0.05
    cam_d.clip_end = 1000
    cam.location = pos
    cam.rotation_euler = (Vector(cible) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    cam_d.angle = math.radians(champ)
    scn.render.filepath = os.path.join(SORTIE, f"pavillon-{nom}.png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print("VUE", nom, round(time.time() - t0), "s")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "pavillon-apercu.blend"))
print("OK")
