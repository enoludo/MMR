"""
« Souffle d'éclats » : poumons de verre et arbre de vaisseaux lumineux, d'après l'image de l'œuvre
(public/assets/images/souffle-declats.webp ; demande de Ludovic du 05/11 : « le plus fidèle possible à l'image »).

    PYTHONPATH=<scikit-image> blender -b --python-use-system-env -P souffle.py -- [graine] [rendu]

Produit dans sculpture-souffle/ : souffle.blend (objets « Verre » et « Vaisseaux », lus par pavillon.py pour la
lumière précalculée), souffle-raw.glb (puis compressé vers public/models/souffle.glb), et avec « rendu »
des aperçus dans plans/captures/souffle-*.png.

Construction (refaite le 05/11 après « on dirait un gros ballon en plastique » : relief, verre épais, vaisseaux) :
- silhouette de face de chaque poumon relevée sur l'image (en pixels, lissée), gonflée en volume : épaisseur
  arrondie qui croît depuis le bord (profil circulaire de rayon BOMBE), plus profonde vers l'arrière et plus
  mince vers l'apex ; puis une vraie distance à la surface, sur laquelle on ajoute du relief (bosses de deux
  tailles, comme les lobules bombés de l'image) et les scissures (rainures entre les lobes : trois lobes à
  gauche de l'image, deux à droite) ; verre épais : une surface extérieure et une intérieure, EP_VERRE dedans,
  qui doublent les arêtes de lumière ; surfaces tirées par marching cubes (scikit-image) ;
- trachée annelée, deux grosses bronches souches, puis dans chaque poumon un arbre qui pousse vers des points
  semés dans son volume (« colonisation de l'espace »), lissé ; diamètres par la règle des tuyaux, très
  contrastés (gros troncs, lacis fin) ; tubes construits ici, avec leurs coordonnées : UV (tour, longueur en m)
  pour les fibres lumineuses dans la longueur et les anneaux de la trachée (dessinés par le site), UV2
  (rayon, trachée) pour distinguer gros troncs, lacis et trachée.
Origine : centre du dessus du socle (le pied des poumons est à LEVE au-dessus). Face avant vers -y (sud).
"""
import bpy, bmesh, sys, os, math, random, time
import numpy as np
from mathutils import Matrix, Vector
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure, draw

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
GRAINE = int(argv[0]) if argv else 7
RENDU = "rendu" in argv
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "sculpture-souffle")
os.makedirs(OUT, exist_ok=True)
random.seed(GRAINE); rng = np.random.default_rng(GRAINE)

# --- Mise à l'échelle de l'image (964 × 700 px) : 3,4 m entre les bords extérieurs des poumons ------------
PX = 3.4 / (788 - 205)          # m par pixel
CX, BAS = 487, 578              # axe de la trachée et pied des poumons, en pixels
LEVE = 0.35                     # pied des poumons au-dessus du socle (ils flottent)


def m(px, py):
    return ((px - CX) * PX, (BAS - py) * PX + LEVE)


# Silhouettes de face (pixels de l'image), dans le sens horaire vu de face, en partant de l'apex
GAUCHE = [(425, 22), (455, 40), (461, 90), (466, 150), (470, 220), (471, 300), (472, 400), (471, 500), (462, 548),
          (440, 570), (380, 578), (300, 574), (245, 562), (222, 535), (210, 480), (206, 400), (210, 300), (222, 210),
          (240, 150), (280, 92), (335, 50), (388, 28)]
DROITE = [(560, 22), (602, 28), (652, 48), (700, 84), (738, 142), (765, 220), (780, 320), (788, 420), (785, 500),
          (770, 545), (745, 565), (680, 566), (600, 560), (540, 552), (510, 540), (503, 500), (501, 400), (502, 300),
          (505, 220), (510, 150), (518, 90), (532, 42)]
PROF_AVANT, PROF_ARRIERE = 0.42, 0.58   # demi-épaisseurs maximales vers l'avant (-y) et l'arrière (+y)
BOMBE = 0.55                            # rayon du profil arrondi depuis le bord de la silhouette
PAS = 0.015                             # pas de la grille du volume


def lisser(pts, n=12):
    """Courbe de Catmull-Rom fermée passant par les points."""
    out = []
    k = len(pts)
    for i in range(k):
        p0, p1, p2, p3 = (np.array(pts[(i + j) % k], float) for j in (-1, 0, 1, 2))
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


# Grille commune (x, y, z) ; 2D (x, z) pour les silhouettes
X0, X1, Y0, Y1, Z0, Z1 = -2.05, 2.05, -PROF_AVANT - 0.1, PROF_ARRIERE + 0.1, LEVE - 0.12, LEVE + 3.45
xs = np.arange(X0, X1, PAS); ys = np.arange(Y0, Y1, PAS); zs = np.arange(Z0, Z1, PAS)
FIN = PAS / 2                                   # silhouette rasterisée deux fois plus fin, puis distances
xf = np.arange(X0, X1, FIN); zf = np.arange(Z0, Z1, FIN)


def silhouette(pts):
    c = np.array([m(*p) for p in lisser(pts)])
    rr, cc = draw.polygon((c[:, 0] - X0) / FIN, (c[:, 1] - Z0) / FIN, shape=(len(xf), len(zf)))
    masque = np.zeros((len(xf), len(zf)), bool); masque[rr, cc] = True
    dedans = ndimage.distance_transform_edt(masque) * FIN
    dehors = ndimage.distance_transform_edt(~masque) * FIN
    return masque, dedans[::2, ::2][:len(xs), :len(zs)], dehors[::2, ::2][:len(xs), :len(zs)]


# Profondeur selon la hauteur : le poumon s'affine vers l'apex (55 %) et s'épaissit vers la base
HAUT_POUMON = (BAS - 22) * PX
PROFIL = np.clip(0.55 + 0.45 * (1 - np.clip((zs - LEVE) / HAUT_POUMON, 0, 1)) ** 0.8 / 0.62, 0.55, 1.0)


def epaisseur(dedans, prof):
    """Demi-épaisseur : profil circulaire de rayon BOMBE depuis le bord, puis plat à `prof` (× PROFIL)."""
    s = np.clip(dedans / BOMBE, 0, 1)
    return prof * PROFIL[None, :] * np.sqrt(s * (2 - s))


champs, infos = [], []
for nom, pts in (("gauche", GAUCHE), ("droite", DROITE)):
    _, dedans, dehors = silhouette(pts)
    ha, hr = epaisseur(dedans, PROF_AVANT), epaisseur(dedans, PROF_ARRIERE)
    Y = ys[None, :, None]
    h = np.where(Y < 0, ha[:, None, :], hr[:, None, :])
    f = np.where(dedans[:, None, :] > 0, Y ** 2 - h ** 2, Y ** 2 + dehors[:, None, :] ** 2)
    champs.append(f)
    infos.append((nom, dedans, ha, hr))
plein = ndimage.gaussian_filter(np.minimum(*champs), 0.8) < 0
# Distance signée à la surface (m, positive dehors)
dist = (ndimage.distance_transform_edt(~plein) - ndimage.distance_transform_edt(plein)) * PAS
G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1)   # positions de la grille


def bruit(echelle, amplitude):
    """Bruit lisse : valeurs au hasard sur une grille grossière, interpolées (cubique)."""
    n = [max(4, int(math.ceil((b - a) / echelle)) + 3) for a, b in ((X0, X1), (Y0, Y1), (Z0, Z1))]
    g = rng.standard_normal(n)
    c = np.meshgrid(*(np.linspace(1, k - 2, len(a)) for k, a in zip(n, (xs, ys, zs))), indexing="ij")
    z = ndimage.map_coordinates(g, c, order=3)
    return amplitude * z / max(z.std(), 1e-6)


BOSSES = bruit(0.42, 0.022) + bruit(0.16, 0.007)
dist = dist + BOSSES
# Scissures : rainures le long de plans (oblique des deux côtés, horizontale à gauche de l'image)
SCISSURE_P, SCISSURE_L = 0.024, 0.022     # profondeur et demi-largeur de la rainure


def rainure(point, normale, garder=None):
    global dist
    nrm = np.array(normale, float); nrm /= np.linalg.norm(nrm)
    d = (G - np.array(point)) @ nrm
    r = SCISSURE_P * np.exp(-(d / SCISSURE_L) ** 2)
    if garder is not None:
        r = r * garder
    dist = dist + r


obl_g = ((-0.8, 0.0, LEVE + 1.35), (0.45, -0.5, 0.75))
obl_d = ((0.8, 0.0, LEVE + 1.45), (-0.45, -0.5, 0.75))
cote_g = (G[..., 0] < -0.1).astype(float)
cote_d = (G[..., 0] > 0.0).astype(float)
rainure(*obl_g, garder=cote_g)
rainure(*obl_d, garder=cote_d)
# horizontale : à gauche de l'image, au-dessus de l'oblique et vers l'avant
dessus_obl = ((G - np.array(obl_g[0])) @ (np.array(obl_g[1]) / np.linalg.norm(obl_g[1])) > 0.03).astype(float)
rainure((0, 0, LEVE + 2.05), (0, 0.12, 1.0), garder=cote_g * dessus_obl * (G[..., 1] < 0.25))
dist = ndimage.gaussian_filter(dist, 0.6)
EP_VERRE = 0.045
surfaces = []
for niveau, sens in ((0.0, 1), (-EP_VERRE, -1)):
    v, f_, _, _ = measure.marching_cubes(dist, niveau, spacing=(PAS, PAS, PAS))
    v += np.array([X0, Y0, Z0])
    surfaces.append((v, f_, sens))
print("VERRE", sum(len(f_) for _, f_, _ in surfaces), "faces")

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene


def objet(nom, bm):
    me = bpy.data.meshes.new(nom); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    return o


def maillage(nom, v, f_, sens):
    me = bpy.data.meshes.new(nom)
    # marching cubes donne des faces tournées vers le dedans : retournées pour la surface extérieure, gardées
    # pour l'intérieure (sa face visible regarde le creux)
    me.from_pydata([tuple(p) for p in v], [], [tuple(int(i) for i in (t[::-1] if sens > 0 else t)) for t in f_])
    me.validate(); me.update()
    o = bpy.data.objects.new(nom, me); scn.collection.objects.link(o)
    return o


coques = [maillage(f"Verre{i}", v, f_, s_) for i, (v, f_, s_) in enumerate(surfaces)]
for o in scn.objects: o.select_set(False)
for o in coques:
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    dec = o.modifiers.new("Allege", "DECIMATE"); dec.ratio = 0.22
    bpy.ops.object.modifier_apply(modifier=dec.name)
bpy.ops.object.join()
verre = bpy.context.view_layer.objects.active; verre.name = verre.data.name = "Verre"
for p in verre.data.polygons:
    p.use_smooth = True
print("VERRE allégé", len(verre.data.polygons), "faces")

# --- Arbre des vaisseaux -------------------------------------------------------------------------------
TRACHEE_R, TRACHEE_HAUT = 0.15, LEVE + 3.62
CARENE = np.array([0.0, 0.04, LEVE + 2.38])
HILES = {"gauche": np.array([-0.55, 0.0, LEVE + 2.05]), "droite": np.array([0.57, 0.0, LEVE + 2.05])}
R_SOUCHE = 0.1                  # bronches souches : grosses, comme sur l'image (≈ 20 cm de diamètre)
MARGE = 0.08                    # les vaisseaux restent à l'intérieur du verre
# moins de petits vaisseaux le 05/11 (demande de Ludovic) : 3400 points et TUE 0,05 avant
N_POINTS, INFLUENCE, TUE, PAS_ARBRE = 1100, 0.36, 0.09, 0.03
# Diamètres : règle des tuyaux (r^2,2 du parent = somme de ceux des enfants : les troncs restent gros), depuis
# des pointes de 3,5 mm ; plafonnés sous les bronches souches
R_POINTE, EXPOSANT, R_MAX = 0.0045, 2.2, 0.085


def dedans_poumon(info, p):
    _, dedans, ha, hr = info
    i = int(round((p[0] - X0) / PAS)); k = int(round((p[2] - Z0) / PAS))
    if not (0 <= i < len(xs) and 0 <= k < len(zs)) or dedans[i, k] < MARGE:
        return False
    h = (ha if p[1] < 0 else hr)[i, k] - MARGE
    return abs(p[1]) < h


noeuds, parents = [], []


def ajouter(p, parent):
    noeuds.append(np.array(p, float)); parents.append(parent)
    return len(noeuds) - 1


racine = ajouter([0, 0.04, TRACHEE_HAUT], -1)
for z in np.linspace(TRACHEE_HAUT, CARENE[2], 14)[1:-1]:
    ajouter([0, 0.04, z], len(noeuds) - 1)
i_carene = ajouter(CARENE, len(noeuds) - 1)
souches = set(range(i_carene + 1))
for info in infos:
    nom = info[0]
    a = i_carene
    for t in np.linspace(0, 1, 11)[1:]:
        p = CARENE * (1 - t) + HILES[nom] * t - np.array([0, 0, 0.1 * math.sin(math.pi * t)])
        a = ajouter(p, a); souches.add(a)
    debut_poumon = len(noeuds) - 1
    pts = []
    while len(pts) < N_POINTS:
        p = np.array([rng.uniform(X0, X1), rng.normal(0, 0.3), rng.uniform(Z0, Z1)])
        if dedans_poumon(info, p):
            pts.append(p)
    pts = np.array(pts)
    vivants = np.ones(len(pts), bool)
    for it in range(400):
        idx = np.nonzero(vivants)[0]
        if not len(idx):
            break
        ids = list(range(debut_poumon, len(noeuds)))
        arbre = cKDTree(np.array([noeuds[i] for i in ids]))
        d, j = arbre.query(pts[idx], distance_upper_bound=INFLUENCE)
        attire = {}
        for a_, dd, jj in zip(idx, d, j):
            if np.isfinite(dd):
                attire.setdefault(ids[jj], []).append(a_)
        if not attire:
            break
        nouveaux = 0
        for n_, lst in attire.items():
            v = sum((pts[a_] - noeuds[n_]) / np.linalg.norm(pts[a_] - noeuds[n_]) for a_ in lst)
            if np.linalg.norm(v) < 1e-6:
                continue
            q = noeuds[n_] + v / np.linalg.norm(v) * PAS_ARBRE
            if arbre.query(q)[0] < PAS_ARBRE * 0.5 or not dedans_poumon(info, q):
                continue
            ajouter(q, n_); nouveaux += 1
        if not nouveaux:
            break
        arbre = cKDTree(np.array(noeuds[debut_poumon:]))
        for a_, pr in zip(idx, arbre.query_ball_point(pts[idx], TUE)):
            if pr:
                vivants[a_] = False
    print("ARBRE", nom, len(noeuds) - debut_poumon, "noeuds", it, "tours")

enfants = [[] for _ in noeuds]
for i, p in enumerate(parents):
    if p >= 0:
        enfants[p].append(i)
# Lissage des branches (la croissance pas à pas fait des zigzags) : chaque nœud vers la moyenne de ses voisins
for _ in range(4):
    nouv = [n.copy() for n in noeuds]
    for i, p in enumerate(parents):
        if p < 0 or i in souches or len(enfants[i]) != 1:
            continue
        nouv[i] = 0.5 * noeuds[i] + 0.25 * (noeuds[p] + noeuds[enfants[i][0]])
    noeuds = nouv
rayon = np.zeros(len(noeuds))
for i in reversed(range(len(noeuds))):
    rayon[i] = R_POINTE if not enfants[i] else min(R_MAX, sum(rayon[c] ** EXPOSANT for c in enfants[i]) ** (1 / EXPOSANT))
for i in souches:
    rayon[i] = TRACHEE_R if noeuds[i][2] > CARENE[2] - 1e-6 and abs(noeuds[i][0]) < 1e-6 else R_SOUCHE

chaines = []
pile = [0]
while pile:
    a = pile.pop()
    for c in enfants[a]:
        ch = [a, c]
        while len(enfants[ch[-1]]) == 1:
            ch.append(enfants[ch[-1]][0])
        chaines.append(ch)
        pile.append(ch[-1])

# Tubes : anneaux orientés par transport parallèle le long de chaque chaîne ; UV = (tour, longueur en m),
# UV2 = (rayon, 1 pour la trachée) ; nombre de côtés selon le rayon
bm = bmesh.new()
uv = bm.loops.layers.uv.new("tube"); uv2 = bm.loops.layers.uv.new("donnees")


def tube(ch):
    P = [Vector(noeuds[i]) for i in ch]
    R = [rayon[i] for i in ch]
    trachee = all(abs(noeuds[i][0]) < 1e-6 and noeuds[i][2] >= CARENE[2] - 1e-6 for i in ch)
    rmax = max(R)
    cotes = 14 if rmax > 0.06 else 10 if rmax > 0.025 else 6 if rmax > 0.01 else 4
    t0 = (P[1] - P[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    nrm = t0.cross(ref).normalized()
    anneaux, longueur = [], 0.0
    for k, p in enumerate(P):
        if k > 0:
            longueur += (P[k] - P[k - 1]).length
        t = (P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]).normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized()          # transport parallèle
        bin_ = t.cross(nrm)
        r = R[k]
        if trachee:      # anneaux de cartilage : rayon un peu plus fort tous les 7,5 cm
            r *= 1.0 + 0.07 * max(0.0, math.cos(2 * math.pi * (p.z - CARENE[2]) / 0.075)) ** 4
        anneaux.append(([bm.verts.new(p + (nrm * math.cos(2 * math.pi * s / cotes) + bin_ * math.sin(2 * math.pi * s / cotes)) * r)
                         for s in range(cotes)], longueur, R[k]))
    # UV2 : le rayon de chaque anneau (pas celui du début de la branche : une fine branche part souvent d'un
    # gros tronc, et le site la traitait comme un gros vaisseau)
    for (a, la, ra), (b, lb, rb) in zip(anneaux, anneaux[1:]):
        for s in range(cotes):
            s2 = (s + 1) % cotes
            f = bm.faces.new([a[s], a[s2], b[s2], b[s]])
            for lo, (u, v, rr) in zip(f.loops, ((s / cotes, la, ra), ((s + 1) / cotes, la, ra), ((s + 1) / cotes, lb, rb), (s / cotes, lb, rb))):
                lo[uv].uv = (u, v)
                lo[uv2].uv = (rr, 1.0 if trachee else 0.0)


for ch in chaines:
    if len(ch) >= 2:
        tube(ch)
vaisseaux = objet("Vaisseaux", bm)
for p in vaisseaux.data.polygons:
    p.use_smooth = True
print("VAISSEAUX", len(vaisseaux.data.polygons), "faces", len(chaines), "branches")


# --- Matières (noms lus par le site : Verre, Vaisseaux) -------------------------------------------------
def matiere_verre():
    mv = bpy.data.materials.new("Verre"); mv.use_nodes = True
    nt = mv.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.12, 0.25, 1.0, 1)
    b.inputs["Roughness"].default_value = 0.03
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = 1.45
    b.inputs["Emission Color"].default_value = (0.05, 0.15, 1.0, 1)
    b.inputs["Emission Strength"].default_value = 0.25
    return mv


def matiere_vaisseaux():
    mv = bpy.data.materials.new("Vaisseaux"); mv.use_nodes = True
    nt = mv.node_tree
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (1.0, 0.04, 0.15, 1); e.inputs["Strength"].default_value = 5.0
    nt.links.new(e.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return mv


verre.data.materials.append(matiere_verre())
vaisseaux.data.materials.append(matiere_vaisseaux())
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "souffle.blend"))
for o in scn.objects: o.select_set(o in (verre, vaisseaux))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "souffle-raw.glb"), export_format="GLB", use_selection=True,
                          export_materials="EXPORT", export_apply=True)

# --- Aperçus (Cycles), pour comparer à l'image --------------------------------------------------------------
if RENDU:
    scn.render.engine = "CYCLES"
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "METAL"; pr.get_devices()
        for d in pr.devices: d.use = True
        scn.cycles.device = "GPU"
    except Exception as e:
        print("GPU indisponible :", e)
    scn.cycles.samples = 96; scn.cycles.use_denoising = True
    scn.render.resolution_x, scn.render.resolution_y = 964, 700
    scn.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("Fond"); scn.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.01, 0.012, 0.02, 1)
    for nom, pos, en in (("Bleu", (-3, -4, 4), 4000), ("Bleu2", (3, 2, 3), 2500)):
        ld = bpy.data.lights.new(nom, "AREA"); ld.size = 3; ld.energy = en; ld.color = (0.4, 0.6, 1.0)
        lo = bpy.data.objects.new(nom, ld); scn.collection.objects.link(lo); lo.location = pos
        lo.rotation_euler = (Vector((0, 0, 2)) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    cd = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cd); scn.collection.objects.link(cam); scn.camera = cam
    cd.sensor_fit = "VERTICAL"
    for nom, pos, cible, champ in (("face", (0, -8.5, 1.9), (0, 0, 2.05), 30), ("trois-quarts", (-5.5, -6.5, 1.7), (0, 0, 2.1), 32),
                                   ("profil", (8.5, 0, 1.9), (0, 0, 2.05), 30)):
        cam.location = pos; cam.rotation_euler = (Vector(cible) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
        cd.angle = math.radians(champ)
        scn.render.filepath = os.path.join(HERE, "..", "plans", "captures", f"souffle-{nom}.png")
        t = time.time(); bpy.ops.render.render(write_still=True); print("VUE", nom, round(time.time() - t), "s")
print("OK")
