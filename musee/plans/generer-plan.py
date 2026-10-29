"""Plans cotés de la salle (plan, coupes, élévation des fentes, récapitulatif), en HTML.

    python3 plans/generer-plan.py            → toutes les versions de VERSIONS
    python3 plans/generer-plan.py refonte    → une seule

« actuelle » reprend les valeurs du modèle 3D (blender/salle.py, src/salles/provisoire/config.ts,
src/scene/Couloir.tsx) ; les autres versions sont des projets, à reporter ensuite dans la 3D.
"""
import math, os, sys

ICI = os.path.dirname(os.path.abspath(__file__))
PX = 18  # pixels par mètre à l'écran

# --- Valeurs communes ----------------------------------------------------
C = 30.0
H = 20.0     # hauteur sous plafond, et des portes et couloirs (remplacée par celle de chaque version)
h = C / 2
PUITS_P = 5.0
FENTE_L, FENTE_P = 0.9, 3.0
PORTE_L = 4.0
COULOIR = 14.0
F_EP = 0.5
F_H = 16.0   # hauteur des fentes des couloirs (idem)
BANCS = [((0, -8.0), (4.5, 0.7)), ((-7.5, 3.0), (0.7, 4.5))]
OEUVRE = (6.6, 3.9, 10.0)  # emprise maxi (x, y) et hauteur, modèle de 8 m × 1,25
ANNEAUX = [(5.5, "cercle réduit 5,5 m"), (9, "cercle 9 m"), (13, "vue d'arrivée 13 m")]
T = 0.5  # épaisseur de mur dessinée (indicative)

VERSIONS = {
    "actuelle": dict(
        fichier="salle-provisoire.html",
        titre="Salle provisoire « Le géant » avant la refonte — plan coté",
        sous="État au 28/10/2026 avant la refonte (étiquette Git salle-avant-refonte), relevé dans le modèle 3D. Cotes en mètres.",
        hauteur=20.0,
        hauteur_fentes=16.0,
        puits=5.0,
        fente=(-12.5, 12.5),                       # extrémités sud et nord de la fente zénithale (y)
        soleil_txt="salle : venant du sud-est, haut de 79° (entre par le puits) ; couloir : 32°, réglable à part",
        fentes_couloir=dict(nombre=7, largeur=0.4, pas=1.6),
        cote_fentes={"entree": "est", "sortie": "ouest"},
        soleil=(-0.1572, 0.0983, -0.9827),         # direction de propagation (repère Blender)
        modifs=[],
        questions=[],
    ),
    "refonte": dict(
        fichier="salle-refonte.html",
        titre="Refonte de la salle — projet coté",
        sous="Modifications demandées par Ludovic le 28/10/2026, reportées dans la 3D le même jour. Cotes en mètres.",
        hauteur=17.5,
        hauteur_fentes=14.0,
        puits=10.0,
        fente=(-25.0, 15.0),
        fentes_couloir=dict(nombre=6, largeur=1.0, pas=None),  # pas None : trumeaux tous égaux
        cote_fentes={"entree": "est", "sortie": "est"},
        # Venant du sud (10° vers le nord en descendant) et de l'est (8° vers l'ouest)
        soleil=tuple(c / math.hypot(math.tan(math.radians(8)), math.tan(math.radians(10)), 1)
                     for c in (-math.tan(math.radians(8)), math.tan(math.radians(10)), -1.0)),
        centrer_faisceau=True,  # puits décalé vers le soleil : faisceau centré sur l'œuvre à mi-hauteur
        # Lames nord-sud en haut du puits, rythme irrégulier : le faisceau est découpé en bandes
        lames=dict(epaisseur=0.25, hauteur=1.5, vides=[1.58, 0.85, 1.7, 0.97, 1.46, 0.73, 1.21]),
        soleil_txt="salle : venant du sud et de l'est (10° vers le nord, 8° vers l'ouest), découpé par les lames "
                   "du puits ; par la fente zénithale, il effleure le mur ouest ; "
                   "couloir : soleil à part, bas, venant de l'est, lumière douce",
        modifs=[
            "Fentes des couloirs dans la paroi <b>est</b>, pour l'entrée comme pour la sortie : "
            "le couloir d'entrée d'une salle est maintenant le même que le couloir de sortie de la précédente.",
            "Puits de lumière de <b>10 × 10 m</b> (5 × 5 m avant), profondeur 5 m inchangée.",
            "Fente zénithale sur <b>toute la longueur de la salle et 10 m de couloir : 40 m</b> "
            "(25 m avant), le long du mur ouest, qui se prolonge dans le couloir d'entrée.",
            "Soleil de la salle venant du sud (face avant de l'œuvre) <b>et de l'est</b> : 10° vers le nord et 8° vers "
            "l'ouest en descendant. Le puits est <b>décalé de {dy} m vers le sud et {dx} m vers l'est</b> pour que le faisceau "
            "tombe sur l'œuvre : il est centré sur elle à mi-hauteur, et la couvre du sol (faisceau de {f_sol} m) jusqu'à son sommet.",
            "<b>Lueur le long du mur ouest</b> : par la fente zénithale, le soleil effleure le mur ouest ; intense sous le "
            "plafond, elle s'éteint progressivement vers 9 m du sol, <b>sans atteindre le sol</b> (dans la salle comme dans le "
            "couloir). Le soleil étant voilé, il faut 8° vers l'est : à 4°, le bord du disque éclairait le pied du mur.",
            "<b>Faisceau fragmenté</b> : 6 lames nord-sud de <b>0,25</b> × 1,5 m en haut du puits, espacées irrégulièrement "
            "(vides de 0,7 à 1,7 m). Parallèles au soleil, elles le découpent en bandes sans l'arrêter ; on voit les bandes "
            "dans l'air et au sol, surtout depuis la vue d'arrivée et le cercle (référence du 28/10).",
            "Couloirs : soleil à part, <b>bas et venant de l'est</b>, lumière douce : bords flous, rayons dans l'air, "
            "ombres éclairées par les rebonds (référence du 28/10).",
            "Couloirs : <b>6 fentes de 1 m</b> (7 de 0,4 m avant), trumeaux tous égaux.",
            "Hauteur sous plafond de <b>17,5 m</b> (20 m avant, 15 m dans un premier temps) ; les portes et les couloirs, "
            "qui montent jusqu'au plafond, passent aussi à 17,5 m, et le sommet du puits à 22,5 m.",
            "Fentes des couloirs de <b>14 m</b> de haut (16 m avant) : 80 % de la hauteur, comme les 12 m validés pour 15 m.",
        ],
        questions=[
            "Lames du puits : nombre et rythme sont une proposition. Fines (0,25 m), leurs bandes sont nettes dans le "
            "haut du faisceau, mais le flou du soleil (voilé, 10°) les estompe en descendant : au sol, elles ne font "
            "plus qu'une légère modulation de la lumière.",
            "Soleil très voilé (10°) : la tache du puits au sol a des bords très diffus (environ 3,5 m de fondu) et les ombres "
            "de l'œuvre s'adoucissent à mesure qu'elles s'éloignent d'elle.",
            "Sans décalage, le puits resterait centré dans la salle, mais le bas de la face avant de l'œuvre "
            "(environ 0,5 m) sortirait du faisceau.",
            "Le soleil de la salle (sud) et celui du couloir (est) ne viennent pas du même côté : on ne voit jamais "
            "les deux en même temps, mais c'est à savoir.",
            "Les 10 derniers mètres de chaque couloir (côté salle suivante) sont éclairés par la fente zénithale : "
            "le couloir n'est plus entièrement dans la pénombre.",
            "L'œuvre de 10 m occupe maintenant un peu plus de la moitié de la hauteur (la moitié avant) : 7,5 m d'air au-dessus de sa tête.",
            "Inchangés faute d'indication : largeur (0,9 m) et profondeur (3 m) de la fente zénithale, "
            "bancs et anneaux de la caméra.",
        ],
    ),
}


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


class Dessin:
    def __init__(self):
        self.e = []

    def add(self, s):
        self.e.append(s)

    def rect(self, x0, y0, x1, y1, cls, extra=""):
        X0, X1 = min(x0, x1), max(x0, x1)
        Y0, Y1 = min(y0, y1), max(y0, y1)
        self.add(f'<rect class="{cls}" x="{X0:.3f}" y="{-Y1:.3f}" width="{X1-X0:.3f}" height="{Y1-Y0:.3f}" {extra}/>')

    def line(self, x1, y1, x2, y2, cls):
        self.add(f'<line class="{cls}" x1="{x1:.3f}" y1="{-y1:.3f}" x2="{x2:.3f}" y2="{-y2:.3f}"/>')

    def poly(self, pts, cls):
        p = " ".join(f"{x:.3f},{-y:.3f}" for x, y in pts)
        self.add(f'<polygon class="{cls}" points="{p}"/>')

    def circle(self, x, y, r, cls):
        self.add(f'<circle class="{cls}" cx="{x:.3f}" cy="{-y:.3f}" r="{r:.3f}"/>')

    def text(self, x, y, s, cls="t", anchor="middle", rot=0):
        tr = f' transform="rotate({rot:.1f} {x:.3f} {-y:.3f})"' if rot else ""
        self.add(f'<text class="{cls}" x="{x:.3f}" y="{-y:.3f}" text-anchor="{anchor}" dominant-baseline="middle"{tr}>{s}</text>')

    def fleche(self, x, y0, y1, cls="fleche", pointe="pointe"):
        self.add(f'<path class="{cls}" d="M{x:.3f},{-y0:.3f} L{x:.3f},{-y1:.3f}" marker-end="url(#{pointe})"/>')

    def cote(self, a, b, off, label=None, cls="cote"):
        """Cote entre a et b, décalée de off (positif : à gauche du sens a → b)."""
        (ax, ay), (bx, by) = a, b
        L = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / L, (by - ay) / L
        nx, ny = -uy, ux
        s = 1 if off >= 0 else -1
        a2 = (ax + nx * off, ay + ny * off)
        b2 = (bx + nx * off, by + ny * off)
        for p, q in ((a, a2), (b, b2)):
            self.line(p[0] + nx * s * 0.25, p[1] + ny * s * 0.25, q[0] + nx * s * 0.35, q[1] + ny * s * 0.35, cls)
        self.line(*a2, *b2, cls)
        k = 0.28
        tx, ty = (ux + nx) * k, (uy + ny) * k
        for p in (a2, b2):
            self.line(p[0] - tx, p[1] - ty, p[0] + tx, p[1] + ty, cls + " tic")
        ang = -math.degrees(math.atan2(uy, ux))
        if ang > 90.1 or ang < -90.1:
            ang += 180
        mx, my = (a2[0] + b2[0]) / 2 + nx * s * 0.5, (a2[1] + b2[1]) / 2 + ny * s * 0.5
        self.text(mx, my, label if label is not None else f(L), "tc", rot=ang)

    def chaine(self, pts, off, a_x=None, a_y=None):
        """Cotes successives le long de x = a_x (verticale) ou y = a_y (horizontale)."""
        for u, v in zip(pts, pts[1:]):
            if a_x is not None:
                self.cote((a_x, u), (a_x, v), off)
            else:
                self.cote((u, a_y), (v, a_y), off)

    def coupe(self, x, y, lettre):
        self.line(x, y, x + 1.6, y, "coupe")
        self.text(x + 0.8, y - 0.8, lettre, "tb")
        self.fleche(x + 0.8, y, y + 1.5)

    def echelle(self, x, y):
        for i in range(2):
            self.rect(x + i * 5, y, x + i * 5 + 5, y + 0.35, "ech" + str(i))
        for v in (0, 5, 10):
            self.text(x + v, y - 0.7, f"{v} m" if v == 10 else str(v), "tp")

    def svg(self, vb, titre):
        x0, y0, w, hh = vb
        return (f'<svg viewBox="{x0} {y0} {w} {hh}" width="{w*PX:.0f}" role="img" aria-label="{titre}">'
                + "".join(self.e) + "</svg>")


def axes_fentes(fc):
    """Distances au seuil de l'axe de chaque fente du couloir."""
    n, w = fc["nombre"], fc["largeur"]
    if fc["pas"] is None:  # trumeaux égaux, aux deux bouts compris
        t = (COULOIR - n * w) / (n + 1)
        return [t * (k + 1) + w * (k + 0.5) for k in range(n)]
    premiere = (COULOIR - (n - 1) * fc["pas"]) / 2
    return [premiere + k * fc["pas"] for k in range(n)]


def generer(nom, V):
    global H, F_H
    H, F_H = V["hauteur"], V["hauteur_fentes"]
    P = V["puits"]
    FY0, FY1 = V["fente"]
    fc = V["fentes_couloir"]
    F_LARG = fc["largeur"]
    fentes = axes_fentes(fc)
    n_f = len(fentes)
    trumeau = fentes[0] - F_LARG / 2
    sx, sy, sz = V["soleil"]
    vertical = abs(sx) < 1e-6 and abs(sy) < 1e-6
    kx, ky = sx / -sz, sy / -sz  # décalage horizontal du soleil par mètre de chute
    # Puits : centre, éventuellement décalé vers le soleil pour centrer le faisceau sur l'œuvre à mi-hauteur
    pcx = pcy = 0.0
    if V.get("centrer_faisceau"):
        z = H + PUITS_P / 2 - OEUVRE[2] / 2
        pcx, pcy = round(-kx * z, 1), round(-ky * z, 1)
    # Lames (intervalles le long de x, depuis le bord ouest du puits) et vides entre elles
    lames, vides = [], []
    L = V.get("lames")
    if L:
        pos = pcx - P / 2
        for i, v in enumerate(L["vides"]):
            vides.append((pos, pos + v))
            pos += v
            if i < len(L["vides"]) - 1:
                lames.append((pos, pos + L["epaisseur"]))
                pos += L["epaisseur"]
        assert abs(pos - (pcx + P / 2)) < 1e-6, "lames et vides ne remplissent pas le puits"
    else:
        vides = [(pcx - P / 2, pcx + P / 2)]

    def passage(a0, a1, k):
        """Rayons qui traversent le puits (bords a0, a1 en haut et en bas) : abscisses en haut du puits."""
        return (a0, a1 - k * PUITS_P) if k >= 0 else (a0 - k * PUITS_P, a1)

    def faisceau(d, a0, a1, k):
        """Faisceau du soleil à travers le puits, dans une coupe (a : abscisse de la coupe)."""
        lo, hi = passage(a0, a1, k)
        if hi <= lo:
            return
        zt, dz = H + PUITS_P, k * (H + PUITS_P)
        if k >= 0:
            d.poly([(lo, zt), (hi, zt), (a1, H), (hi + dz, 0), (lo + dz, 0)], "faisceau")
        else:
            d.poly([(lo, zt), (hi, zt), (hi + dz, 0), (lo + dz, 0), (a0, H)], "faisceau")

    y_lo, y_hi = passage(pcy - P / 2, pcy + P / 2, ky)
    sol_y = (y_lo + ky * (H + PUITS_P), y_hi + ky * (H + PUITS_P))  # tache de soleil au sol (y)
    # Lueur du soleil sur le mur ouest, par la fente zénithale (soleil venant de l'est : kx < 0) :
    # les rayons qui passent l'arête de la fente touchent le mur jusqu'à la hauteur `lueur_bas`
    lueur_bas = None
    if kx < 0:
        xc = FENTE_L + FENTE_P * kx  # largeur éclairée au plafond, depuis le mur
        if xc > 0:
            lueur_bas = max(H - xc / -kx, 0.0)
    V = dict(V, modifs=[m.format(dy=f(abs(pcy)), dx=f(abs(pcx)), f_sol=f(sol_y[1] - sol_y[0]),
                                 lueur=f(round(lueur_bas or 0, 1))) for m in V["modifs"]])

    def lueur(d):
        """Lumière de la fente zénithale qui effleure le mur ouest (x = -h), dans une coupe est-ouest."""
        if lueur_bas is None:
            return
        d.poly([(-h, H + FENTE_P), (-h + FENTE_L, H + FENTE_P), (-h, lueur_bas)], "faisceau")
        d.line(-h + 0.12, lueur_bas, -h + 0.12, H, "lueur")
        d.cote((-h + 0.3, lueur_bas), (-h + 0.3, H), -1.2, f"cœur de la lueur {f(round(H - lueur_bas, 1))}")
    fente_couloir = max(0.0, -h - FY0)  # longueur de fente zénithale dans le couloir d'entrée
    long_fente = FY1 - FY0

    # =====================================================================
    # PLAN (nord en haut, x vers l'est, y vers le nord : repère Blender)
    # =====================================================================
    p = Dessin()
    for r, lab in ANNEAUX:
        p.circle(0, 0, r, "anneau")
        p.text(r * math.cos(math.radians(-38)) + 0.3, r * math.sin(math.radians(-38)) - 0.3, lab, "tn", "start")
    # Fente zénithale : dans la salle et, si elle s'y prolonge, dans le couloir d'entrée. Le couloir de
    # sortie est le couloir d'entrée de la salle suivante : il porte la même fente, côté salle suivante.
    p.rect(-h, max(FY0, -h), -h + FENTE_L, FY1, "lum")
    if fente_couloir:
        p.rect(-h, FY0, -h + FENTE_L, -h, "lum")
        p.rect(h - PORTE_L, h + COULOIR - fente_couloir, h - PORTE_L + FENTE_L, h + COULOIR, "lum")
    # Tache de soleil au sol, découpée par les lames (avant l'œuvre, qui la recouvre)
    for a0, a1 in vides:
        lo, hi = passage(a0, a1, kx)
        if hi > lo:
            p.rect(lo + kx * (H + PUITS_P), sol_y[0], hi + kx * (H + PUITS_P), sol_y[1], "tache")
    p.rect(pcx - P / 2, pcy - P / 2, pcx + P / 2, pcy + P / 2, "lum")
    for a0, a1 in lames:
        p.rect(a0, pcy - P / 2, a1, pcy + P / 2, "lame")
    # Œuvre
    w, d, _ = OEUVRE
    p.add(f'<rect class="oeuvre" x="{-w/2}" y="{-d/2}" width="{w}" height="{d}" rx="1.2"/>')
    p.text(0, 0.35, "ŒUVRE", "tb")
    p.text(0, -0.55, "H 10 m", "tp")
    p.fleche(0, -2.4, -3.4)
    p.text(0.45, -3.05, "face avant", "tn", "start")
    for (cx, cy), (bx, by) in BANCS:
        p.rect(cx - bx / 2, cy - by / 2, cx + bx / 2, cy + by / 2, "banc")
    p.text(0, -9.1, "banc 4,5 × 0,7 m, h 0,45", "tn")
    p.text(-8.6, 3.0, "banc 0,7 × 4,5 m", "tn", rot=-90)
    p.circle(0, -13, 0.35, "oeil")
    p.text(-0.7, -13, "vue d'arrivée", "tn", "end")

    # Murs de la salle (épaisseur indicative), percés des portes
    p.rect(-h - T, -h - T, -h, h + T, "mur")
    p.rect(h, -h - T, h + T, h + T, "mur")
    p.rect(-h + PORTE_L, -h - T, h + T, -h, "mur")
    p.rect(-h - T, h, h - PORTE_L, h + T, "mur")

    def couloir(sens, cote):
        """sens = +1 : sortie (nord, x de 11 à 15) ; -1 : entrée (sud, x de -15 à -11)."""
        xo, xe = (h - PORTE_L, h) if sens > 0 else (-h, -h + PORTE_L)  # bords ouest et est
        y0, yb = sens * h, sens * (h + COULOIR)
        if cote == "est":
            xa, xb = xe, xe + F_EP
            p.rect(xo - 0.2, y0, xo, yb, "mur")
        else:
            xa, xb = xo - F_EP, xo
            p.rect(xe, y0, xe + 0.2, yb, "mur")
        bord = 0
        for dd in fentes:
            p.rect(xa, y0 + sens * bord, xb, y0 + sens * (dd - F_LARG / 2), "mur")
            p.rect(xa, y0 + sens * (dd - F_LARG / 2), xb, y0 + sens * (dd + F_LARG / 2), "fente")
            bord = dd + F_LARG / 2
        p.rect(xa, y0 + sens * bord, xb, yb, "mur")
        p.line(xo, y0, xe, y0, "seuil")
        p.line(xo, yb, xe, yb, "seuil")
        dehors = xb + 1.4 if cote == "est" else xa - 1.4
        if not vertical:  # soleil propre au couloir, entré par les fentes (indicatif)
            for dd in fentes[::2]:
                yy = y0 + sens * dd
                p.add(f'<line class="rayon" x1="{dehors:.2f}" y1="{-yy:.2f}" x2="{(xa + xb) / 2:.2f}" y2="{-yy:.2f}" marker-end="url(#pointe-l)"/>')
        xt = xb + 1.0 if cote == "est" else xa - 1.0
        p.text(xt, sens * (h + COULOIR / 2), f"{n_f} fentes verticales ({cote})", "tl", rot=-90)
        return xa, xb

    xa_s, xb_s = couloir(+1, V["cote_fentes"]["sortie"])
    xa_e, xb_e = couloir(-1, V["cote_fentes"]["entree"])
    p.text(h - PORTE_L / 2, h - 3.0, "SORTIE", "tb")
    p.text(h - PORTE_L / 2, h - 3.8, f"4 × {f(H)} m", "tp")
    p.text(-h + PORTE_L / 2 + 0.5, -h + 3.8, "ENTRÉE", "tb")
    p.text(-h + PORTE_L / 2 + 0.5, -h + 3.0, f"4 × {f(H)} m", "tp")
    p.text(h - PORTE_L / 2 + 0.4, h + COULOIR / 2, "COULOIR DE SORTIE", "tb", rot=-90)
    p.text(-h + PORTE_L / 2 + 0.4, -h - COULOIR / 2, "COULOIR D'ENTRÉE", "tb", rot=-90)
    p.text(h - PORTE_L / 2, h + COULOIR + 1.2, "vers la salle suivante", "tn")
    p.text(-h + PORTE_L / 2, -h - COULOIR - 1.2, "depuis la salle précédente", "tn")
    # Ouvertures zénithales
    p.text(-h + FENTE_L + 0.5, 10.5, "FENTE ZÉNITHALE au plafond", "tl", "start")
    p.text(-h + FENTE_L + 0.5, 9.7, f"{f(FENTE_L)} × {f(long_fente)} m, profondeur {f(FENTE_P)} m", "tp", "start")
    if lueur_bas is not None:
        p.rect(-h, FY0, -h + 0.3, FY1, "tache")
        p.text(-h + FENTE_L + 0.5, 8.1, "lueur sur le mur ouest, intense sous le plafond, éteinte vers 9 m du sol", "tp", "start")
    if fente_couloir:
        p.text(-h + FENTE_L + 0.5, 8.9, f"dont {f(fente_couloir)} m dans le couloir d'entrée", "tp", "start")
    decale = bool(pcy or lames)  # puits décalé et lames : étiquette au-dessus, cote de largeur en haut
    yp = pcy + (P / 2 + 2.9 if decale else P / 2 - 0.9 if P >= 8 else P / 2 + 1.5)
    p.text(pcx, yp, "PUITS DE LUMIÈRE" + (" ET LAMES" if lames else ""), "tl")
    p.text(pcx, yp - 0.8, f"au plafond, profondeur {f(PUITS_P)} m", "tp")


    # Cotes : salle et portes
    p.cote((-h, h), (h - PORTE_L, h), -1.3)
    p.cote((h - PORTE_L, h), (h, h), -1.3)
    p.cote((-h, -h), (-h + PORTE_L, -h), 1.3)
    p.cote((-h + PORTE_L, -h), (h, -h), 1.3)
    p.chaine([-h - COULOIR, -h, h, h + COULOIR], -2.2, a_x=h + T)
    p.cote((h + T, -h - COULOIR), (h + T, h + COULOIR), -4.4, f"{f(C + 2 * COULOIR)} (couloir + salle + couloir)")
    if FY0 > -h or FY1 < h:  # sinon la chaîne de la fente donne déjà les 30 m
        p.cote((-h, -h), (-h, h), 2.2)
    # Fente zénithale, à l'extérieur du mur ouest
    p.chaine(sorted({FY0, FY1, -h, h}), 3.6, a_x=-h)
    if fente_couloir:
        p.cote((-h, FY0), (-h, FY1), 5.0, f"{f(long_fente)} (fente zénithale)")
    p.cote((-h, -8), (-h + FENTE_L, -8), -1.0)
    # Puits, bancs
    if decale:
        p.cote((pcx - P / 2, pcy + P / 2), (pcx + P / 2, pcy + P / 2), 0.9)
    else:
        p.cote((pcx - P / 2, pcy - P / 2), (pcx + P / 2, pcy - P / 2), -1.4)
    p.cote((pcx + P / 2, pcy - P / 2), (pcx + P / 2, pcy + P / 2), -1.4)
    if pcy:  # position du puits décalé, entre les murs sud et nord
        p.cote((pcx + P / 2, -h), (pcx + P / 2, pcy - P / 2), -3.0)
        p.cote((pcx + P / 2, pcy + P / 2), (pcx + P / 2, h), -3.0)
    p.cote((0, 0), (0, -8), -3.0, "8")
    p.cote((0, 3.0), (-7.5, 3.0), -4.3 if decale else -3.2, "7,5")
    # Couloirs : largeur et paroi à fentes
    p.cote((h - PORTE_L, h + COULOIR), (h, h + COULOIR), 2.2)
    if V["cote_fentes"]["sortie"] == "est":
        p.cote((h, h + COULOIR), (h + F_EP, h + COULOIR), 2.2, "0,5")
    else:
        p.cote((h - PORTE_L - F_EP, h + COULOIR), (h - PORTE_L, h + COULOIR), 2.2, "0,5")
    p.cote((-h, -h - COULOIR), (-h + PORTE_L, -h - COULOIR), -2.2)
    # Coupes
    p.line(-h - 7.6, 0, h + 7.6, 0, "trait-coupe")
    p.coupe(-h - 8.6, 0, "A")
    p.coupe(h + 7.6, 0, "A")
    yB = -h - fente_couloir / 2 if fente_couloir else None
    if yB is not None:
        p.line(-h - 7.6, yB, xb_e + 3.0, yB, "trait-coupe")
        p.coupe(-h - 8.6, yB, "B")
        p.coupe(xb_e + 3.0, yB, "B")
    if V.get("centrer_faisceau") or lames:
        p.line(0, -h - 3.2, 0, h + 3.2, "trait-coupe")
        for y0 in (-h - 3.2, h + 1.6):
            p.line(0, y0, 0, y0 + 1.6, "coupe")
            p.text(0.8, y0 + 0.8, "C", "tb")
            p.add(f'<path class="fleche" d="M0,{-(y0 + 0.8):.3f} L-1.5,{-(y0 + 0.8):.3f}" marker-end="url(#pointe)"/>')
    # Nord et soleil
    nx0, ny0 = -h - 6.5, h + 9
    p.add(f'<g transform="translate({nx0},{-ny0})"><circle class="boussole" r="1.6"/>'
          f'<path class="nord" d="M0,-1.5 L0.6,0.6 L0,0.1 L-0.6,0.6 Z"/>'
          f'<text class="tb" x="0" y="-2.3" text-anchor="middle" dominant-baseline="middle">N</text></g>')
    g = f'<g transform="translate({nx0},{-ny0 + 6})"><circle class="soleil" r="0.6"/>'
    if vertical:
        g += ('<text class="tn" x="0" y="1.5" text-anchor="middle">soleil vertical</text>'
              '<text class="tn" x="0" y="2.4" text-anchor="middle">(au zénith)</text></g>')
    else:
        az = math.atan2(-sx, -sy) % (2 * math.pi)  # direction du soleil (vers lui), depuis le nord, sens horaire
        g += (f'<line class="rayon" x1="{math.sin(az)*3:.2f}" y1="{-math.cos(az)*3:.2f}" x2="{math.sin(az)*1:.2f}" y2="{-math.cos(az)*1:.2f}" marker-end="url(#pointe-l)"/>'
              f'<text class="tn" x="0" y="2.2" text-anchor="middle">soleil de la salle</text>'
              f'<text class="tn" x="0" y="3.1" text-anchor="middle">azimut {round(math.degrees(az))}°, haut. {round(math.degrees(math.asin(-sz)))}°</text></g>')
    p.add(g)
    p.echelle(0, -h - COULOIR - 1)
    plan = p.svg((-h - 10.5, -(h + COULOIR + 4.5), C + 23, 2 * (h + COULOIR) + 7.5), "Plan de la salle")

    # =====================================================================
    # COUPE A–A (est-ouest par le centre, vue vers le nord) : x, z
    # =====================================================================
    c = Dessin()
    c.rect(-h, H, -h + FENTE_L, H + FENTE_P, "lum")
    c.rect(pcx - P / 2, H, pcx + P / 2, H + PUITS_P, "lum")
    # Soleil par le puits (projection est-ouest) ; k : décalage par mètre de descente
    for a0, a1 in vides:
        faisceau(c, a0, a1, kx)
    for a0, a1 in lames:
        c.rect(a0, H + PUITS_P - L["hauteur"], a1, H + PUITS_P, "mur")
    if vertical:
        c.rect(-h, 0, -h + FENTE_L, H + FENTE_P, "faisceau")
    lueur(c)
    c.rect(h - PORTE_L, 0, h, H, "porte-loin")
    c.text(h - PORTE_L / 2, H / 2 + 0.8, "porte de sortie", "tn", rot=-90)
    c.text(h - PORTE_L / 2 + 0.9, H / 2 + 0.8, "(au-delà, mur nord)", "tn", rot=-90)
    c.rect(-h - T, -0.6, h + T, 0, "mur")
    c.rect(-h - T, 0, -h, H + FENTE_P, "mur")
    c.rect(h, 0, h + T, H + 0.6, "mur")
    c.rect(-h + FENTE_L, H, pcx - P / 2, H + 0.6, "mur")
    c.rect(pcx + P / 2, H, h, H + 0.6, "mur")
    c.rect(-h + FENTE_L, H, -h + FENTE_L + 0.25, H + FENTE_P, "mur")
    c.rect(pcx - P / 2 - 0.25, H, pcx - P / 2, H + PUITS_P, "mur")
    c.rect(pcx + P / 2, H, pcx + P / 2 + 0.25, H + PUITS_P, "mur")
    c.add(f'<rect class="oeuvre" x="{-OEUVRE[0]/2}" y="{-OEUVRE[2]}" width="{OEUVRE[0]}" height="{OEUVRE[2]}" rx="1.5"/>')
    c.text(0, 5.5, "ŒUVRE", "tb")
    c.text(0, 4.6, "gabarit 6,6 m", "tp")
    c.add('<g class="visiteur" transform="translate(9,0)"><circle cx="0" cy="-1.55" r="0.15"/>'
          '<path d="M0,-1.4 L0,-0.75 M-0.25,0 L0,-0.75 L0.25,0 M-0.3,-1.1 L0.3,-1.1"/></g>')
    c.line(9, 1.7, 3.4, 9.0, "regard")
    c.text(8.5, 2.4, "œil à 1,70 m", "tn", "end")
    c.text(-h + FENTE_L / 2, H + FENTE_P + 0.9, "fente", "tl")
    c.text(0, H + PUITS_P + 0.9, "puits de lumière", "tl")
    c.text(pcx - P / 2 + min(kx, 0) * (H + PUITS_P) - 0.3, 0.8, "soleil au sol", "tn", "end")
    c.cote((-h, -0.6), (h, -0.6), -1.4)
    c.cote((h + T, 0), (h + T, H), -1.6)
    c.cote((h + T, 0), (h + T, 1.7), -3.6, "1,7")
    c.cote((-h - T, H), (-h - T, H + FENTE_P), 1.6)
    c.cote((-h - T, 0), (-h - T, H), 1.6)
    c.cote((-h, H + FENTE_P), (-h + FENTE_L, H + FENTE_P), 1.9, "0,9")
    c.cote((pcx - P / 2, H + PUITS_P), (pcx + P / 2, H + PUITS_P), 2.2)
    c.cote((pcx + P / 2 + 0.25, H), (pcx + P / 2 + 0.25, H + PUITS_P), -1.4)
    if lames:
        c.cote((vides[0][0], H + PUITS_P), (vides[0][1], H + PUITS_P), 1.0)
        c.text(pcx, H + PUITS_P - L["hauteur"] - 0.7, f"{len(lames)} lames de {f(L['epaisseur'])} × {f(L['hauteur'])} m", "tn")
    c.cote((-OEUVRE[0] / 2, 0), (-OEUVRE[0] / 2, OEUVRE[2]), 1.4)
    c.cote((0, 0), (9, 0), -0.9, "9")
    c.text(pcx + P / 2 + 3.0, H + 2.4, "toiture : épaisseur non modélisée", "tn", "start")
    c.echelle(-h, -5.0)
    coupe = c.svg((-h - 5, -(H + PUITS_P + 3.5), C + 14, H + PUITS_P + 10), "Coupe A–A")

    # =====================================================================
    # COUPE C–C (nord-sud par le centre, vue vers l'ouest : le sud est à gauche) : y, z
    # =====================================================================
    coupe_c = ""
    if V.get("centrer_faisceau") or lames:
        q = Dessin()
        y0, y1 = pcy - P / 2, pcy + P / 2
        q.rect(y0, H, y1, H + PUITS_P, "lum")
        faisceau(q, y0, y1, ky)
        if lames:  # vues de face, au-delà de la coupe
            q.rect(y0, H + PUITS_P - L["hauteur"], y1, H + PUITS_P, "lame-loin")
        q.rect(-h - T, -0.6, h + T, 0, "mur")
        q.rect(-h - T, 0, -h, H + 0.6, "mur")
        q.rect(h, 0, h + T, H + 0.6, "mur")
        q.rect(-h, H, y0, H + 0.6, "mur")
        q.rect(y1, H, h, H + 0.6, "mur")
        q.rect(y0 - 0.25, H, y0, H + PUITS_P, "mur")
        q.rect(y1, H, y1 + 0.25, H + PUITS_P, "mur")
        q.add(f'<rect class="oeuvre" x="{-OEUVRE[1]/2}" y="{-OEUVRE[2]}" width="{OEUVRE[1]}" height="{OEUVRE[2]}" rx="1.2"/>')
        q.text(0, 5.5, "ŒUVRE", "tb")
        q.text(0, 4.6, "gabarit 3,9 m", "tp")
        q.add('<g class="visiteur" transform="translate(-13,0)"><circle cx="0" cy="-1.55" r="0.15"/>'
              '<path d="M0,-1.4 L0,-0.75 M-0.25,0 L0,-0.75 L0.25,0 M-0.3,-1.1 L0.3,-1.1"/></g>')
        q.line(-13, 1.7, -1.0, 9.0, "regard")
        q.text(-13.4, 2.6, "vue d'arrivée", "tn", "start")
        q.text(-h + 0.6, H + PUITS_P + 2.6, "SUD", "tb", "start")
        q.text(h - 0.6, H + PUITS_P + 2.6, "NORD", "tb", "end")
        if not vertical:
            ang = round(math.degrees(math.atan(abs(ky))))
            q.text(y0 - 0.6, H + PUITS_P + 1.0, f"soleil à {ang}° de la verticale", "tl", "end")
        q.text((sol_y[0] + sol_y[1]) / 2, -1.3, f"soleil au sol : {f(sol_y[1] - sol_y[0])} m", "tn")
        q.cote((-h, -0.6), (h, -0.6), -2.4)
        q.cote((-h, H + 0.6), (y0, H + 0.6), 1.6)
        q.cote((y0, H + PUITS_P), (y1, H + PUITS_P), 2.4)
        q.cote((y1, H + 0.6), (h, H + 0.6), 1.6)
        q.cote((h + T, 0), (h + T, H), -1.6)
        q.cote((y1 + 0.25, H), (y1 + 0.25, H + PUITS_P), -1.4)
        q.cote((-OEUVRE[1] / 2, 0), (-OEUVRE[1] / 2, OEUVRE[2]), 1.4)
        q.echelle(-h, -5.5)
        coupe_c = q.svg((-h - 5, -(H + PUITS_P + 4.5), C + 12, H + PUITS_P + 11.5), "Coupe C–C")

    # =====================================================================
    # COUPE B–B (couloir d'entrée, sous la fente zénithale, vue vers la salle)
    # =====================================================================
    coupe_b = ""
    if fente_couloir:
        b = Dessin()
        xo, xe = -h, -h + PORTE_L
        b.rect(xo, H, xo + FENTE_L, H + FENTE_P, "lum")
        if vertical:
            b.rect(xo, 0, xo + FENTE_L, H + FENTE_P, "faisceau")
        lueur(b)
        b.rect(xo - T, -0.6, xe + F_EP + 0.3, 0, "mur")
        b.rect(xo - T, 0, xo, H + FENTE_P, "mur")
        b.rect(xo + FENTE_L, H, xo + FENTE_L + 0.25, H + FENTE_P, "mur")
        b.rect(xo + FENTE_L, H, xe + F_EP, H + 0.6, "mur")
        b.rect(xe, 0, xe + F_EP, H, "mur")
        b.add('<g class="visiteur" transform="translate(-12.6,0)"><circle cx="0" cy="-1.55" r="0.15"/>'
              '<path d="M0,-1.4 L0,-0.75 M-0.25,0 L0,-0.75 L0.25,0 M-0.3,-1.1 L0.3,-1.1"/></g>')
        b.text(xo + FENTE_L / 2, H + FENTE_P + 0.9, "fente zénithale", "tl")
        b.text(xe + F_EP + 0.9, H / 2, f"paroi à fentes (est) : fentes de {f(F_LARG)} × {f(F_H)} m", "tn", rot=-90)
        b.text(xo - T - 0.9, H / 2, "mur ouest, dans le prolongement de la salle", "tn", rot=-90)
        b.cote((xo, -0.6), (xe, -0.6), -1.4)
        b.cote((xe, -0.6), (xe + F_EP, -0.6), -1.4, "0,5")
        b.cote((xe + F_EP, 0), (xe + F_EP, H), -2.4)
        b.cote((xo - T, H), (xo - T, H + FENTE_P), 2.6)
        b.cote((xo, H + FENTE_P), (xo + FENTE_L, H + FENTE_P), 1.9, "0,9")
        b.echelle(xo - 6, -5.0)
        coupe_b = b.svg((xo - 8, -(H + FENTE_P + 3.5), PORTE_L + 15, H + FENTE_P + 10), "Coupe B–B")

    # =====================================================================
    # ÉLÉVATION de la paroi à fentes, vue depuis le couloir
    # =====================================================================
    e = Dessin()
    e.rect(0, 0, COULOIR, H, "paroi")
    for dd in fentes:
        e.rect(dd - F_LARG / 2, 0, dd + F_LARG / 2, F_H, "fente")
    e.rect(-0.6, -0.6, COULOIR + 0.6, 0, "mur")
    e.line(0, 0, 0, H, "seuil")
    e.line(COULOIR, 0, COULOIR, H, "seuil")
    # Vue vers la paroi : vers l'est, le nord (salle suivante) est à gauche ; vers l'ouest, à droite
    gauche, droite = "porte de la salle", "porte de la salle suivante"
    if V["cote_fentes"]["sortie"] == "est":
        gauche, droite = droite, gauche
    e.text(-1.1, H / 2, gauche, "tn", rot=-90)
    e.text(COULOIR + 1.1, H / 2, droite, "tn", rot=-90)
    e.cote((0, H), (trumeau, H), 1.2)
    e.cote((fentes[-1] + F_LARG / 2, H), (COULOIR, H), 1.2)
    e.cote((0, H), (COULOIR, H), 2.8)
    e.cote((fentes[0] - F_LARG / 2, F_H), (fentes[0] + F_LARG / 2, F_H), 3.0, f(F_LARG))
    e.cote((fentes[0], F_H), (fentes[1], F_H), 1.3, f(fentes[1] - fentes[0]))
    e.cote((COULOIR, 0), (COULOIR, F_H), -3.0)
    e.cote((COULOIR, F_H), (COULOIR, H), -3.0)
    e.cote((COULOIR, 0), (COULOIR, H), -5.0)
    if fc["pas"] is None:
        detail = f"{n_f} fentes de {f(F_LARG)} × {f(F_H)} m, trumeaux égaux de {f(trumeau)} m (aux bouts compris), entraxe {f(fentes[1] - fentes[0])} m"
    else:
        detail = f"{n_f} fentes de {f(F_LARG)} × {f(F_H)} m, entraxe {f(fc['pas'])} m, paroi de 0,5 m d'épaisseur"
    e.text(COULOIR / 2, -2.0, f"{n_f} fentes de {f(F_LARG)} × {f(F_H)} m", "tl")
    e.echelle(0, -4.4)
    elev = e.svg((-3.5, -(H + 5.5), COULOIR + 12, H + 11), "Élévation de la paroi à fentes")

    # =====================================================================
    if vertical:
        soleil_txt = "vertical, au zénith : il tombe droit par le puits et la fente zénithale"
    else:
        soleil_txt = "salle : venant du sud-est, haut de 79° (entre par le puits) ; couloir : 32°, réglable à part"
    lignes = [
        ("Salle", f"30 × 30 m, {f(H)} m sous plafond"),
        ("Œuvre", "10 m de haut, emprise maximale ≈ 6,6 × 3,9 m, au centre, face au sud"),
        ("Puits de lumière", f"{f(P)} × {f(P)} m au-dessus de l'œuvre, {f(PUITS_P)} m de profondeur (sommet à {f(H + PUITS_P)} m)"),
        ("Fente zénithale", f"{f(FENTE_L)} × {f(long_fente)} m le long du mur ouest, {f(FENTE_P)} m de profondeur"
         + (f", dont {f(fente_couloir)} m dans le couloir d'entrée" if fente_couloir else ", à 2,5 m des murs nord et sud")),
        ("Portes", f"2 portes de 4 m de large, pleine hauteur ({f(H)} m), au bord droit de leur mur vu de l'intérieur : entrée au sud (côté ouest), sortie au nord (côté est)"),
        ("Couloirs", f"14 m de long, 4 m de large, {f(H)} m de haut"),
        ("Fentes des couloirs", detail + ", dans la paroi "
         + ("est des deux couloirs" if set(V["cote_fentes"].values()) == {"est"} else "est du couloir d'entrée, ouest du couloir de sortie")),
        ("Bancs", "4,5 × 0,7 m, h 0,45 m : au sud à 8 m du centre, à l'ouest à 7,5 m (décalé de 3 m vers le nord)"),
        ("Navigation", "œil à 1,70 m ; vue d'arrivée à 13 m (sud), cercle à 9 m, cercle réduit à 5,5 m"),
        ("Soleil", soleil_txt),
    ]
    table = "".join(f"<tr><th>{a}</th><td>{b}</td></tr>" for a, b in lignes)
    modifs = ""
    if V["modifs"]:
        modifs = ("<h2>Modifications</h2><ul>" + "".join(f"<li>{m}</li>" for m in V["modifs"]) + "</ul>"
                  + "<h2>À trancher</h2><ul class='q'>" + "".join(f"<li>{q}</li>" for q in V["questions"]) + "</ul>")
    legende_puits = ('<span class="l-tache">soleil au sol</span><span class="l-lame">lames du puits (au plafond)</span>'
                     if lames else "")
    fig_c = ""
    if coupe_c:
        fig_c = ("<h2>Coupe C–C</h2><p class='note'>Nord-sud par le centre, vue vers l'ouest (le sud, côté arrivée, est à gauche). "
                 "Le puits est décalé vers le soleil : le faisceau incliné tombe sur l'œuvre, du sol à son sommet.</p>"
                 f"<figure>{coupe_c}</figure>")
    fig_b = ""
    if coupe_b:
        fig_b = (f"<h2>Coupe B–B</h2><p class='note'>Dans le couloir d'entrée, à {f(fente_couloir / 2)} m de la porte, vue vers la salle (nord). "
                 f"Le couloir de sortie, qui est celui d'entrée de la salle suivante, est identique.</p><figure>{coupe_b}</figure>")
    rayons = "" if vertical else " Elle reçoit le soleil du dehors."

    html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{V["titre"]}</title>
<style>
  :root {{ --encre:#24221f; --fond:#f7f5f1; --mur:#3a3631; --gris:#8b857c; --lum:#d79a2b; --porte:#2f6db5; }}
  body {{ margin:0; background:var(--fond); color:var(--encre); font:15px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; }}
  main {{ max-width:1100px; margin:0 auto; padding:32px 16px 64px; }}
  h1 {{ font-size:26px; margin:0 0 4px; }} h2 {{ font-size:18px; margin:40px 0 4px; }}
  .sous {{ color:var(--gris); margin:0 0 16px; }}
  ul {{ margin:8px 0 0; padding-left:20px; }} li {{ margin:4px 0; }} ul.q li {{ color:#6b4a0c; }}
  figure {{ margin:0; overflow-x:auto; background:#fff; border:1px solid #e3ded6; border-radius:8px; padding:12px; }}
  svg {{ display:block; max-width:100%; height:auto; margin:0 auto; }}
  .legende {{ display:flex; flex-wrap:wrap; gap:8px 20px; margin:10px 0 0; font-size:13px; color:#555; }}
  .legende span::before {{ content:""; display:inline-block; width:14px; height:10px; margin-right:6px; vertical-align:-1px; border:1px solid; }}
  .l-mur::before {{ background:var(--mur); border-color:var(--mur)!important; }}
  .l-lum::before {{ background:rgba(215,154,43,.22); border-color:var(--lum)!important; border-style:dashed!important; }}
  .l-fente::before {{ background:#ffe7b0; border-color:var(--lum)!important; }}
  .l-porte::before {{ background:none; border-color:var(--porte)!important; border-style:dashed!important; }}
  .l-tache::before {{ background:rgba(255,206,110,.5); border-color:rgba(255,206,110,.5)!important; }}
  .l-lame::before {{ background:rgba(58,54,49,.18); border-color:var(--mur)!important; border-style:dashed!important; }}
  .l-anneau::before {{ background:none; border-color:#9bb5a0!important; border-style:dashed!important; border-radius:50%; }}
  table {{ border-collapse:collapse; width:100%; margin-top:8px; font-size:14px; background:#fff; }}
  th, td {{ text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid #e8e3dc; }}
  th {{ width:150px; }}
  .note {{ color:#555; font-size:13.5px; }}
  /* Dessin (unités : mètres) */
  .mur {{ fill:var(--mur); }}
  .paroi {{ fill:#d6d0c6; stroke:var(--mur); stroke-width:.08; }}
  .lum {{ fill:rgba(215,154,43,.2); stroke:var(--lum); stroke-width:.09; stroke-dasharray:.4 .25; }}
  .fente {{ fill:#ffe7b0; stroke:var(--lum); stroke-width:.06; }}
  .faisceau {{ fill:rgba(255,206,110,.28); stroke:none; }}
  .tache {{ fill:rgba(255,206,110,.35); stroke:none; }}
  .lueur {{ stroke:rgba(240,170,50,.9); stroke-width:.24; }}
  .lame {{ fill:rgba(58,54,49,.18); stroke:var(--mur); stroke-width:.05; stroke-dasharray:.25 .15; }}
  .lame-loin {{ fill:rgba(58,54,49,.35); stroke:var(--mur); stroke-width:.04; }}
  .oeuvre {{ fill:rgba(36,34,31,.06); stroke:var(--encre); stroke-width:.08; stroke-dasharray:.3 .18; }}
  .banc {{ fill:#b9b1a5; stroke:var(--mur); stroke-width:.06; }}
  .anneau {{ fill:none; stroke:#9bb5a0; stroke-width:.07; stroke-dasharray:.5 .35; }}
  .oeil {{ fill:#5d8a66; }}
  .seuil {{ stroke:var(--porte); stroke-width:.1; stroke-dasharray:.35 .25; }}
  .porte-loin {{ fill:none; stroke:var(--porte); stroke-width:.08; stroke-dasharray:.35 .25; }}
  .rayon {{ stroke:var(--lum); stroke-width:.09; }}
  .regard {{ stroke:#5d8a66; stroke-width:.06; stroke-dasharray:.3 .2; }}
  .visiteur {{ fill:none; stroke:var(--encre); stroke-width:.08; }}
  .cote {{ stroke:#6f6a63; stroke-width:.045; }} .tic {{ stroke-width:.09; }}
  .coupe {{ stroke:#c0392b; stroke-width:.14; }}
  .trait-coupe {{ stroke:#c0392b; stroke-width:.04; stroke-dasharray:1 .3 .15 .3; opacity:.6; }}
  .fleche {{ stroke:#c0392b; stroke-width:.1; fill:none; }}
  .boussole {{ fill:#fff; stroke:var(--encre); stroke-width:.07; }} .nord {{ fill:var(--encre); }}
  .soleil {{ fill:var(--lum); }}
  .ech0 {{ fill:var(--encre); }} .ech1 {{ fill:#fff; stroke:var(--encre); stroke-width:.05; }}
  text {{ font-family:-apple-system, "Helvetica Neue", Arial, sans-serif; fill:var(--encre); }}
  .t {{ font-size:.7px; }} .tc {{ font-size:.62px; fill:#4a4640; }} .tb {{ font-size:.72px; font-weight:700; letter-spacing:.03px; }}
  .tl {{ font-size:.66px; font-weight:600; fill:#8a5d0c; }} .tp {{ font-size:.58px; fill:#555; }} .tn {{ font-size:.56px; fill:#6a655e; }}
</style></head>
<body><main>
<h1>{V["titre"]}</h1>
<p class="sous">{V["sous"]}</p>
{modifs}
<svg width="0" height="0" style="position:absolute"><defs>
  <marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#c0392b"/></marker>
  <marker id="pointe-l" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#d79a2b"/></marker>
</defs></svg>

<h2>Plan</h2>
<p class="note">Nord en haut. Le puits et la fente zénithale sont au plafond (tracés en pointillés). Les anneaux verts sont les trajets de la caméra autour de l'œuvre.</p>
<figure>{plan}
<div class="legende"><span class="l-mur">murs (épaisseur indicative, sauf paroi à fentes : 0,5 m)</span><span class="l-lum">ouverture au plafond</span><span class="l-fente">fente des couloirs</span><span class="l-porte">porte / seuil</span><span class="l-anneau">trajets de la caméra</span>{legende_puits}</div>
</figure>

<h2>Coupe A–A</h2>
<p class="note">Est-ouest par le centre, vue vers le nord. Le faisceau de soleil est indicatif (projection sur ce plan).</p>
<figure>{coupe}</figure>
{fig_c}
{fig_b}
<h2>Paroi à fentes d'un couloir</h2>
<p class="note">Élévation vue depuis l'intérieur du couloir de sortie.{rayons} La paroi d'en face est pleine.</p>
<figure>{elev}</figure>

<h2>Récapitulatif</h2>
<table>{table}</table>
<p class="note">Dans le modèle, murs, sol et plafond sont des surfaces sans épaisseur : les épaisseurs dessinées sont là pour la lisibilité.</p>
</main></body></html>
"""
    with open(os.path.join(ICI, V["fichier"]), "w") as sortie:
        sortie.write(html)
    print(nom, "→", V["fichier"], "| fentes du couloir :", [round(x, 3) for x in fentes])


for nom in sys.argv[1:] or VERSIONS:
    generer(nom, VERSIONS[nom])
