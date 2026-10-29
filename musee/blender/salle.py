"""
Salle 1 (provisoire) — salle carrée monumentale, éclairée par des puits de lumière.

Construite, éclairée et précalculée par script :
    python3 salle.py [resolution] [echantillons] [echantillons du mobilier]
    (ou : blender -b -P salle.py -- [resolution] [echantillons] [echantillons du mobilier])

Produit dans salle/ :
  - salle.blend       : fichier source, modifiable dans Blender
  - lightmap.exr           : lumière reçue par l'architecture (sans la couleur des matières)
  - lightmap-mobilier.exr  : idem pour le sol autour de l'œuvre et les bancs (atlas séparé,
                             bien plus précis : ombre de contact des pieds, occlusion)
  - salle-raw.glb          : géométrie (objets « Salle » et « Mobilier »), UV = lightmap

Dans le site, chaque surface = pierre procédurale × lightmap.

Unités : mètres. Repère Blender : Z vers le haut (Y du site = Z Blender, Z du site = -Y Blender).
"""
import bpy, bmesh, sys, os, time, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
RES = int(argv[0]) if len(argv) > 0 else 1024
SAMPLES = int(argv[1]) if len(argv) > 1 else 128
# Mobilier (sol autour de l'œuvre, bancs) : surtout éclairé en direct, il demande moins d'échantillons
# que l'architecture, dont le plafond ne reçoit que de la lumière renvoyée (très bruitée)
SAMPLES_MOB = int(argv[2]) if len(argv) > 2 else SAMPLES
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "salle")
os.makedirs(OUT, exist_ok=True)

# --- Paramètres ----------------------------------------------------------
C, H = 30.0, 17.5                  # côté de la salle carrée, hauteur sous plafond (20 m avant la refonte du 28/10)
PUITS = 10.0                       # puits de lumière carré au-dessus de l'œuvre
PUITS_P = 5.0                      # profondeur du puits (épaisseur de toiture)
# Le soleil tombe en biais : le puits est décalé vers lui (vers le sud et un peu vers l'est) pour
# que le faisceau soit centré sur l'œuvre à mi-hauteur (voir plans/generer-plan.py, centrer_faisceau)
PUITS_X, PUITS_Y = 2.1, -2.6
# Lames nord-sud en haut du puits, à rythme irrégulier : elles découpent le faisceau en bandes.
# VIDES : largeurs des vides d'ouest en est, séparés par des lames de LAME_E × LAME_H
LAME_E, LAME_H = 0.25, 1.5
VIDES = [1.58, 0.85, 1.7, 0.97, 1.46, 0.73, 1.21]
FENTE = (0.9, 30.0)                # fente zénithale le long du mur ouest (largeur, longueur : toute la salle ;
                                   # elle se prolonge de 10 m dans le couloir d'entrée, construit par le site)
FENTE_P = 3.0                      # profondeur de la fente
FENTE_COULOIR = 10.0               # prolongement de la fente au-dessus du couloir d'entrée (sud)
# Deux portes, jusqu'au plafond, sur deux murs opposés, chacune au bord droit de son mur
# (vu de l'intérieur) : l'entrée au sud (x de -h à -h + PORTE_L), la sortie au nord
# (x de h - PORTE_L à h). Le couloir est construit en direct par le site (Couloir.tsx).
PORTE_L, PORTE_H = 4.0, H
SAS = 1.0                          # amorce de couloir fermée : bloque le ciel (masquée dans le site)
ECHELLE_OEUVRE = 1.25              # l'œuvre passe de 8 à 10 m (même échelle dans la config du site)
SOL_FIN = 18.0                     # sol autour de l'œuvre, précalculé finement (côté, en m) : toute la tache
                                   # du puits et son fondu doivent y tenir, sinon une marche apparaît à sa limite
ENFONCE = 0.015                    # l'œuvre est posée à même le sol, légèrement enfoncée
BANCS = [((0, -8.0), (4.5, 0.7, 0.45)), ((-7.5, 3.0), (0.7, 4.5, 0.45))]  # bancs : échelle humaine
# Venant du sud (10° de la verticale) et de l'est (8°) : par la fente zénithale, il effleure le mur
# ouest et y dessine une lueur qui s'éteint vers 9 m du sol. Avec un soleil voilé (SOLEIL_ANGLE), il
# faut au moins 8° : à 4°, le bord du disque tombait presque à la verticale et éclairait le sol
SOLEIL = Vector((-math.tan(math.radians(8)), math.tan(math.radians(10)), -1.0)).normalized()
SOLEIL_ANGLE = 10.0                # taille apparente (°) : soleil très voilé, tache du puits diffuse et ombres
                                   # de l'œuvre qui s'adoucissent en s'éloignant d'elle (2,5° puis 6° le 28/10)
CIEL_FORCE = 1.0                   # lumière du ciel : basse, pour le contraste (pénombre, faisceaux)

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
h = C / 2

def mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    return m

# Albédos proches d'un calcaire clair, un peu moins chaud depuis le 28/10 au soir (à mi-chemin
# entre le beige d'avant et un gris neutre) : ils règlent la lumière qui rebondit
MATS = [mat("Mur", (0.535, 0.50, 0.455)), mat("Sol", (0.35, 0.33, 0.305), 0.6),
        mat("Plafond", (0.49, 0.47, 0.44)), mat("SolCentre", (0.35, 0.33, 0.305), 0.61),
        mat("Banc", (0.44, 0.41, 0.375)), mat("Ombre", (0.03, 0.03, 0.03))]
MUR, SOL, PLAF, SOL_C, BANC, OMBRE = range(6)
# SolCentre a une rugosité à peine différente de Sol : sinon gltf-transform fusionne
# les deux matières identiques, et le sol central lirait le mauvais atlas de lumière.

bm = bmesh.new()
def quad(pts, mi, ref=None):
    """Face à 4 sommets ; si ref est donné, la normale est tournée vers ce point."""
    f = bm.faces.new([bm.verts.new(p) for p in pts]); f.material_index = mi
    f.normal_update()
    if ref is not None and f.normal.dot(Vector(ref) - f.calc_center_median()) < 0:
        f.normal_flip()
    return f

def rect_h(x0, y0, x1, y1, z, mi, ref):
    quad([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], mi, ref)

def rect_v(a, b, z0, z1, mi, ref):
    """Mur vertical entre les points a et b (x, y)."""
    quad([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)], mi, ref)

def box(cx, cy, sx, sy, sz, mi):
    """Pavé posé au sol, normales vers l'extérieur (face du dessous omise)."""
    x0, x1, y0, y1 = cx - sx/2, cx + sx/2, cy - sy/2, cy + sy/2
    rect_h(x0, y0, x1, y1, sz, mi, (cx, cy, sz + 1))
    rect_v((x0, y0), (x1, y0), 0, sz, mi, (cx, y0 - 1, sz/2))
    rect_v((x1, y1), (x0, y1), 0, sz, mi, (cx, y1 + 1, sz/2))
    rect_v((x0, y1), (x0, y0), 0, sz, mi, (x0 - 1, cy, sz/2))
    rect_v((x1, y0), (x1, y1), 0, sz, mi, (x1 + 1, cy, sz/2))

centre = (0, 0, H / 2)
p, fl, fL = PUITS / 2, FENTE[0], FENTE[1] / 2
px0, px1 = PUITS_X - p, PUITS_X + p            # bords ouest et est du puits
py0, py1 = PUITS_Y - p, PUITS_Y + p            # bords sud et nord du puits
fx = -h + fl                                   # bord intérieur de la fente

# Sol, percé au centre : le carré autour de l'œuvre est dans l'atlas « Mobilier »
c = SOL_FIN / 2
for r in [(-h, -h, h, -c), (-h, c, h, h), (-h, -c, -c, c), (c, -c, h, c)]:
    rect_h(*r, 0, SOL, centre)
# Plafond, découpé autour de la fente (ouest) et du puits (centre)
for r in [(-h, -h, fx, -fL), (-h, fL, fx, h), (fx, -h, h, py0), (fx, py1, h, h), (fx, py0, px0, py1), (px1, py0, h, py1)]:
    if r[2] - r[0] > 1e-6 and r[3] - r[1] > 1e-6:
        rect_h(*r, H, PLAF, centre)
# Puits : 4 parois, ouvert en haut (le ciel et le soleil entrent)
ap = (PUITS_X, PUITS_Y, H + PUITS_P / 2)
for a, b in [((px0, py0), (px1, py0)), ((px1, py0), (px1, py1)), ((px1, py1), (px0, py1)), ((px0, py1), (px0, py0))]:
    rect_v(a, b, H, H + PUITS_P, MUR, ap)
# Lames : pavés nord-sud d'une paroi à l'autre du puits, en haut
x = px0
for i, v in enumerate(VIDES[:-1]):
    x += v
    xa, xb, za, zb = x, x + LAME_E, H + PUITS_P - LAME_H, H + PUITS_P
    for pts, ref in [
        ([(xa, py0, za), (xb, py0, za), (xb, py1, za), (xa, py1, za)], (x + LAME_E / 2, PUITS_Y, za - 1)),  # dessous
        ([(xa, py0, zb), (xb, py0, zb), (xb, py1, zb), (xa, py1, zb)], (x + LAME_E / 2, PUITS_Y, zb + 1)),  # dessus
        ([(xa, py0, za), (xa, py1, za), (xa, py1, zb), (xa, py0, zb)], (xa - 1, PUITS_Y, (za + zb) / 2)),  # ouest
        ([(xb, py0, za), (xb, py1, za), (xb, py1, zb), (xb, py0, zb)], (xb + 1, PUITS_Y, (za + zb) / 2)),  # est
    ]:
        quad(pts, MUR, ref)
    x += LAME_E
assert abs(x + VIDES[-1] - px1) < 1e-6, "lames et vides ne remplissent pas le puits"
# Fente : prolongement du mur ouest + paroi intérieure + extrémités. Au sud, elle se poursuit sans
# interruption au-dessus du couloir d'entrée : prolongée ici pour que la lumière qui y entre soit
# juste (le site masque ce prolongement et dessine la fente du couloir), et fermée en dessous par
# une surface sombre qui tient lieu du couloir, dans la pénombre (sans rebond ni lumière du sol)
ys = -fL - FENTE_COULOIR
af = (-h + fl / 2, 0, H + FENTE_P / 2)
rect_v((-h, ys), (-h, fL), H, H + FENTE_P, MUR, af)
rect_v((fx, ys), (fx, fL), H, H + FENTE_P, MUR, af)
rect_v((-h, ys), (fx, ys), H, H + FENTE_P, MUR, af)
rect_v((-h, fL), (fx, fL), H, H + FENTE_P, MUR, af)
rect_h(-h, ys, fx, -h - SAS, H, OMBRE, (-h + fl / 2, ys / 2, H + 1))
# Murs (le sud et le nord sont percés des portes, sur toute la hauteur)
rect_v((-h + PORTE_L, -h), (h, -h), 0, H, MUR, centre)
rect_v((h, -h), (h, h), 0, H, MUR, centre)
rect_v((-h, h), (-h, -h), 0, H, MUR, centre)
rect_v((h - PORTE_L, h), (-h, h), 0, H, MUR, centre)
# Sas derrière chaque porte, fermé et sans lumière propre : le couloir reste dans la pénombre
def sas(x0, x1, y0, y1):
    a = ((x0 + x1) / 2, (y0 + y1) / 2, PORTE_H / 2)
    rect_h(x0, y0, x1, y1, 0, SOL, a)
    rect_h(x0, y0, x1, y1, PORTE_H, PLAF, a)
    rect_v((x0, y0), (x0, y1), 0, PORTE_H, MUR, a)
    rect_v((x1, y0), (x1, y1), 0, PORTE_H, MUR, a)
    fond = y1 if y1 > h else y0
    rect_v((x0, fond), (x1, fond), 0, PORTE_H, MUR, a)
sas(h - PORTE_L, h, h, h + SAS)        # sortie (nord)
sas(-h, -h + PORTE_L, -h - SAS, -h)    # entrée (sud)
def souder(bm):
    """
    Géométrie étanche : chaque face est construite avec ses propres sommets, et une arête longue
    (le bas d'une paroi de la fente) en longe parfois plusieurs courtes (les morceaux de plafond).
    Ces raccords mal fermés laissent passer des pointillés de lumière dans le site. On fusionne les
    sommets confondus, puis on coupe chaque arête au droit des sommets posés dessus (jonctions en T).
    """
    eps = 1e-4
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=eps)
    coupe = True
    while coupe:
        coupe = False
        for e in bm.edges:
            a, b = e.verts
            ab = b.co - a.co
            l2 = ab.length_squared
            for v in bm.verts:
                if v is a or v is b:
                    continue
                t = (v.co - a.co).dot(ab) / l2
                if eps < t < 1 - eps and (a.co + ab * t - v.co).length < eps:
                    _, nv = bmesh.utils.edge_split(e, a, t)
                    nv.co = v.co.copy()
                    bmesh.ops.remove_doubles(bm, verts=[nv, v], dist=eps)
                    coupe = True
                    break
            if coupe:
                break

def objet(nom):
    """Transforme le maillage en cours en objet Blender (soudé), avec ses UV de lightmap."""
    souder(bm)
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    for m in MATS: me.materials.append(m)
    me.uv_layers.new(name="lightmap")
    for x in scn.objects: x.select_set(False)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_MARGIN_DIV=0.25)
    bpy.ops.object.mode_set(mode="OBJECT")
    return o

room = objet("Salle")

# Mobilier (sol autour de l'œuvre, bancs) : maillage et lightmap à part, plus précise.
# L'ombre de contact des pieds et l'occlusion au sol demandent des pixels de quelques mm.
bm = bmesh.new()
rect_h(-c, -c, c, c, 0, SOL_C, centre)
for (cx, cy), (sx, sy, sz) in BANCS:
    box(cx, cy, sx, sy, sz, BANC)
mobilier = objet("Mobilier")

# Sculpture : porte son ombre dans le précalcul (elle-même est éclairée en temps réel)
with bpy.data.libraries.load(os.path.join(HERE, "sculpture", "sculpture.blend")) as (src, dst):
    dst.objects = ["Sculpture"]
sc = dst.objects[0]; scn.collection.objects.link(sc); sc.location.z = -ENFONCE
sc.scale = [v * ECHELLE_OEUVRE for v in sc.scale]

# --- Lumière -------------------------------------------------------------
sun_d = bpy.data.lights.new("Soleil", "SUN"); sun_d.energy = 5.0; sun_d.angle = math.radians(SOLEIL_ANGLE)  # bords de lumière adoucis (soleil voilé)
sun_d.color = (1.0, 0.90, 0.77)  # blanc chaud ((1, 0.86, 0.68) avant le 28/10 au soir)
sun = bpy.data.objects.new("Soleil", sun_d); scn.collection.objects.link(sun)
sun.rotation_euler = SOLEIL.to_track_quat("-Z", "Y").to_euler()
# Ciel : lumière froide et douce qui entre par les ouvertures
w = bpy.data.worlds.new("Ciel"); scn.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.55, 0.68, 0.95, 1); bg.inputs["Strength"].default_value = CIEL_FORCE
# Pas de lumière dans le couloir : le passage reste dans la pénombre (retirée le 27/10)

# --- Précalcul : lumière reçue (sans la couleur des matières) ---------------
scn.render.engine = "CYCLES"; scn.cycles.device = "CPU"
scn.cycles.samples = SAMPLES; scn.cycles.max_bounces = 5; scn.cycles.sample_clamp_indirect = 3.0
scn.render.bake.margin = 8
for obj, taille, fichier, ech in ((room, RES, "lightmap.exr", SAMPLES), (mobilier, RES, "lightmap-mobilier.exr", SAMPLES_MOB)):
    scn.cycles.samples = ech
    img = bpy.data.images.new(fichier, taille, taille, float_buffer=True)
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

# Export : l'exporteur glTF n'écrit que les UV utilisées par une texture. On branche
# donc une image factice sur les UV de lightmap ; le site remplace les matériaux.
factice = bpy.data.images.new("factice", 4, 4)
for m in MATS:
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = factice
    u = nt.nodes.new("ShaderNodeUVMap"); u.uv_map = "lightmap"
    nt.links.new(u.outputs[0], t.inputs[0]); nt.links.new(t.outputs[0], b.inputs["Emission Color"])
for o in scn.objects: o.select_set(o in (room, mobilier))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "salle-raw.glb"), export_format="GLB",
                          use_selection=True, export_materials="EXPORT", export_image_format="JPEG")
print("SOLEIL", tuple(round(c, 4) for c in SOLEIL))
print("OK")
