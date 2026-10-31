"""
Aperçu rapide de la rotonde (plan de Ludovic du 30/10, plans/planCercleColonne.svg, 1 m = 10 px) :
quelques vues rendues directement (Cycles, peu d'échantillons et débruitage), sans précalcul de lumière.
Sert à régler la géométrie avec Ludovic avant de l'écrire dans la chaîne (salle.py).

    blender -b --python-use-system-env -P apercu-rotonde.py -- [échantillons] [largeur] [vues…]

Images : plans/captures/rotonde-<vue>.png. Repère Blender : x vers l'est, y vers le nord, z en haut.
Essais sur « La maladie de Huntington » (décision de Ludovic du 30/10), avec les couleurs bleutées de sa salle.
"""
import bpy, bmesh, sys, os, math, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ECHANTILLONS = int(argv[0]) if len(argv) > 0 else 64
LARGEUR = int(argv[1]) if len(argv) > 1 else 1280
VUES = argv[2:]
HERE = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(HERE, "..", "plans", "captures")

# --- Géométrie relevée sur le SVG (en m, origine au centre de la salle) ---------------------
C, H = 40.0, 17.5            # carré de 40 m, hauteur sous plafond inchangée (hors coupole)
h = C / 2
R = 20.0                     # rotonde : cercle de 40 m de diamètre, tangent aux quatre murs
# Pans coupés vers les portes (à 45°) : ils partent du cercle en (12, 16) et (16, 12) (angles 53° et 37°)
# et rejoignent les murs de part et d'autre d'un carré de 4 × 4 m dans l'angle, où est la porte
PORTE = 4.0
# Pilastre au milieu de chaque mur : 1 m de saillie, 4,2 m de large côté salle, côtés évasés vers le mur
PIL_P, PIL_L, PIL_PENTE = 1.0, 4.2, 0.714
# Fente en L dans chaque pilastre (décision de Ludovic du 31/10) : elle part de FENTE_BAS du sol, monte dans
# le pilastre jusqu'au plafond, puis longe le plafond vers le centre sur FENTE_PLAF. Largeur FENTE_L ;
# FENTE_FOND de profondeur dans le pilastre ; au-dessus du plafond, une chambre de FENTE_P de haut.
# Derrière, une paroi lumineuse (fond de la fente et haut de la chambre) : la fente se lit comme un trait
# de lumière, qui éclaire doucement la salle
FENTE_L, FENTE_BAS, FENTE_PLAF, FENTE_FOND, FENTE_P = 0.6, 3.0, 5.0, 0.6, 3.0
FENTE_LUEUR = 2.5          # intensité de la paroi lumineuse (émission Cycles)
# Coupole à l'intérieur du cercle des colonnes, sans reposer sur elles (décisions de Ludovic du 30/10) :
# calotte sphérique qui part du plafond plat à COUPOLE_R du centre (3 m de plafond plat au-dessus des
# colonnes) et monte de COUPOLE_H jusqu'au bord de l'oculus
COUPOLE_R, COUPOLE_H = 10.0, 7.0
PUITS_R, PUITS_P = 5.5, 3.0  # oculus rond de 11 m, centré (comme sur le plan), conduit de 3 m au-dessus
LAME_E, LAME_H = 0.25, 1.5   # 6 lames nord-sud en haut de l'oculus, rythme de la salle carrée mis à 11 m
VIDES = [v * (2 * PUITS_R - 6 * LAME_E) / 8.5 for v in [1.58, 0.85, 1.7, 0.97, 1.46, 0.73, 1.21]]
# 8 colonnes rondes de 1,5 m sur un cercle de 13 m, une tous les 30° sauf dans les axes (retirées le 31/10 :
# elles arrêtaient la lumière des fentes)
COL_R, COL_D, COL_N, COL_A0 = 13.0, 1.5, 12, 0.0
COL_AXES = False
BANC_R, BANC_P, BANC_H = 6.47, 0.76, 0.45         # bancs en arc de 6,47 à 7,23 m, 45° chacun, sur les axes
BANCS = [(a - 22.5, a + 22.5) for a in (0, 90, 180, 270)]
# Oculus centré et haut : avec le soleil de la salle carrée (sud 10°, est 8°), la tache tomberait à plus
# de 5 m du centre, à côté de l'œuvre. Soleil propre à cette salle, presque vertical (sud 4°, est 3°)
SOLEIL = Vector((-math.tan(math.radians(3)), math.tan(math.radians(4)), -1.0)).normalized()
# Œuvre : « La maladie de Huntington », 2,70 m, sur son socle rond (blender/huntington.py, salle.py)
SOCLE_R, SOCLE_H, GORGE_H, GORGE_R = 1.2, 0.8, 0.12, 0.10
LUEUR_FORCE, LUEUR_COULEUR = 6.0, (0.92, 0.96, 1.0, 1)

# Calotte : sphère centrée sur l'axe, passant par (COUPOLE_R, H) et par le bord de l'oculus
zc = ((PUITS_R ** 2 + (H + COUPOLE_H) ** 2) - (COUPOLE_R ** 2 + H ** 2)) / (2 * COUPOLE_H)
RHO = math.hypot(COUPOLE_R, H - zc)
TOIT = H + COUPOLE_H + PUITS_P   # sommet du conduit de l'oculus

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene

def lineaire(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def matiere(nom, couleur, rugosite=0.9):
    m = bpy.data.materials.new(nom); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*couleur, 1); b.inputs["Roughness"].default_value = rugosite
    return m
# Couleurs de la salle de Huntington (salleProvisoireBleue)
MUR = matiere("Mur", lineaire("#aabccb"))
SOL = matiere("Sol", lineaire("#6f7d8b"), 0.6)
BANC = matiere("Banc", lineaire("#9bacba"))

def objet(nom, bm, mat):
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    me.materials.append(mat)
    return o

def prisme(nom, contour, z0, z1, mat=MUR, decalage=(0, 0)):
    """Prisme sur un contour (x, y) parcouru dans le sens direct ; le dessus est décalé de `decalage`."""
    bm = bmesh.new()
    bas = [bm.verts.new((x, y, z0)) for x, y in contour]
    haut = [bm.verts.new((x + decalage[0], y + decalage[1], z1)) for x, y in contour]
    bm.faces.new(bas[::-1]); bm.faces.new(haut)
    n = len(contour)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([bas[i], bas[j], haut[j], haut[i]])
    return objet(nom, bm, mat)

def revolution(nom, profil, n=96, mat=MUR):
    """Solide de révolution autour de l'axe z ; profil : (r, z) de r > 0 jusqu'à r = 0 (pointe)."""
    bm = bmesh.new()
    anneaux = []
    for r, z in profil[:-1]:
        anneaux.append([bm.verts.new((r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z)) for k in range(n)])
    pointe = bm.verts.new((0, 0, profil[-1][1]))
    bm.faces.new(anneaux[0][::-1])
    for a, b in zip(anneaux, anneaux[1:]):
        for k in range(n):
            bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]])
    for k in range(n):
        bm.faces.new([anneaux[-1][k], anneaux[-1][(k + 1) % n], pointe])
    return objet(nom, bm, mat)

def cercle(r, n=96, cx=0, cy=0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def arc(a0, a1, r=R, pas=2.0):
    n = max(2, math.ceil(abs(a1 - a0) / pas))
    return [(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]

def tourner(pts, quarts):
    for _ in range(quarts):
        pts = [(-y, x) for x, y in pts]
    return pts

# Contour de la salle, un quart (de l'axe est à l'axe nord), puis répété par quarts de tour
# (point où le côté du pilastre, en s'évasant vers le mur, rencontre le cercle)
x0, y0 = R - PIL_P, PIL_L / 2
a_, b_, c_ = 1 + PIL_PENTE ** 2, 2 * (x0 + y0 * PIL_PENTE), x0 ** 2 + y0 ** 2 - R ** 2
u = (-b_ + math.sqrt(b_ ** 2 - 4 * a_ * c_)) / (2 * a_)
pil = (x0 + u, y0 + PIL_PENTE * u)
a_pil = math.degrees(math.atan2(pil[1], pil[0]))
quart = [(x0, 0), (x0, y0), pil] + arc(a_pil, math.degrees(math.atan2(12, 16)))[1:] + \
        [(h, h - PORTE), (h, h), (h - PORTE, h)] + arc(math.degrees(math.atan2(16, 12)), 90 - a_pil) + \
        [(y0, x0)]
contour = []
for q in range(4):
    contour += tourner(quart, q)

# --- Construction par soustraction dans un bloc de pierre ---------------------------------------
bloc = prisme("Pierre", [(-h - 5, -h - 5), (h + 5, -h - 5), (h + 5, h + 5), (-h - 5, h + 5)], -0.5, H + FENTE_P)
cheminee = prisme("Cheminee", cercle(COUPOLE_R + 1), H, TOIT)
outils = bpy.data.collections.new("Outils")
def outil(o):
    scn.collection.objects.unlink(o); outils.objects.link(o)
outil(prisme("Interieur", contour, 0, H))
calotte = [(COUPOLE_R, H - 0.1)] + [(r, zc + math.sqrt(RHO ** 2 - r ** 2)) for r in
                                    [COUPOLE_R * (1 - k / 32) for k in range(33)]]
outil(revolution("Coupole", calotte))
outil(prisme("Oculus", cercle(PUITS_R), H + 1, TOIT + 1))
haut_fente = H + FENTE_P - 0.2            # chambre fermée : 20 cm de pierre au-dessus
fond = h - PIL_P + FENTE_FOND             # fond de la fente, dans le pilastre
for q in range(4):
    # fente en L : partie verticale dans le pilastre, partie horizontale au plafond (avec sa chambre) ;
    # porte et amorce de couloir (fermée) dans l'angle
    y_ = FENTE_L / 2
    outil(prisme(f"FenteMur{q}", tourner([(h - PIL_P - 0.01, -y_), (fond, -y_), (fond, y_), (h - PIL_P - 0.01, y_)], q),
                 FENTE_BAS, haut_fente))
    outil(prisme(f"FentePlafond{q}", tourner([(h - PIL_P - FENTE_PLAF, -y_), (fond, -y_), (fond, y_), (h - PIL_P - FENTE_PLAF, y_)], q),
                 H - 0.1, haut_fente))
    porte = [(h - PORTE, h - 0.01), (h, h - 0.01), (h, h + 3), (h - PORTE, h + 3)]
    outil(prisme(f"Porte{q}", tourner(porte, q), 0, H))
for o, op, cible in ((bloc, "UNION", cheminee), (bloc, "DIFFERENCE", outils)):
    m = o.modifiers.new(op, "BOOLEAN"); m.operation, m.solver = op, "EXACT"
    if isinstance(cible, bpy.types.Collection):
        m.operand_type, m.collection = "COLLECTION", cible
    else:
        m.object = cible
bpy.context.view_layer.objects.active = bloc
for m in list(bloc.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
bpy.data.objects.remove(cheminee)
for o in list(outils.objects):
    bpy.data.objects.remove(o)
# Sol dans sa matière : faces horizontales tournées vers le haut à z = 0
bloc.data.materials.append(SOL)
for p in bloc.data.polygons:
    if p.normal.z > 0.9 and abs(p.center.z) < 1e-3:
        p.material_index = 1

# Lames de l'oculus, colonnes, bancs
x = -PUITS_R
for v in VIDES[:-1]:
    x += v
    prisme("Lame", [(x, -PUITS_R - 0.5), (x + LAME_E, -PUITS_R - 0.5), (x + LAME_E, PUITS_R + 0.5), (x, PUITS_R + 0.5)],
           TOIT - LAME_H, TOIT)
    x += LAME_E
haut_colonne = H + 0.01
for k in range(COL_N):
    if k % 3 == 0 and not COL_AXES:
        continue
    a = math.radians(COL_A0 + 360 * k / COL_N)
    prisme("Colonne", cercle(COL_D / 2, 32, COL_R * math.cos(a), COL_R * math.sin(a)), 0, haut_colonne)
for a0, a1 in BANCS:
    prisme("Banc", arc(a0, a1, BANC_R + BANC_P, 3) + arc(a1, a0, BANC_R, 3), 0, BANC_H, BANC)

# Socle rond à gorge lumineuse, et l'œuvre posée dessus
prisme("Socle", cercle(SOCLE_R, 48), GORGE_H, SOCLE_H, BANC)
prisme("Pied", cercle(SOCLE_R - GORGE_R, 48), 0, GORGE_H, BANC)
ml = bpy.data.materials.new("Lueur"); ml.use_nodes = True
em = ml.node_tree.nodes.new("ShaderNodeEmission")
em.inputs["Color"].default_value = LUEUR_COULEUR; em.inputs["Strength"].default_value = LUEUR_FORCE
ml.node_tree.links.new(em.outputs[0], ml.node_tree.nodes["Material Output"].inputs["Surface"])
bm = bmesh.new()
rl = SOCLE_R - GORGE_R + 0.01
bas = [bm.verts.new((rl * math.cos(2 * math.pi * k / 96), rl * math.sin(2 * math.pi * k / 96), 0.01)) for k in range(96)]
haut = [bm.verts.new(v.co + Vector((0, 0, GORGE_H - 0.03))) for v in bas]
for i in range(96):
    j = (i + 1) % 96
    bm.faces.new([bas[i], bas[j], haut[j], haut[i]])
objet("Lueur", bm, ml)
with bpy.data.libraries.load(os.path.join(HERE, "sculpture-huntington", "huntington.blend")) as (src, dst):
    dst.objects = ["Sculpture"]
sc = dst.objects[0]; scn.collection.objects.link(sc)
sc.location.z = SOCLE_H - 0.005
for o in scn.objects:
    if o.type == "MESH" and o is not sc:
        for p in o.data.polygons:
            p.use_smooth = False

# --- Lumière --------------------------------------------------------------------------------------
sd = bpy.data.lights.new("Soleil", "SUN"); sd.energy = 5.0; sd.angle = math.radians(10.0)
sd.color = lineaire("#eef3ff")
so = bpy.data.objects.new("Soleil", sd); scn.collection.objects.link(so)
so.rotation_euler = SOLEIL.to_track_quat("-Z", "Y").to_euler()
# Parois lumineuses des fentes : fond de la partie verticale et haut de la chambre, tournés vers la salle
mf = bpy.data.materials.new("Fente"); mf.use_nodes = True
ef = mf.node_tree.nodes.new("ShaderNodeEmission")
ef.inputs["Color"].default_value = (*sd.color, 1); ef.inputs["Strength"].default_value = FENTE_LUEUR
mf.node_tree.links.new(ef.outputs[0], mf.node_tree.nodes["Material Output"].inputs["Surface"])
bm = bmesh.new()
for q in range(4):
    y_, e = FENTE_L / 2, 0.005
    x0_ = h - PIL_P - FENTE_PLAF
    for pts in ([(fond - e, -y_, FENTE_BAS), (fond - e, -y_, haut_fente - e), (fond - e, y_, haut_fente - e), (fond - e, y_, FENTE_BAS)],
                [(x0_, -y_, haut_fente - e), (x0_, y_, haut_fente - e), (fond - e, y_, haut_fente - e), (fond - e, -y_, haut_fente - e)]):
        f = bm.faces.new([bm.verts.new((*tourner([(x, y)], q)[0], z)) for x, y, z in pts])
        f.normal_update()
        if f.normal.dot(Vector((0, 0, 0)) - f.calc_center_median()) < 0 and f.normal.z > -0.5:
            f.normal_flip()
objet("Fentes", bm, mf)
w = bpy.data.worlds.new("Ciel"); scn.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*lineaire("#9fb6d6"), 1); bg.inputs["Strength"].default_value = 1.0

# --- Rendu ----------------------------------------------------------------------------------------
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
scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = LARGEUR, LARGEUR * 9 // 16
scn.view_settings.view_transform = "AgX"
scn.view_settings.exposure = math.log2(3.4)   # exposition du site (3,4)

cam_d = bpy.data.cameras.new("Camera"); cam_d.sensor_fit = "VERTICAL"
cam = bpy.data.objects.new("Camera", cam_d); scn.collection.objects.link(cam); scn.camera = cam
def polaire(r, a, z=1.7):
    return (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), z)
# (position, point regardé, champ vertical en degrés[, plan de coupe]) ; l'avant de l'œuvre regarde le sud (-y)
CAMERAS = {
    "arrivee": (polaire(11, -90), (0, 0, 3.5), 55),       # vue d'arrivée à 11 m (décision du 30/10)
    "cercle": (polaire(4.5, -90), (0, 0, 2.2), 55),       # cercle de Huntington (4,5 m)
    "entree": ((-17.2, -17.2, 1.7), (0, 0, 5), 55),       # en entrant par la porte sud-ouest
    "coupole": (polaire(9, -120), (0, 1, H + 5), 75),     # la coupole, l'oculus et ses lames
    "pilastre": ((0, -4, 1.7), (-(h - PIL_P), 0, 11), 70),  # pilastre ouest et sa fente en L
    # vu de dessus, plafond retiré par le plan de coupe de la caméra (la lumière reste celle de la salle couverte)
    "dessus": ((0, 0, 62), (0, 0.001, 0), 45, 62 - H + 0.3),
}
os.makedirs(SORTIE, exist_ok=True)
for nom, (pos, cible, champ, *coupe) in CAMERAS.items():
    if VUES and nom not in VUES:
        continue
    cam_d.clip_start = coupe[0] if coupe else 0.05
    cam.location = pos
    cam.rotation_euler = (Vector(cible) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    cam_d.angle = math.radians(champ)
    scn.render.filepath = os.path.join(SORTIE, f"rotonde-{nom}.png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print("VUE", nom, round(time.time() - t0), "s")
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "rotonde-apercu.blend"))
print("COUPOLE centre", round(zc, 2), "rayon", round(RHO, 2))
print("OK")
