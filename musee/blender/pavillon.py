"""
Pavillon (plan de Ludovic du 05/11, plans/Fichier 2.svg ; plan coté et aperçu : plans/salle-pavillon.html),
pour « Souffle d'éclats » : géométrie, précalcul de la lumière et export, comme rotonde.py.

    blender -b --python-use-system-env -P pavillon.py -- [resolution] [echantillons] [echantillons du mobilier]
    puis : PYLIB=… ./chaine.sh RES pavillon

Produit dans salle-pavillon/ : salle.blend, lightmap.exr, lightmap-mobilier.exr, salle-raw.glb, avec les objets
« Salle » (grande salle, dehors de l'espace central ; atlas « salle »), « Mobilier » (dedans de l'espace central,
bancs, socle ; atlas « mobilier »), et sans lightmap : « Huisseries » (acier noir), « Dehors » (sol clair) et
« Ciel » (ciel autour de la salle, vu par les baies). Plus de lampes dans l'espace central depuis le 05/11 : il est
éclairé par ses ouvertures, quatre projecteurs discrets dans ses angles et la lueur de l'œuvre (souffle.py),
comptée dans le précalcul. Plus de socle ni de gorge lumineuse depuis le 05/11 (l'œuvre flotte).
Mêmes cotes que l'aperçu (apercu-pavillon.py) et le plan (plans/generer-plan-pavillon.py) : les garder identiques.

Décisions de Ludovic (05/11) : grande salle de 40 m à 17,5 m, sans puits ni fentes, murs de 1,6 m percés de
8 baies de 10 × 14 m (huisseries acier noir) ; espace central couvert à 6 m, deux ouvertures de 5,66 m
(nord-est, sud-ouest), éclairage artificiel, socle de Huntington sans statue ; couloirs inchangés ;
dehors très lumineux et simple ; vue d'arrivée dans l'espace central à 8,5 m.
Unités : mètres. Repère Blender : Z vers le haut (Y du site = Z Blender, Z du site = -Y Blender).
"""
import bpy, bmesh, sys, os, time, math, json
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
RES = int(argv[0]) if len(argv) > 0 else 2048
SAMPLES = int(argv[1]) if len(argv) > 1 else 256
SAMPLES_MOB = int(argv[2]) if len(argv) > 2 else SAMPLES
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "salle-pavillon")
os.makedirs(OUT, exist_ok=True)

# --- Grande salle --------------------------------------------------------------------------------------
C, H = 40.0, 17.5
h = C / 2
T = 1.6                       # murs épais : embrasures profondes des baies
PORTE, SAS = 4.0, 1.0         # portes dans les angles ; sas fermé derrière le mur (masqué par le site)
BAIES = [(-13.0, -3.0), (3.0, 13.0)]
BAIE_H = 14.0
VITRE = 0.3                   # plan des huisseries : à 0,3 m de la face extérieure
MENEAU_PAS, TRAVERSE_PAS = 2.5, 3.5
MENEAU_E, MENEAU_P = 0.06, 0.35
TRAVERSE_P, DORMANT, DORMANT_P = 0.15, 0.12, 0.22
# Lumière : celle de l'aperçu, ramenée à l'exposition du site (3,4 ; l'aperçu était rendu 1,5 diaph en dessous)
ECHELLE = 2 ** -1.5
SOLEIL_HAUTEUR, SOLEIL_ANGLE = 30.0, 5.0       # du sud-est, bas, voilé
SOLEIL = Vector((-math.cos(math.radians(SOLEIL_HAUTEUR)) / math.sqrt(2),
                 math.cos(math.radians(SOLEIL_HAUTEUR)) / math.sqrt(2),
                 -math.sin(math.radians(SOLEIL_HAUTEUR)))).normalized()
SOLEIL_FORCE, CIEL_FORCE = 5.0 * ECHELLE, 1.0 * ECHELLE
SOLEIL_COULEUR, CIEL_COULEUR = "#fff1dc", "#c9d6e6"

# --- Espace central --------------------------------------------------------------------------------------
INT, EXT, PLAT, CONGE = 15.5, 18.971, 16.0, 1.0
OUV = 4 * math.sqrt(2)
# Plafond de l'espace central doublé le 06/11 (6 → 12 m, demande de Ludovic)
H_INT, TOIT = 12.0, 1.0
# Hauteur des deux ouvertures de l'espace central (07/11, demande de Ludovic : 4 m, puis 12 m le même jour, soit
# toute la hauteur) : sous H_INT, un linteau les ferme au-dessus
H_OUV = 12.0
# Plus de socle depuis le 05/11 (demande de Ludovic) : l'œuvre flotte à la même hauteur (pied du modèle à OEUVRE_Z)
OEUVRE_Z = 0.8
# Puits de lumière au-dessus de l'œuvre (06/11, demande de Ludovic, d'après references/souffle) : cylindre de
# PUITS_D de diamètre (l'œuvre fait 3,4 m de large), percé dans le toit de l'espace central et monté jusqu'au plafond
# de la grande salle (5,5 m de profondeur avec le plafond à 12 m : sa source n'est vue d'aucune place de la visite),
# paroi de PUITS_E.
# Sa lumière : un disque caché tout en haut, blanc froid, tourné vers le bas (PUITS_FORCE, PUITS_OUVERTURE : angle du
# faisceau). Remplace les projecteurs des angles (05/11), retirés à sa demande.
PUITS_D, PUITS_E = 4.4, 0.3
PUITS_FORCE, PUITS_COULEUR, PUITS_OUVERTURE = 3000.0 * ECHELLE, "#dbe6ff", 30.0
# Lumière rasante au pied des murs de l'espace central (06/11, d'après la seconde référence : murs bleus éclairés
# par le bas) : rubans cachés au sol, contre les murs, tournés vers le haut ; 0 pour l'éteindre
LAVAGE_FORCE, LAVAGE_COULEUR, LAVAGE_RETRAIT = 40.0 * ECHELLE, "#6f8fdc", 0.25
# Alternance douce de deux couleurs le long des rubans (07/11, demande de Ludovic : bleu et beige) : la couleur
# passe de LAVAGE_COULEUR à LAVAGE_COULEUR2 et revient sur LAVAGE_PERIODE mètres, en partant du début de chaque
# tronçon ; LAVAGE_MELANGE de 0 (couleur 1 seule) à 1 (alternance complète). Chaque tronçon est fait de lampes de
# LAVAGE_PAS mètres, chacune de sa couleur (même formule que l'aperçu du site, EclairageDirect.tsx).
LAVAGE_COULEUR2, LAVAGE_PERIODE, LAVAGE_MELANGE, LAVAGE_PAS = "#e3c9a1", 4.0, 0.0, 0.5
BANC_R, BANC_P, BANC_H = 6.47, 0.76, 0.45
BANCS = [(-45 - 22.5, -45 + 22.5), (135 - 22.5, 135 + 22.5)]
# Repères d'échelle (07/11, essai demandé par Ludovic : faire comprendre la taille de l'œuvre) :
# - bancs droits de musée à la place des bancs en arc : assise de chêne sur deux pieds d'acier noir, aux mêmes angles,
#   le long du cercle (BANCS_DROITS = False : retour aux bancs en arc) ;
# - mise à distance : anneau bas d'acier noir autour de l'œuvre (ANNEAU_R, un peu plus large que le puits) ;
# - cartel sur pupitre (plaque claire inclinée sur un pied d'acier), devant l'œuvre, décalé de l'axe de la vue
#   d'arrivée. Les joints du sol sont dessinés par le site (« Joints du sol », touche M).
BANCS_DROITS = True
# Bancs retirés le 07/11 (demande de Ludovic) ; True pour les remettre
BANCS_ACTIFS = False
BANC_L, BANC_PROF, BANC_ASSISE, BANC_EP = 2.4, 0.5, 0.45, 0.06
ANNEAU_R, ANNEAU_L, ANNEAU_H = 2.6, 0.06, 0.03
# Depuis le 09/11 (demande de Ludovic), l'anneau est une mini barrière d'aluminium gris foncé : main courante ronde à
# BARRIERE_H (rayon ANNEAU_R + ANNEAU_L / 2, section BARRIERE_MAIN), sur fins montants (BARRIERE_MONTANT) répartis
# comme les projecteurs de l'anneau suspendu (PROJ_N, décalés de 22,5°) ; le pupitre du cartel est du même aluminium
BARRIERE_H, BARRIERE_MAIN, BARRIERE_MONTANT = 0.40, 0.015, 0.008
# Cartel dans l'axe des deux ouvertures (07/11, demande de Ludovic ; 200° avant), du côté sud-ouest, celui de la vue
# d'arrivée, lisible en venant de l'ouverture
CARTEL_ANGLE, CARTEL_R, CARTEL_H, CARTEL_INCL = 225.0, 3.1, 1.0, 25.0
CARTEL_L, CARTEL_P = 0.42, 0.30
# Luminaires à hauteur humaine (07/11, demande de Ludovic, à la place des rubans au pied des murs) :
# - anneau d'acier noir suspendu (ANNEAU_HAUT de rayon, à ANNEAU_HAUT_Z, tenu au plafond par 4 tiges fines), qui porte
#   PROJ_N petits projecteurs (cylindres de 20 cm, lentille lumineuse) tournés vers l'œuvre ; dans le précalcul, un spot
#   devant chaque lentille (PROJ_FORCE, PROJ_CONE, PROJ_COULEUR) ;
# - spots encastrés dans le sol (verre lumineux chaud de BORNE_COTE dans un cadre d'acier noir, BORNE_FORCE), de part
#   et d'autre du chemin qui mène des deux ouvertures à l'œuvre. Jusqu'au 09/11, bornes de 40 cm : on s'y serait pris
#   les pieds (Ludovic) ; le verre dépasse de 2 mm, le cadre de 3 mm (jamais au niveau du sol).
ANNEAU_HAUT, ANNEAU_HAUT_Z, ANNEAU_SECTION = 3.6, 6.0, 0.05
PROJ_N, PROJ_L, PROJ_R = 8, 0.2, 0.045
PROJ_FORCE, PROJ_CONE, PROJ_COULEUR = 250.0 * ECHELLE, 22.0, "#fff0dc"
BORNE_COTE, BORNE_CADRE, BORNE_FORCE, BORNE_COULEUR = 0.12, 0.01, 250.0, "#ffd7a3"
BORNES_R, BORNES_ECART = (9.0, 12.0), 1.8   # distances au centre le long du chemin, écart de part et d'autre
# L'œuvre (souffle.py), au-dessus du sol, face avant vers la vue d'arrivée (sud-ouest) comme dans le site ; sa lueur
OEUVRE_ROTATION = -45.0
# (rouge faible : à 5, les milliers de vaisseaux teintaient toute la salle en magenta ; sur l'image, la pénombre
# reste neutre avec des reflets bleus)
# (bleu ramené de 0,8 à 0,15 et rouge à 0,3 le 05/11 : il teintait trop la salle pour Ludovic ; bleu remonté à 0,3 ensuite, à sa demande, avec les projecteurs des angles de 120 à 200)
OEUVRE_BLEU, OEUVRE_BLEU_FORCE = (0.08, 0.2, 1.0, 1), 0.3 * ECHELLE
OEUVRE_ROUGE, OEUVRE_ROUGE_FORCE = (1.0, 0.04, 0.15, 1), 0.3 * ECHELLE

# Réglages de l'éclairage figés depuis le site (07/11, touche M « Éclairage », bouton « Figer ») : ils remplacent les
# valeurs ci-dessus et les couleurs de l'espace central (COULEURS_CENTRE, plus bas). Forces dans les unités ci-dessus,
# avant ECHELLE. En retour, ce script écrit la place de ses lumières pour l'aperçu en direct du site
# (src/salles/pavillon/lumieres.json).
REGLAGES_SITE = os.path.join(HERE, "..", "src", "salles", "pavillon", "eclairage.json")
ECLAIRAGE = json.load(open(REGLAGES_SITE)) if os.path.exists(REGLAGES_SITE) else {}
PUITS_ACTIF = True
if ECLAIRAGE:
    p_, r_, l_ = ECLAIRAGE["puits"], ECLAIRAGE["rubans"], ECLAIRAGE["lueur"]
    PUITS_ACTIF = p_["actif"]
    PUITS_FORCE, PUITS_COULEUR, PUITS_OUVERTURE = p_["force"] * ECHELLE, p_["couleur"], p_["ouverture"]
    LAVAGE_FORCE, LAVAGE_COULEUR = (r_["force"] if r_["actif"] else 0) * ECHELLE, r_["couleur"]
    LAVAGE_COULEUR2 = r_.get("couleur2", LAVAGE_COULEUR2)
    LAVAGE_PERIODE, LAVAGE_MELANGE = r_.get("periode", LAVAGE_PERIODE), r_.get("melange", LAVAGE_MELANGE)
    OEUVRE_BLEU_FORCE, OEUVRE_ROUGE_FORCE = l_["bleu"] * ECHELLE, l_["rouge"] * ECHELLE
if "projecteurs" in ECLAIRAGE:
    p_ = ECLAIRAGE["projecteurs"]
    PROJ_FORCE, PROJ_COULEUR, PROJ_CONE = (p_["force"] if p_["actif"] else 0) * ECHELLE, p_["couleur"], p_["cone"]
if "bornes" in ECLAIRAGE:
    b_ = ECLAIRAGE["bornes"]
    BORNE_FORCE, BORNE_COULEUR = b_["force"] if b_["actif"] else 0, b_["couleur"]
GRILLE = 1.5
DEHORS_R, CIEL_H = 100.0, 60.0          # sous la limite de vue de la caméra du site (150 m)
ECRAN = 32.0                            # écran du ciel autour de la salle (voir plus bas)
HAUT_COULOIR = 17.7                     # haut des couloirs du site (plafond de 0,2 m sur 17,5 m)
# Section de chaque couloir, relevée dans le site (en Blender : nord x 15,8 → 20,5, ouest y 15,8 → 20,5,
# sud x -20,2 → -15,5, est y -20,5 → -15,8), ramenée au mur nord (x de -ECRAN à ECRAN), d'où tourner() la
# remet en place ; le couloir sud n'est pas le nord tourné (fentes de l'autre côté)
TROUS_COULOIRS = {"nord": (15.8, 20.5), "ouest": (15.8, 20.5), "sud": (15.5, 20.2), "est": (15.8, 20.5)}

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


# Albédos = couleurs du site (salle provisoire) ; rugosités à peine différentes pour que gltf-transform
# ne fusionne pas des matières de même couleur (elles n'ont pas le même atlas)
# Dedans de l'espace central (06/11, puits de lumière, d'après references/souffle) : gris froids, sol et plafond
# sombres, intérieur du puits clair (il s'illumine comme l'oculus de la première référence) ; mêmes couleurs dans
# la config du site (src/salles/pavillon/config.ts)
COULEURS_CENTRE = {"SolCentre": "#4b5059", "MurCentre": "#7c8694", "PlafondCentre": "#3b3f47", "Banc": "#8e959f",
                   "Puits": "#a3a9b1", "Cartel": "#d6d2ca"}
COULEURS_CENTRE.update(ECLAIRAGE.get("couleurs", {}))
MATS = [mat("Mur", lineaire("#c1bcb4")), mat("Sol", lineaire("#a09b96"), 0.6), mat("Plafond", lineaire("#bab6b1")),
        mat("SolCentre", lineaire(COULEURS_CENTRE["SolCentre"]), 0.61), mat("Banc", lineaire(COULEURS_CENTRE["Banc"])),
        mat("MurCentre", lineaire(COULEURS_CENTRE["MurCentre"]), 0.91),
        mat("PlafondCentre", lineaire(COULEURS_CENTRE["PlafondCentre"]), 0.91),
        mat("Puits", lineaire(COULEURS_CENTRE["Puits"]), 0.92),
        mat("Cartel", lineaire(COULEURS_CENTRE["Cartel"]), 0.93)]
MUR, SOL, PLAF, SOL_C, BANC, MUR_C, PLAF_C, PUITS, CARTEL = range(9)
ACIER = mat("Acier", lineaire("#161616"), 0.45)
ACIER.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 0.7
ALU = mat("Alu", lineaire("#7a7f87"), 0.3)    # aluminium gris foncé (barrière, pupitre) ; dans le site, vrai métal
ALU.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = 1.0
ALU_PIECES = []   # pavés d'aluminium (centre, demi-axes x, y, z), avec les huisseries (indice ALU_I)
DEHORS = mat("Dehors", lineaire("#d9d2c6"), 0.95)


def emission(nom, couleur, force):
    m = bpy.data.materials.new(nom); m.use_nodes = True
    e = m.node_tree.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = couleur; e.inputs["Strength"].default_value = force
    m.node_tree.links.new(e.outputs[0], m.node_tree.nodes["Material Output"].inputs["Surface"])
    return m


# --- Outils de construction ----------------------------------------------------------------------------
def objet(nom, bm):
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    return o


def aire(contour):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(contour, contour[1:] + contour[:1])) / 2


def prisme(nom, contour, z0, z1, bm=None):
    """Prisme sur un contour ; dans un bmesh donné (plusieurs pièces dans un objet), ou un objet à lui."""
    if aire(contour) < 0:
        contour = contour[::-1]
    b = bm or bmesh.new()
    bas = [b.verts.new((x, y, z0)) for x, y in contour]
    haut = [b.verts.new((x, y, z1)) for x, y in contour]
    b.faces.new(bas[::-1]); b.faces.new(haut)
    n = len(contour)
    for i in range(n):
        j = (i + 1) % n
        b.faces.new([bas[i], bas[j], haut[j], haut[i]])
    return None if bm else objet(nom, b)


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def tourner(pts, quarts):
    for _ in range(quarts % 4):
        pts = [(-y, x) for x, y in pts]
    return pts


def cercle(r, n=180, cx=0, cy=0):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def arc(a0, a1, r, pas=2.0):
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
    """Moitié est du mur de l'espace central (l'autre : la même, tournée d'un demi-tour)."""
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
    return [A, (INT, 0), (0, -INT), B] + ext, [A, (INT, 0), (0, -INT), B]


def contour_pavillon():
    c = EXT - PLAT
    coins = [(c, -PLAT), (PLAT, -c), (PLAT, c), (c, PLAT), (-c, PLAT), (-PLAT, c), (-PLAT, -c), (-c, -PLAT)]
    pts = []
    for i in range(8):
        pts += conge(coins[i - 1], coins[i], coins[(i + 1) % 8])
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


# --- Volumes : un bloc de pierre creusé --------------------------------------------------------------------
# Volume intérieur, moins l'espace central (murs et toit) et les bancs : ils deviennent de la
# pierre pleine (pas de sol caché sous eux)
interieur = prisme("Interieur", rect(-h, -h, h, h), 0, H)
pleins = []
faces_int = []
for q in (0, 2):
    contour, dedans = moitie_pavillon()
    pleins.append(prisme(f"Pavillon{q}", tourner(contour, q), -1, H_INT + 0.5))
    faces_int.append(tourner(dedans, q))
pleins.append(prisme("Toit", contour_pavillon(), H_INT, H_INT + TOIT))
# Linteaux des deux ouvertures (nord-est, et sud-ouest par symétrie), de H_OUV au toit ; ils entrent de 5 cm dans
# les murs voisins (pas de faces confondues)
_d = OUV / 2 / math.sqrt(2)
_m = INT / 2
_k = (EXT - INT) / 2
_l = 0.05 / math.sqrt(2)
for q in ((0, 2) if H_OUV < H_INT - 1e-3 else ()):
    A_ = (_m + _d + _l, _m - _d - _l)
    B_ = (_m - _d - _l, _m + _d + _l)
    pleins.append(prisme(f"Linteau{q}", tourner([A_, (A_[0] + _k, A_[1] + _k), (B_[0] + _k, B_[1] + _k), B_], q),
                         H_OUV, H_INT + 0.5))
if BANCS_ACTIFS and not BANCS_DROITS:
    pleins += [prisme("Banc", arc(a0, a1, BANC_R + BANC_P, 3) + arc(a1, a0, BANC_R, 3), -1, BANC_H) for a0, a1 in BANCS]
# Paroi du puits, du toit de l'espace central au plafond de la grande salle (et au-delà, dans la pierre)
R_PUITS = PUITS_D / 2
paroi = prisme("PuitsParoi", cercle(R_PUITS + PUITS_E, 128), H_INT + TOIT - 0.1, H + 0.5)
creux = prisme("PuitsCreux", cercle(R_PUITS, 128), H_INT + TOIT - 0.2, H + 0.6)
booleen(paroi, "DIFFERENCE", creux)
bpy.data.objects.remove(creux)
if PUITS_ACTIF:
    pleins.append(paroi)
else:
    bpy.data.objects.remove(paroi)
c_pleins = collection("Pleins", pleins)
booleen(interieur, "DIFFERENCE", c_pleins)
jeter(c_pleins)
# Trou du puits dans le toit de l'espace central (il rejoint l'air enclos par sa paroi)
if PUITS_ACTIF:
    trou = prisme("PuitsTrou", cercle(R_PUITS, 128), H_INT - 0.3, H_INT + TOIT + 0.3)
    booleen(interieur, "UNION", trou)
    bpy.data.objects.remove(trou)

bloc = prisme("Pierre", rect(-h - T, -h - T, h + T, h + T), -0.5, H + 0.8)
outils = [interieur]
for q in range(4):
    # sas fermé derrière chaque porte (bloque le ciel ; masqué par le site, où le couloir prend le relais)
    sas = prisme(f"SasBloc{q}", tourner(rect(h - PORTE - 0.5, h, h + 0.5, h + T + SAS + 0.5), q), -0.5, H + 0.8)
    booleen(bloc, "UNION", sas)
    bpy.data.objects.remove(sas)
    outils.append(prisme(f"Porte{q}", tourner(rect(h - PORTE, h - 0.01, h, h + T + SAS), q), 0, H))
    for a, b in BAIES:
        outils.append(prisme(f"Baie{q}", tourner(rect(a, h - 0.01, b, h + T + 0.01), q), 0, BAIE_H))
c_outils = collection("Outils", outils)
booleen(bloc, "DIFFERENCE", c_outils)
jeter(c_outils)

# --- Nettoyage, découpe en grille, matières -----------------------------------------------------------
bm = bmesh.new(); bm.from_mesh(bloc.data)
bpy.data.objects.remove(bloc)
bm.normal_update()


def exterieure(f):
    """Faces jamais vues de l'intérieur : dessous, dessus, faces extérieures des murs, dessus du toit central."""
    c, n = f.calc_center_median(), f.normal
    if c.z < -0.45 or (n.z > 0.9 and c.z > H + 0.5):
        return True
    if n.z > 0.9 and abs(c.z - (H_INT + TOIT)) < 1e-3:
        return True
    lim = h + T - 0.01
    return (abs(c.x) > lim and n.x * math.copysign(1, c.x) > 0.9) or (abs(c.y) > lim and n.y * math.copysign(1, c.y) > 0.9)


bmesh.ops.delete(bm, geom=[f for f in bm.faces if exterieure(f)], context="FACES")
bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts[:], edges=bm.edges[:])
lignes = [k * GRILLE for k in range(-int((h + 5) / GRILLE), int((h + 5) / GRILLE) + 1)]
for v in lignes:
    for no in ((1, 0, 0), (0, 1, 0)):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(no) * v, plane_no=Vector(no), dist=1e-5)
for z in (3.0, 6.0, 9.0, 12.0, 15.0):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector((0, 0, z)), plane_no=Vector((0, 0, 1)), dist=1e-5)
# Découpe aussi le long des quatre faces intérieures de l'espace central (|x| + |y| = INT) : le noir du dedans
# s'arrête net sur l'arête, sans dents de scie dans le plafond et le sol des ouvertures (vu par Ludovic le 05/11 :
# les triangles de la grille, alignés sur les axes, prenaient la couleur du côté de leur centre)
for nx, ny, d in ((1, 1, INT), (1, 1, -INT), (1, -1, INT), (1, -1, -INT)):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    co = Vector((d / 2, d / 2 * ny, 0))
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=Vector((nx, ny, 0)).normalized(), dist=1e-5)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
bm.normal_update()


def dans_centre(c, marge=0.0):
    """Dans l'espace central (carré sur la pointe, demi-diagonale INT), sous son plafond."""
    return abs(c.x) + abs(c.y) < INT + marge and c.z < H_INT + 1e-3


def matiere(f):
    c, n = f.calc_center_median(), f.normal
    if abs(c.z) < 1e-3 and n.z > 0.9:
        return SOL_C if dans_centre(c) else SOL
    # Dedans du puits : sa paroi (tournée vers l'axe), du trou dans le toit jusqu'en haut, et son fond
    if PUITS_ACTIF and math.hypot(c.x, c.y) < R_PUITS + 0.02 and c.z > H_INT - 1e-3:
        return PUITS
    if BANCS_ACTIFS and math.hypot(c.x, c.y) < BANC_R + BANC_P + 0.1 and 1e-3 < c.z < BANC_H + 1e-3:
        return BANC
    # Tableaux des deux ouvertures (côtés et dessous du linteau) : comme les murs de l'espace central (07/11)
    if (c.x * c.y > 0 and INT - 0.01 < abs(c.x + c.y) < EXT + 0.01 and abs(c.y - c.x) / math.sqrt(2) < OUV / 2 + 0.01
            and 1e-3 < c.z < H_OUV + 1e-3 and abs(n.x + n.y) < 0.1):
        return MUR_C
    # Dedans de l'espace central : faces intérieures des murs (tournées vers le centre), plafond
    if dans_centre(c, 0.01) and c.z > 1e-3:
        vers_centre = -(n.x * c.x + n.y * c.y) / max(math.hypot(c.x, c.y), 1e-6)
        if n.z < -0.9:
            return PLAF_C
        if abs(n.z) < 0.1 and vers_centre > 0.3 and abs(c.x) + abs(c.y) > INT - 0.05:
            return MUR_C
    if n.z < -0.3:
        return PLAF
    return MUR


groupes = {"Salle": bmesh.new(), "Mobilier": bmesh.new()}


def ajouter(dst, f, mi):
    vs = [dst.verts.new(v.co) for v in f.verts]
    nf = dst.faces.new(vs); nf.material_index = mi


for f in bm.faces:
    m = matiere(f)
    ajouter(groupes["Mobilier"] if m in (SOL_C, BANC, MUR_C, PLAF_C, PUITS) else groupes["Salle"], f, m)
bm.free()


def piece(b, sommets, faces, mi=None):
    """Pièce faite de sommets et de faces (indices), dans un bmesh ; matière mi si donnée."""
    vs = [b.verts.new(v) for v in sommets]
    for f_ in faces:
        nf = b.faces.new([vs[i] for i in f_])
        if mi is not None:
            nf.material_index = mi


def boite(b, centre, axe_x, axe_y, axe_z, mi=None):
    """Pavé : centre, et ses trois demi-axes (vecteurs) ; faces tournées vers l'extérieur quel que soit leur sens."""
    c = Vector(centre)
    if axe_x.cross(axe_y).dot(axe_z) < 0:
        axe_z = -axe_z
    som = [c + sx * axe_x + sy * axe_y + sz * axe_z for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    piece(b, som, [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)], mi)


# Repères d'échelle : assises des bancs droits et plaque du cartel, dans le mobilier (lumière précalculée) ;
# leurs pièces d'acier (pieds, pied du cartel, anneau) vont avec les huisseries
ACIER_PIECES = []   # (centre, demi-axes x, y, z)
if BANCS_ACTIFS and BANCS_DROITS:
    for a0, a1 in BANCS:
        ang = math.radians((a0 + a1) / 2)
        rad = Vector((math.cos(ang), math.sin(ang), 0))
        tan_ = Vector((-rad.y, rad.x, 0))
        c = rad * (BANC_R + BANC_P / 2)
        haut_ = Vector((0, 0, 1))
        boite(groupes["Mobilier"], c + haut_ * (BANC_ASSISE - BANC_EP / 2), tan_ * BANC_L / 2, rad * BANC_PROF / 2,
              haut_ * BANC_EP / 2, BANC)
        for sens in (-1, 1):   # pieds : plaques d'acier, du dessous du sol jusque dans l'assise
            pied = c + tan_ * sens * (BANC_L / 2 - 0.25)
            z0, z1 = -0.01, BANC_ASSISE - BANC_EP + 0.005
            ACIER_PIECES.append((pied + haut_ * (z0 + z1) / 2, tan_ * 0.03, rad * (BANC_PROF / 2 - 0.04), haut_ * (z1 - z0) / 2))
ang = math.radians(CARTEL_ANGLE)
rad = Vector((math.cos(ang), math.sin(ang), 0))
tan_ = Vector((-rad.y, rad.x, 0))
pied = rad * CARTEL_R
monte = (-rad * math.cos(math.radians(CARTEL_INCL)) + Vector((0, 0, 1)) * math.sin(math.radians(CARTEL_INCL)))
normale = tan_.cross(monte).normalized()
if normale.z < 0:
    normale = -normale
ALU_PIECES.append((pied + Vector((0, 0, CARTEL_H)), tan_ * CARTEL_L / 2, monte * CARTEL_P / 2, normale * 0.0125))
z1 = CARTEL_H - 0.012
ALU_PIECES.append((pied + Vector((0, 0, (z1 - 0.01) / 2)), tan_ * 0.025, rad * 0.025, Vector((0, 0, (z1 + 0.01) / 2))))


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
print("FACES", len(room.data.polygons), len(mobilier.data.polygons))

# --- Huisseries des baies (acier noir ; dans le précalcul, elles portent leur ombre) ------------------------
yv = h + T - VITRE
b = bmesh.new()
for q in range(4):
    for a, bb in BAIES:
        pieces = [
            (a, yv - DORMANT_P + 0.05, a + DORMANT, yv + 0.05, 0, BAIE_H),
            (bb - DORMANT, yv - DORMANT_P + 0.05, bb, yv + 0.05, 0, BAIE_H),
            (a + DORMANT, yv - DORMANT_P + 0.05, bb - DORMANT, yv + 0.05, BAIE_H - DORMANT, BAIE_H),
            (a + DORMANT, yv - DORMANT_P + 0.05, bb - DORMANT, yv + 0.05, 0, 0.1),
        ]
        for i in range(1, round((bb - a) / MENEAU_PAS)):
            x = a + i * MENEAU_PAS
            pieces.append((x - MENEAU_E / 2, yv - MENEAU_P, x + MENEAU_E / 2, yv + 0.03, 0.1, BAIE_H - DORMANT))
        for j in range(1, round(BAIE_H / TRAVERSE_PAS)):
            z = j * TRAVERSE_PAS
            for i in range(round((bb - a) / MENEAU_PAS)):
                x0 = max(a + i * MENEAU_PAS + MENEAU_E / 2, a + DORMANT)
                x1 = min(a + (i + 1) * MENEAU_PAS - MENEAU_E / 2, bb - DORMANT)
                pieces.append((x0, yv - TRAVERSE_P, x1, yv + 0.03, z - MENEAU_E / 2, z + MENEAU_E / 2))
        for x0, y0, x1, y1, z0, z1 in pieces:
            prisme("", tourner(rect(x0, y0, x1, y1), q), z0, z1, b)
# Acier des repères d'échelle : pieds des bancs, pied du cartel, anneau de mise à distance autour de l'œuvre
for centre_, ax, ay, az in ACIER_PIECES:
    boite(b, centre_, ax, ay, az)
ALU_I = 3   # indice de l'aluminium dans les huisseries (après Acier, Lampe, Borne)
for centre_, ax, ay, az in ALU_PIECES:
    boite(b, centre_, ax, ay, az, ALU_I)
# Barrière autour de l'œuvre : main courante (tore) et montants
n_, m_ = 192, 12
rb_ = ANNEAU_R + ANNEAU_L / 2
zm_ = BARRIERE_H - BARRIERE_MAIN
tore = []
for k in range(n_):
    a_ = 2 * math.pi * k / n_
    for j in range(m_):
        t_ = 2 * math.pi * j / m_
        r_ = rb_ + BARRIERE_MAIN * math.cos(t_)
        tore.append((r_ * math.cos(a_), r_ * math.sin(a_), zm_ + BARRIERE_MAIN * math.sin(t_)))
piece(b, tore, [(k * m_ + j, ((k + 1) % n_) * m_ + j, ((k + 1) % n_) * m_ + (j + 1) % m_, k * m_ + (j + 1) % m_)
                for k in range(n_) for j in range(m_)], ALU_I)


def tube(b, centre, axe, rayon, longueur, mi_avant=None, n=16, mi=None):
    """Cylindre fermé le long de axe (vecteur unitaire) ; face avant (+axe) en matière mi_avant si donnée, le reste en mi."""
    axe = axe.normalized()
    u = axe.cross(Vector((0, 0, 1)) if abs(axe.z) < 0.9 else Vector((1, 0, 0))).normalized()
    v = axe.cross(u)
    c0, c1 = Vector(centre) - axe * longueur / 2, Vector(centre) + axe * longueur / 2
    cercle_ = [u * math.cos(2 * math.pi * k / n) * rayon + v * math.sin(2 * math.pi * k / n) * rayon for k in range(n)]
    arriere = [b.verts.new(c0 + p_) for p_ in cercle_]
    avant = [b.verts.new(c1 + p_) for p_ in cercle_]
    faces_ = [b.faces.new([arriere[k], arriere[(k + 1) % n], avant[(k + 1) % n], avant[k]]) for k in range(n)]
    faces_.append(b.faces.new(arriere[::-1]))
    f = b.faces.new(avant)
    faces_.append(f)
    if mi is not None:
        for f_ in faces_:
            f_.material_index = mi
    if mi_avant is not None:
        f.material_index = mi_avant
    return c1


# Montants de la barrière, aux angles des projecteurs, du dessous du sol jusque dans la main courante
for k in range(PROJ_N):
    a_ = math.radians(360 * k / PROJ_N + 22.5)
    z0_, z1_ = -0.01, BARRIERE_H - BARRIERE_MAIN
    tube(b, Vector((rb_ * math.cos(a_), rb_ * math.sin(a_), (z0_ + z1_) / 2)), Vector((0, 0, 1)), BARRIERE_MONTANT,
         z1_ - z0_, n=12, mi=ALU_I)


# Anneau suspendu : section carrée, comme l'anneau du sol (côtés et dessus), avec son dessous
n_ = 180
r0_, r1_ = ANNEAU_HAUT - ANNEAU_SECTION / 2, ANNEAU_HAUT + ANNEAU_SECTION / 2
z0_, z1_ = ANNEAU_HAUT_Z, ANNEAU_HAUT_Z + ANNEAU_SECTION
som_ = []
for r_, z_ in ((r0_, z0_), (r1_, z0_), (r1_, z1_), (r0_, z1_)):
    som_ += [(r_ * math.cos(2 * math.pi * k / n_), r_ * math.sin(2 * math.pi * k / n_), z_) for k in range(n_)]
faces_ = []
for k in range(n_):
    k2 = (k + 1) % n_
    i0, i1, i2, i3 = 0, n_, 2 * n_, 3 * n_
    faces_ += [(i0 + k, i0 + k2, i1 + k2, i1 + k), (i1 + k, i1 + k2, i2 + k2, i2 + k),
               (i2 + k, i2 + k2, i3 + k2, i3 + k), (i3 + k, i3 + k2, i0 + k2, i0 + k)]
piece(b, som_, faces_)
# Tiges de suspension, de l'anneau jusque dans le plafond
for k in range(4):
    a_ = math.radians(45 * (2 * k + 1) + 22.5)
    p_ = Vector((ANNEAU_HAUT * math.cos(a_), ANNEAU_HAUT * math.sin(a_), 0))
    zb, zh = ANNEAU_HAUT_Z + ANNEAU_SECTION - 0.005, H_INT + 0.05
    tube(b, p_ + Vector((0, 0, (zb + zh) / 2)), Vector((0, 0, 1)), 0.012, zh - zb, n=8)
# Projecteurs sous l'anneau, tournés vers l'œuvre (lentille en matière lumineuse : indice 1 des huisseries)
CIBLE_OEUVRE = Vector((0, 0, OEUVRE_Z + 2.0))
PROJECTEURS = []
for k in range(PROJ_N):
    a_ = math.radians(360 * k / PROJ_N + 22.5)
    attache = Vector((ANNEAU_HAUT * math.cos(a_), ANNEAU_HAUT * math.sin(a_), ANNEAU_HAUT_Z))
    tube(b, attache - Vector((0, 0, 0.05)), Vector((0, 0, 1)), 0.01, 0.1, n=8)   # tige courte
    centre_ = attache - Vector((0, 0, 0.12))
    axe_ = (CIBLE_OEUVRE - centre_).normalized()
    lentille = tube(b, centre_, axe_, PROJ_R, PROJ_L, mi_avant=1)
    PROJECTEURS.append((lentille + axe_ * 0.02, axe_))
# Spots encastrés de part et d'autre du chemin des deux ouvertures (axes à 45° et 225°)
for ang in (45.0, 225.0):
    axe_ = Vector((math.cos(math.radians(ang)), math.sin(math.radians(ang)), 0))
    cote = Vector((-axe_.y, axe_.x, 0))
    for d_ in BORNES_R:
        for sens in (-1, 1):
            p_ = axe_ * d_ + cote * sens * BORNES_ECART
            demi, c_ = BORNE_COTE / 2, BORNE_CADRE / 2
            boite(b, p_ + Vector((0, 0, -0.004)), Vector((demi, 0, 0)), Vector((0, demi, 0)),
                  Vector((0, 0, 0.006)), 2)                                  # verre lumineux, de -1 cm à +2 mm
            for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):                # cadre autour du verre, de -1 cm à +3 mm
                cote_x = Vector((c_, 0, 0)) if sx else Vector((demi + BORNE_CADRE, 0, 0))
                cote_y = Vector((0, c_, 0)) if sy else Vector((0, demi, 0))
                boite(b, p_ + Vector((sx * (demi + c_), sy * (demi + c_), -0.0035)), cote_x, cote_y,
                      Vector((0, 0, 0.0065)))
huisseries = objet("Huisseries", b); huisseries.data.materials.append(ACIER)
huisseries.data.materials.append(emission("Lampe", (*lineaire(PROJ_COULEUR), 1), 0.0))
huisseries.data.materials.append(emission("Borne", (*lineaire(BORNE_COULEUR), 1), BORNE_FORCE * ECHELLE))
huisseries.data.materials.append(ALU)

# --- L'œuvre dans le précalcul : sa lueur seulement (le verre laisse passer la lumière et luit en bleu, les
# vaisseaux luisent en rouge) ; elle colore le socle, le sol et les murs proches. Depuis le 05/11, plus de lumière
# ronde au plafond ni de gorge en haut des murs, ni de socle (demande de Ludovic) : l'espace central est éclairé
# par ses ouvertures, les projecteurs des angles et l'œuvre. Modèle : depuis le 06/11, celui du collègue de Ludovic
# (blender/poumons.py, sculpture-souffle/poumons.blend) ; avant, blender/souffle.py (sculpture-souffle/souffle.blend).
with bpy.data.libraries.load(os.path.join(HERE, "sculpture-souffle", "poumons.blend")) as (src, dst):
    dst.objects = ["Verre", "Vaisseaux"]
for o in dst.objects:
    scn.collection.objects.link(o)
    o.location = (0, 0, OEUVRE_Z)
    o.rotation_euler = (0, 0, math.radians(OEUVRE_ROTATION))
    o.data.materials.clear()
    if o.name.startswith("Verre"):
        mv = bpy.data.materials.new("VerreLueur"); mv.use_nodes = True
        nt = mv.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        tr, em, ad = nt.nodes.new("ShaderNodeBsdfTransparent"), nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeAddShader")
        em.inputs["Color"].default_value = OEUVRE_BLEU; em.inputs["Strength"].default_value = OEUVRE_BLEU_FORCE
        nt.links.new(tr.outputs[0], ad.inputs[0]); nt.links.new(em.outputs[0], ad.inputs[1])
        nt.links.new(ad.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
        o.data.materials.append(mv)
    else:
        o.data.materials.append(emission("VaisseauxLueur", OEUVRE_ROUGE, OEUVRE_ROUGE_FORCE))

# Dehors : sol minéral clair (il renvoie la lumière par les baies)
b = bmesh.new()
f = b.faces.new([b.verts.new((x, y, -0.02)) for x, y in cercle(DEHORS_R, 96)])
f.normal_update()
if f.normal.z < 0:
    f.normal_flip()
dehors = objet("Dehors", b); dehors.data.materials.append(DEHORS)

# Lumière du puits : disque caché tout en haut, tourné vers le bas (une lampe « aire » est tournée vers -Z)
if PUITS_ACTIF:
    ld = bpy.data.lights.new("Puits", "AREA")
    ld.shape = "DISK"; ld.size = PUITS_D - 0.1; ld.energy = PUITS_FORCE; ld.color = lineaire(PUITS_COULEUR)
    ld.spread = math.radians(PUITS_OUVERTURE)
    lo = bpy.data.objects.new("Puits", ld); scn.collection.objects.link(lo)
    lo.location = (0, 0, H - 0.15)
RUBANS = []   # place des rubans, pour l'aperçu en direct du site

# Projecteurs de l'anneau : un spot devant chaque lentille, tourné vers l'œuvre
for k, (pos_, axe_) in enumerate(PROJECTEURS):
    ld = bpy.data.lights.new(f"Projecteur{k}", "SPOT")
    ld.energy = PROJ_FORCE; ld.color = lineaire(PROJ_COULEUR)
    ld.spot_size = math.radians(PROJ_CONE); ld.spot_blend = 0.6; ld.shadow_soft_size = 0.04
    lo = bpy.data.objects.new(f"Projecteur{k}", ld); scn.collection.objects.link(lo)
    lo.location = pos_
    lo.rotation_euler = axe_.to_track_quat("-Z", "Y").to_euler()

# Lumière rasante au pied des murs de l'espace central : un ruban par pan de mur, à LAVAGE_RETRAIT du mur, tourné
# vers le haut et un peu vers le mur ; deux pans, au nord-est et au sud-ouest, sont coupés par les ouvertures
if True:   # rubans posés même éteints (force nulle) : l'aperçu du site les rallume
    coins = [(INT, 0), (0, INT), (-INT, 0), (0, -INT)]
    for i in range(4):
        a, b_ = Vector((*coins[i], 0)), Vector((*coins[(i + 1) % 4], 0))
        u = (b_ - a).normalized()
        dedans = -(a + b_).normalized()                      # vers le centre
        longueur = (b_ - a).length
        troncons = [(1.2, longueur - 1.2)]
        if i in (0, 2):                                      # pans nord-est et sud-ouest : ouverture au milieu
            troncons = [(1.2, longueur / 2 - OUV / 2 - 0.6), (longueur / 2 + OUV / 2 + 0.6, longueur - 1.2)]
        # La lampe éclaire vers son -Z local ; son grand côté (X local) le long du mur
        axe = (Vector((0, 0, 1)) * math.cos(math.radians(15)) - dedans * math.sin(math.radians(15))).normalized()
        z = -axe
        x = (u - z * u.dot(z)).normalized()
        c1, c2 = Vector(lineaire(LAVAGE_COULEUR)), Vector(lineaire(LAVAGE_COULEUR2))
        for j, (t0, t1) in enumerate(troncons):
            debut = a + u * t0 + dedans * LAVAGE_RETRAIT + Vector((0, 0, 0.03))
            n_ = max(1, round((t1 - t0) / LAVAGE_PAS))
            pas = (t1 - t0) / n_
            for k in range(n_):
                s_ = (k + 0.5) * pas                          # distance au début du tronçon
                w_ = LAVAGE_MELANGE * (0.5 - 0.5 * math.cos(2 * math.pi * s_ / LAVAGE_PERIODE))
                ld = bpy.data.lights.new(f"Lavage{i}{j}_{k}", "AREA")
                ld.shape = "RECTANGLE"; ld.size = pas; ld.size_y = 0.06
                ld.energy = LAVAGE_FORCE * pas; ld.color = tuple(c1.lerp(c2, w_))
                lo = bpy.data.objects.new(f"Lavage{i}{j}_{k}", ld); scn.collection.objects.link(lo)
                lo.location = debut + u * s_
                lo.rotation_euler = Matrix((x, z.cross(x), z)).transposed().to_euler()
            RUBANS.append((debut, debut + u * (t1 - t0), axe))

# Place des lumières pour l'aperçu en direct du site, dans son repère (Blender (x, y, z) = site (x, z, -y))
site = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
with open(os.path.join(HERE, "..", "src", "salles", "pavillon", "lumieres.json"), "w") as f_:
    json.dump({"puits": {"source": site(Vector((0, 0, H - 0.15))), "rayonSource": (PUITS_D - 0.1) / 2,
                         "rayon": R_PUITS, "hauteurOuverture": H_INT, "echelle": ECHELLE},
               "rubans": [{"a": site(a_), "b": site(b_), "axe": site(x_)} for a_, b_, x_ in RUBANS]}, f_, indent=1)
if len(argv) > 3 and argv[3] == "lumieres":   # seulement la place des lumières, sans rendu ni précalcul
    sys.exit(0)

# --- Soleil et ciel ----------------------------------------------------------------------------------------
sun_d = bpy.data.lights.new("Soleil", "SUN"); sun_d.energy = SOLEIL_FORCE; sun_d.angle = math.radians(SOLEIL_ANGLE)
sun_d.color = lineaire(SOLEIL_COULEUR)
sun = bpy.data.objects.new("Soleil", sun_d); scn.collection.objects.link(sun)
sun.rotation_euler = SOLEIL.to_track_quat("-Z", "Y").to_euler()
w = bpy.data.worlds.new("Ciel"); scn.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*lineaire(CIEL_COULEUR), 1); bg.inputs["Strength"].default_value = CIEL_FORCE

# --- Essai (4e argument « essai ») : quelques vues rendues, sans précalcul, pour régler la lumière ---------------
ESSAI = len(argv) > 3 and argv[3] == "essai"

# --- Précalcul ---------------------------------------------------------------------------------------------
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
scn.cycles.max_bounces = 5; scn.cycles.sample_clamp_indirect = 2.0
if ESSAI:
    scn.render.resolution_x, scn.render.resolution_y = 960, 540
    scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = True
    scn.view_settings.view_transform = "AgX"; scn.view_settings.exposure = math.log2(3.4)
    vues = {"arrivee": ((-6.01, -6.01, 1.7), (0, 0, 2.6)), "coin-est": ((-2, 2, 1.7), (INT, 0, 2.0)),
            "coin-nord": ((4, -4, 1.7), (0, INT, 2.0)), "puits": ((-3.9, -3.9, 1.7), (0, 0, 11.0)),
            "hall": ((-17, -17, 1.7), (0, 0, 10.0)), "ouverture": ((-4.5, -8.5, 1.7), (-9.0, -9.0, 2.6)),
            "echelle": ((-4.2, -4.2, 1.7), (0, 0, 1.6)), "anneau": ((-7.5, -7.5, 1.7), (0, 0, 4.5))}
    cd = bpy.data.cameras.new("Essai"); cd.lens = 18
    cam = bpy.data.objects.new("Essai", cd); scn.collection.objects.link(cam); scn.camera = cam
    for nom, (pos, cible) in vues.items():
        cam.location = pos
        cam.rotation_euler = (Vector(cible) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        scn.render.filepath = os.path.join(HERE, "..", "plans", "captures", f"pavillon-essai-{nom}.png")
        bpy.ops.render.render(write_still=True)
    sys.exit(0)
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

# Ciel vu par les baies (après le précalcul : il cacherait le ciel de Blender). Un écran à ECRAN du centre,
# plus près que les salles voisines (elles commencent au bout des couloirs, à 34 m) : pendant un passage, on
# ne les voit pas par les baies (demande de Ludovic du 05/11). Il est percé exactement à la section de chaque
# couloir (relevée dans le site, Couloir.tsx : 17,7 m de haut, paroi de 0,5 m d'un côté et 0,2 de l'autre),
# qui bouche l'ouverture ; faces tournées vers l'intérieur.
CIEL = emission("Ciel", (*lineaire(CIEL_COULEUR), 1), CIEL_FORCE)
b = bmesh.new()


def plan_ciel(coins):
    f = b.faces.new([b.verts.new(c) for c in coins])
    f.normal_update()
    centre = f.calc_center_median()
    if f.normal.dot(Vector((-centre.x, -centre.y, CIEL_H / 2 - centre.z))) < 0:
        f.normal_flip()


E = ECRAN
for cote, (t0, t1) in TROUS_COULOIRS.items():
    # Écran de chaque côté, dans le repère du mur nord (u le long du mur, de -E à E ; à v = E), puis tourné
    q = {"nord": 0, "ouest": 1, "sud": 2, "est": 3}[cote]
    for u0, u1, z0, z1 in ((-E, t0, -1, CIEL_H), (t1, E, -1, CIEL_H), (t0, t1, HAUT_COULOIR, CIEL_H)):
        (x0, y0), (x1, y1) = tourner([(u0, E), (u1, E)], q)
        plan_ciel([(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)])
plan_ciel([(-E, -E, CIEL_H), (E, -E, CIEL_H), (E, E, CIEL_H), (-E, E, CIEL_H)])
ciel = objet("Ciel", b); ciel.data.materials.append(CIEL)

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "salle.blend"))

# Export (voir salle.py : image factice pour que l'exporteur écrive les UV de lightmap)
factice = bpy.data.images.new("factice", 4, 4)
for m in MATS:
    nt = m.node_tree; b_ = nt.nodes["Principled BSDF"]
    t_ = nt.nodes.new("ShaderNodeTexImage"); t_.image = factice
    u_ = nt.nodes.new("ShaderNodeUVMap"); u_.uv_map = "lightmap"
    nt.links.new(u_.outputs[0], t_.inputs[0]); nt.links.new(t_.outputs[0], b_.inputs["Emission Color"])
for o in scn.objects: o.select_set(o in (room, mobilier, huisseries, dehors, ciel))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "salle-raw.glb"), export_format="GLB",
                          use_selection=True, export_materials="EXPORT", export_image_format="JPEG")
print("SOLEIL", tuple(round(c, 4) for c in SOLEIL))
print("OK")
