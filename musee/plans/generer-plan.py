"""Génère plans/salle-provisoire.html : plan, coupe et élévation cotés de la salle provisoire.
Valeurs reprises de blender/salle.py, src/salles/provisoire/config.ts et src/scene/Couloir.tsx."""
import math, sys

OUT = sys.argv[1]
PX = 18  # pixels par mètre à l'écran

# --- Valeurs du modèle ---------------------------------------------------
C, H = 30.0, 20.0
h = C / 2
PUITS, PUITS_P = 5.0, 5.0
FENTE_L, FENTE_LONG, FENTE_P = 0.9, 25.0, 3.0
PORTE_L = 4.0
COULOIR = 14.0
F_LARG, F_PAS, F_EP, F_H, F_MARGE = 0.4, 1.6, 0.5, 16.0, 1.8
n_f = int((COULOIR - 2 * F_MARGE) // F_PAS) + 1
premiere = (COULOIR - (n_f - 1) * F_PAS) / 2          # distance au seuil de la 1re fente (axe)
fentes = [premiere + k * F_PAS for k in range(n_f)]
BANCS = [((0, -8.0), (4.5, 0.7)), ((-7.5, 3.0), (0.7, 4.5))]
OEUVRE = (6.6, 3.9, 10.0)  # emprise maxi (x, y) et hauteur, modèle de 8 m × 1,25
ANNEAUX = [(5.5, "cercle réduit 5,5 m"), (9, "cercle 9 m"), (13, "vue d'arrivée 13 m")]
T = 0.5  # épaisseur de mur dessinée (indicative)

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

    def echelle(self, x, y):
        for i in range(2):
            self.rect(x + i * 5, y, x + i * 5 + 5, y + 0.35, "ech" + str(i))
        for v in (0, 5, 10):
            self.text(x + v, y - 0.7, f"{v} m" if v == 10 else str(v), "tp")

    def svg(self, vb, titre):
        x0, y0, w, hh = vb
        return (f'<svg viewBox="{x0} {y0} {w} {hh}" width="{w*PX:.0f}" role="img" aria-label="{titre}">'
                + "".join(self.e) + "</svg>")


# =========================================================================
# PLAN (nord en haut, x vers l'est, y vers le nord : repère Blender)
# =========================================================================
p = Dessin()
# Anneaux de navigation
for r, lab in ANNEAUX:
    p.circle(0, 0, r, "anneau")
    p.text(r * math.cos(math.radians(-38)) + 0.3, r * math.sin(math.radians(-38)) - 0.3, lab, "tn", "start")
# Fente zénithale (au plafond)
p.rect(-h, -FENTE_LONG / 2, -h + FENTE_L, FENTE_LONG / 2, "lum")
# Puits (au plafond)
p.rect(-PUITS / 2, -PUITS / 2, PUITS / 2, PUITS / 2, "lum")
# Tache de soleil indicative au sol (projection du puits selon le soleil)
sx, sy, sz = -0.1572, 0.0983, -0.9827
dx, dy = sx / -sz * (H + PUITS_P), sy / -sz * (H + PUITS_P)
# Œuvre
w, d, _ = OEUVRE
p.add(f'<rect class="oeuvre" x="{-w/2}" y="{-d/2}" width="{w}" height="{d}" rx="1.2"/>')
p.text(0, 0.35, "ŒUVRE", "tb")
p.text(0, -0.55, "H 10 m", "tp")
p.add('<path class="fleche" d="M0,2.4 L0,3.4" marker-end="url(#pointe)"/>')
p.text(0.45, -3.05, "face avant", "tn", "start")
# Bancs
for (cx, cy), (bx, by) in BANCS:
    p.rect(cx - bx / 2, cy - by / 2, cx + bx / 2, cy + by / 2, "banc")
p.text(0, -9.1, "banc 4,5 × 0,7 m, h 0,45", "tn")
p.text(-8.6, 3.0, "banc 0,7 × 4,5 m", "tn", rot=-90)
# Vue d'arrivée
p.circle(0, -13, 0.35, "oeil")
p.text(-0.7, -13, "vue d'arrivée", "tn", "end")

# Murs de la salle (épaisseur indicative), percés des portes
p.rect(-h - T, -h - T, -h, h + T, "mur")              # ouest
p.rect(h, -h - T, h + T, h + T, "mur")                # est
p.rect(-h + PORTE_L, -h - T, h + T, -h, "mur")        # sud, porte d'entrée à l'ouest
p.rect(-h - T, h, h - PORTE_L, h + T, "mur")          # nord, porte de sortie à l'est


def couloir(sens):
    """sens = +1 : sortie (nord, x de 11 à 15) ; -1 : entrée (sud, x de -15 à -11)."""
    if sens > 0:
        xp, xf, ext = h - PORTE_L, h, 1     # paroi à fentes à l'ouest (x = 11), paroi pleine à l'est
    else:
        xp, xf, ext = -h + PORTE_L, -h, -1  # paroi à fentes à l'est (x = -11), paroi pleine à l'ouest
    y0 = sens * h
    yb = sens * (h + COULOIR)
    # Paroi pleine (0,2 m dans le modèle)
    p.rect(xf, y0, xf + 0.2 * (1 if sens > 0 else -1), yb, "mur")
    # Paroi à fentes : trumeaux
    xa, xb = (xp - F_EP, xp) if sens > 0 else (xp, xp + F_EP)
    bord = 0
    for dd in fentes:
        p.rect(xa, y0 + sens * bord, xb, y0 + sens * (dd - F_LARG / 2), "mur")
        p.rect(xa, y0 + sens * (dd - F_LARG / 2), xb, y0 + sens * (dd + F_LARG / 2), "fente")
        bord = dd + F_LARG / 2
    p.rect(xa, y0 + sens * bord, xb, yb, "mur")
    # Seuil et bout du couloir
    p.line(xf, y0, xp, y0, "seuil")
    p.line(xf - 0.2 * (1 if sens < 0 else -1) * 0, yb, xp, yb, "seuil")
    # Rayons du soleil dans les fentes (indicatif)
    for dd in fentes[::2]:
        yy = y0 + sens * dd
        dxr = -ext * 1.6 if sens > 0 else 1.6
        p.add(f'<line class="rayon" x1="{xa - 1.4 if sens > 0 else xb + 1.4:.2f}" y1="{-yy:.2f}" '
              f'x2="{(xa + xb) / 2:.2f}" y2="{-yy:.2f}" marker-end="url(#pointe-l)"/>')
    return xp, xf, y0, yb


xs, xfs, y0s, ybs = couloir(+1)
xe, xfe, y0e, ybe = couloir(-1)
# Étiquettes des portes et couloirs
p.text(h - PORTE_L / 2, h - 3.0, "SORTIE", "tb")
p.text(h - PORTE_L / 2, h - 3.8, "4 × 20 m", "tp")
p.text(-h + PORTE_L / 2 + 0.5, -h + 3.8, "ENTRÉE", "tb")
p.text(-h + PORTE_L / 2 + 0.5, -h + 3.0, "4 × 20 m", "tp")
p.text(h - PORTE_L / 2, h + COULOIR / 2, "COULOIR DE SORTIE", "tb", rot=-90)
p.text(-h + PORTE_L / 2, -h - COULOIR / 2, "COULOIR D'ENTRÉE", "tb", rot=-90)
p.text(h - PORTE_L / 2, h + COULOIR + 1.2, "vers la salle suivante", "tn")
p.text(-h + PORTE_L / 2, -h - COULOIR - 1.2, "depuis la salle précédente", "tn")
p.text(h - PORTE_L - F_EP - 2.6, h + COULOIR / 2, f"{n_f} fentes verticales", "tl", rot=-90)
p.text(-h + PORTE_L + F_EP + 2.6, -h - COULOIR / 2, f"{n_f} fentes verticales", "tl", rot=-90)
# Étiquettes des ouvertures zénithales
p.text(-h + FENTE_L + 0.5, -5.0, "FENTE ZÉNITHALE au plafond", "tl", "start")
p.text(-h + FENTE_L + 0.5, -5.8, "0,9 × 25 m, profondeur 3 m", "tp", "start")
p.text(0, PUITS / 2 + 1.5, "PUITS DE LUMIÈRE", "tl")
p.text(0, PUITS / 2 + 0.7, "au plafond, profondeur 5 m", "tp")

# Cotes
p.cote((-h, h), (h - PORTE_L, h), -1.3)
p.cote((h - PORTE_L, h), (h, h), -1.3)
p.cote((-h, -h), (-h + PORTE_L, -h), 1.3)
p.cote((-h + PORTE_L, -h), (h, -h), 1.3)
p.cote((h + T, -h - COULOIR), (h + T, -h), -2.2)
p.cote((h + T, -h), (h + T, h), -2.2)
p.cote((h + T, h), (h + T, h + COULOIR), -2.2)
p.cote((h + T, -h - COULOIR), (h + T, h + COULOIR), -4.4, f"{f(C + 2 * COULOIR)} (couloir + salle + couloir)")
p.cote((-h, -h), (-h, h), 2.2)  # 30 m côté ouest (à l'extérieur)
p.cote((-h, -FENTE_LONG / 2), (-h, FENTE_LONG / 2), -3.0)
p.cote((-h, FENTE_LONG / 2), (-h, h), -3.0)
p.cote((-h, -h), (-h, -FENTE_LONG / 2), -3.0)
p.cote((-h, -8), (-h + FENTE_L, -8), -1.0)
p.cote((-PUITS / 2, -PUITS / 2), (PUITS / 2, -PUITS / 2), -1.4)
p.cote((PUITS / 2, -PUITS / 2), (PUITS / 2, PUITS / 2), -1.4)
p.cote((0, 0), (0, -8), 3.0, "8")  # centre → axe du banc sud
p.cote((0, 3.0), (-7.5, 3.0), -3.2, "7,5")  # centre → axe du banc ouest
# Couloirs : largeur et paroi
p.cote((h - PORTE_L, h + COULOIR), (h, h + COULOIR), 2.2)
p.cote((h - PORTE_L - F_EP, h + COULOIR), (h - PORTE_L, h + COULOIR), 2.2, "0,5")
p.cote((-h, -h - COULOIR), (-h + PORTE_L, -h - COULOIR), -2.2)
# Coupe A–A
p.line(-h - 3.4, 0, h + 7.6, 0, "trait-coupe")
for x in (-h - 5.0, h + 7.6):
    p.line(x, 0, x + 1.6, 0, "coupe")
    p.text(x + 0.8, -0.8, "A", "tb")
p.add(f'<path class="fleche" d="M{-h-4.2},0 L{-h-4.2},-1.5" marker-end="url(#pointe)"/>')
p.add(f'<path class="fleche" d="M{h+8.4},0 L{h+8.4},-1.5" marker-end="url(#pointe)"/>')
# Nord et soleil
nx0, ny0 = -h - 6.5, h + 9
p.add(f'<g transform="translate({nx0},{-ny0})"><circle class="boussole" r="1.6"/>'
      f'<path class="nord" d="M0,-1.5 L0.6,0.6 L0,0.1 L-0.6,0.6 Z"/>'
      f'<text class="tb" x="0" y="-2.3" text-anchor="middle" dominant-baseline="middle">N</text></g>')
az = math.atan2(-sx, -sy)  # direction du soleil (vers lui), depuis le nord, sens horaire
p.add(f'<g transform="translate({nx0},{-ny0 + 6})"><circle class="soleil" r="0.6"/>'
      f'<line class="rayon" x1="{math.sin(az)*3:.2f}" y1="{-math.cos(az)*3:.2f}" x2="{math.sin(az)*1:.2f}" y2="{-math.cos(az)*1:.2f}" marker-end="url(#pointe-l)"/>'
      f'<text class="tn" x="0" y="2.2" text-anchor="middle">soleil de la salle</text>'
      f'<text class="tn" x="0" y="3.1" text-anchor="middle">azimut {round(math.degrees(az))}°, haut. {round(math.degrees(math.asin(-sz)))}°</text></g>')
p.echelle(0, -h - COULOIR - 1)

plan = p.svg((-h - 10.5, -(h + COULOIR + 4.5), C + 23, 2 * (h + COULOIR) + 7.5), "Plan de la salle")

# =========================================================================
# COUPE A–A (est-ouest par le centre, vue vers le nord) : x, z
# =========================================================================
c = Dessin()
# Ciel indicatif au-dessus des ouvertures
c.rect(-h, H, -h + FENTE_L, H + FENTE_P, "lum")
c.rect(-PUITS / 2, H, PUITS / 2, H + PUITS_P, "lum")
# Rayon de soleil par le puits (projection est-ouest, indicatif)
k = -sx / -sz  # décalage horizontal par mètre de descente (vers l'ouest)
haut_g = -PUITS / 2 + k * (H + PUITS_P - H)
c.poly([(-PUITS / 2 + (H + PUITS_P - H) * 0 + 0.8, H + PUITS_P), (PUITS / 2, H + PUITS_P),
        (PUITS / 2 - k * (H + PUITS_P), 0), (-PUITS / 2 - k * H, 0), (-PUITS / 2, H)], "faisceau")
# Au-delà : mur nord et porte de sortie
c.rect(h - PORTE_L, 0, h, H, "porte-loin")
c.text(h - PORTE_L / 2, 10.8, "porte de sortie", "tn", rot=-90)
c.text(h - PORTE_L / 2 + 0.9, 10.8, "(au-delà, mur nord)", "tn", rot=-90)
# Sol
c.rect(-h - T, -0.6, h + T, 0, "mur")
# Murs ouest (prolongé par la fente) et est
c.rect(-h - T, 0, -h, H + FENTE_P, "mur")
c.rect(h, 0, h + T, H + 0.6, "mur")
# Plafond / toiture (épaisseur indicative), percé de la fente et du puits
c.rect(-h + FENTE_L, H, -PUITS / 2, H + 0.6, "mur")
c.rect(PUITS / 2, H, h, H + 0.6, "mur")
# Parois de la fente et du puits
c.rect(-h + FENTE_L, H, -h + FENTE_L + 0.25, H + FENTE_P, "mur")
c.rect(-PUITS / 2 - 0.25, H, -PUITS / 2, H + PUITS_P, "mur")
c.rect(PUITS / 2, H, PUITS / 2 + 0.25, H + PUITS_P, "mur")
# Œuvre (gabarit)
c.add(f'<rect class="oeuvre" x="{-OEUVRE[0]/2}" y="{-OEUVRE[2]}" width="{OEUVRE[0]}" height="{OEUVRE[2]}" rx="1.5"/>')
c.text(0, 5.5, "ŒUVRE", "tb")
c.text(0, 4.6, "gabarit 6,6 m", "tp")
# Visiteur à 9 m
c.add(f'<g class="visiteur" transform="translate(9,0)"><circle cx="0" cy="-1.55" r="0.15"/>'
      f'<path d="M0,-1.4 L0,-0.75 M-0.25,0 L0,-0.75 L0.25,0 M-0.3,-1.1 L0.3,-1.1"/></g>')
c.line(9, 1.7, 3.4, 9.0, "regard")
c.text(8.5, 2.4, "œil à 1,70 m", "tn", "end")
c.text(-h + FENTE_L / 2, H + FENTE_P + 0.9, "fente", "tl")
c.text(0, H + PUITS_P + 0.9, "puits de lumière", "tl")
c.text(-6.3, 1.0, "soleil au sol", "tn")
# Cotes
c.cote((-h, -0.6), (h, -0.6), -1.4)
c.cote((h + T, 0), (h + T, H), -1.6)
c.cote((h + T, 0), (h + T, 1.7), -3.6, "1,7")
c.cote((-h - T, H), (-h - T, H + FENTE_P), 1.6)
c.cote((-h - T, 0), (-h - T, H), 1.6)
c.cote((-h, H + FENTE_P), (-h + FENTE_L, H + FENTE_P), 1.9, "0,9")
c.cote((-PUITS / 2, H + PUITS_P), (PUITS / 2, H + PUITS_P), 2.2)
c.cote((PUITS / 2 + 0.25, H), (PUITS / 2 + 0.25, H + PUITS_P), -1.4)
c.cote((-OEUVRE[0] / 2, 0), (-OEUVRE[0] / 2, OEUVRE[2]), 1.4)
c.cote((0, 0), (9, 0), -0.9, "9")
c.text(-h + 3.5, H + 5.0, "toiture : épaisseur non modélisée", "tn", "start")
c.echelle(-h, -5.0)
coupe = c.svg((-h - 5, -(H + PUITS_P + 3.5), C + 14, H + PUITS_P + 10), "Coupe A–A")

# =========================================================================
# ÉLÉVATION de la paroi à fentes, vue depuis le couloir (distance au seuil, z)
# =========================================================================
e = Dessin()
e.rect(0, 0, COULOIR, H, "paroi")
for dd in fentes:
    e.rect(dd - F_LARG / 2, 0, dd + F_LARG / 2, F_H, "fente")
e.rect(-0.6, -0.6, COULOIR + 0.6, 0, "mur")
e.line(0, 0, 0, H, "seuil")
e.line(COULOIR, 0, COULOIR, H, "seuil")
e.text(-1.1, H / 2, "porte de la salle", "tn", rot=-90)
e.text(COULOIR + 1.1, H / 2, "porte de la salle suivante", "tn", rot=-90)
# Cotes en haut : marge, entraxe, marge
e.cote((0, H), (fentes[0] - F_LARG / 2, H), 1.2)
e.cote((fentes[0], F_H), (fentes[1], F_H), 1.3, "1,6")
e.cote((fentes[0] - F_LARG / 2, F_H), (fentes[0] + F_LARG / 2, F_H), 3.0, "0,4")
e.cote((fentes[-1] + F_LARG / 2, H), (COULOIR, H), 1.2)
e.cote((0, H), (COULOIR, H), 2.8)
e.cote((COULOIR, 0), (COULOIR, F_H), -3.0)
e.cote((COULOIR, F_H), (COULOIR, H), -3.0)
e.cote((COULOIR, 0), (COULOIR, H), -5.0)
e.text(COULOIR / 2, -2.0, f"{n_f} fentes de 0,4 × 16 m, entraxe 1,6 m, paroi de 0,5 m d'épaisseur", "tl")
e.echelle(0, -4.4)
elev = e.svg((-3.5, -(H + 5.5), COULOIR + 12, H + 11), "Élévation de la paroi à fentes")

# =========================================================================
lignes = [
    ("Salle", "30 × 30 m, 20 m sous plafond", "<code>C, H</code> dans <code>blender/salle.py</code>"),
    ("Œuvre", "10 m de haut, emprise maximale ≈ 6,6 × 3,9 m, au centre, face au sud", "modèle de 8 m × 1,25 (<code>ECHELLE_OEUVRE</code>)"),
    ("Puits de lumière", "5 × 5 m au-dessus de l'œuvre, 5 m de profondeur (sommet à 25 m)", "<code>PUITS</code>, <code>PUITS_P</code>"),
    ("Fente zénithale", "0,9 × 25 m le long du mur ouest, à 2,5 m des murs nord et sud, 3 m de profondeur", "<code>FENTE</code>, <code>FENTE_P</code>"),
    ("Portes", "2 portes de 4 m de large, pleine hauteur (20 m), au bord droit de leur mur vu de l'intérieur : entrée au sud (côté ouest), sortie au nord (côté est)", "<code>PORTE_L</code>, <code>PORTE_H</code> ; <code>portes</code> dans <code>config.ts</code>"),
    ("Couloirs", "14 m de long, 4 m de large, 20 m de haut, dans la pénombre", "<code>LONGUEUR_COULOIR</code> (<code>passage.ts</code>)"),
    ("Fentes des couloirs", f"{n_f} fentes verticales de 0,4 m, entraxe 1,6 m, 16 m de haut, dans la paroi de gauche en partant de la salle (0,5 m d'épaisseur) ; murs pleins de 2 m aux deux bouts", "réglages « Couloir » (touche M), <code>Couloir.tsx</code>"),
    ("Sas", "1 m fermé derrière chaque porte dans Blender, pour bloquer le ciel ; masqué dans le site", "<code>SAS</code>"),
    ("Bancs", "4,5 × 0,7 m, h 0,45 m : au sud à 8 m du centre, à l'ouest à 7,5 m (décalé de 3 m vers le nord)", "<code>BANCS</code>"),
    ("Navigation", "œil à 1,70 m ; vue d'arrivée à 13 m (sud), cercle à 9 m, cercle réduit à 5,5 m", "<code>parcours</code> dans <code>config.ts</code>"),
    ("Soleil", "salle : venant du sud-est, haut de 79° (entre par le puits) ; couloir : 32°, réglable à part", "<code>SOLEIL</code> ; réglages « Couloir »"),
]
table = "".join(f"<tr><th>{a}</th><td>{b}</td><td class='src'>{s}</td></tr>" for a, b, s in lignes)

html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan de la salle provisoire</title>
<style>
  :root {{ --encre:#24221f; --fond:#f7f5f1; --mur:#3a3631; --gris:#8b857c; --lum:#d79a2b; --porte:#2f6db5; }}
  body {{ margin:0; background:var(--fond); color:var(--encre); font:15px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; }}
  main {{ max-width:1100px; margin:0 auto; padding:32px 16px 64px; }}
  h1 {{ font-size:26px; margin:0 0 4px; }} h2 {{ font-size:18px; margin:40px 0 4px; }}
  .sous {{ color:var(--gris); margin:0 0 16px; }}
  figure {{ margin:0; overflow-x:auto; background:#fff; border:1px solid #e3ded6; border-radius:8px; padding:12px; }}
  svg {{ display:block; max-width:100%; height:auto; margin:0 auto; }}
  .legende {{ display:flex; flex-wrap:wrap; gap:8px 20px; margin:10px 0 0; font-size:13px; color:#555; }}
  .legende span::before {{ content:""; display:inline-block; width:14px; height:10px; margin-right:6px; vertical-align:-1px; border:1px solid; }}
  .l-mur::before {{ background:var(--mur); border-color:var(--mur)!important; }}
  .l-lum::before {{ background:rgba(215,154,43,.22); border-color:var(--lum)!important; border-style:dashed!important; }}
  .l-fente::before {{ background:#ffe7b0; border-color:var(--lum)!important; }}
  .l-porte::before {{ background:none; border-color:var(--porte)!important; border-style:dashed!important; }}
  .l-anneau::before {{ background:none; border-color:#9bb5a0!important; border-style:dashed!important; border-radius:50%; }}
  table {{ border-collapse:collapse; width:100%; margin-top:8px; font-size:14px; background:#fff; }}
  th, td {{ text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid #e8e3dc; }}
  th {{ width:150px; }} td.src {{ color:var(--gris); font-size:12.5px; width:260px; }}
  code {{ font-size:12px; }}
  .note {{ color:#555; font-size:13.5px; }}
  /* Dessin (unités : mètres) */
  .mur {{ fill:var(--mur); }}
  .paroi {{ fill:#d6d0c6; stroke:var(--mur); stroke-width:.08; }}
  .lum {{ fill:rgba(215,154,43,.2); stroke:var(--lum); stroke-width:.09; stroke-dasharray:.4 .25; }}
  .fente {{ fill:#ffe7b0; stroke:var(--lum); stroke-width:.06; }}
  .faisceau {{ fill:rgba(255,206,110,.28); stroke:none; }}
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
  .coupe {{ stroke:#c0392b; stroke-width:.14; }} .trait-coupe {{ stroke:#c0392b; stroke-width:.04; stroke-dasharray:1 .3 .15 .3; opacity:.6; }}
  .fleche {{ stroke:#c0392b; stroke-width:.1; fill:none; }}
  .boussole {{ fill:#fff; stroke:var(--encre); stroke-width:.07; }} .nord {{ fill:var(--encre); }}
  .soleil {{ fill:var(--lum); }}
  .ech0 {{ fill:var(--encre); }} .ech1 {{ fill:#fff; stroke:var(--encre); stroke-width:.05; }}
  text {{ font-family:-apple-system, "Helvetica Neue", Arial, sans-serif; fill:var(--encre); }}
  .t {{ font-size:.7px; }} .tc {{ font-size:.62px; fill:#4a4640; }} .tb {{ font-size:.72px; font-weight:700; letter-spacing:.03px; }}
  .tl {{ font-size:.66px; font-weight:600; fill:#8a5d0c; }} .tp {{ font-size:.58px; fill:#555; }} .tn {{ font-size:.56px; fill:#6a655e; }}
</style></head>
<body><main>
<h1>Salle provisoire « Le géant » — plan coté</h1>
<p class="sous">État au 28/10/2026, relevé dans le modèle 3D du site. Cotes en mètres.</p>

<svg width="0" height="0" style="position:absolute"><defs>
  <marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#c0392b"/></marker>
  <marker id="pointe-l" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#d79a2b"/></marker>
</defs></svg>

<h2>Plan</h2>
<p class="note">Nord en haut. Le puits et la fente zénithale sont au plafond (tracés en pointillés). Les anneaux verts sont les trajets de la caméra autour de l'œuvre.</p>
<figure>{plan}
<div class="legende"><span class="l-mur">murs (épaisseur indicative, sauf paroi à fentes : 0,5 m)</span><span class="l-lum">ouverture au plafond</span><span class="l-fente">fente des couloirs</span><span class="l-porte">porte / seuil</span><span class="l-anneau">trajets de la caméra</span></div>
</figure>

<h2>Coupe A–A</h2>
<p class="note">Est-ouest par le centre, vue vers le nord. Le faisceau de soleil est indicatif (projection sur ce plan).</p>
<figure>{coupe}</figure>

<h2>Paroi à fentes d'un couloir</h2>
<p class="note">Élévation vue depuis l'intérieur du couloir de sortie (les deux couloirs sont identiques). Elle reçoit le soleil du dehors ; la paroi d'en face est pleine.</p>
<figure>{elev}</figure>

<h2>Récapitulatif</h2>
<table>{table}</table>
<p class="note">Dans le modèle, murs, sol et plafond sont des surfaces sans épaisseur : les épaisseurs dessinées sont là pour la lisibilité. Points déjà notés à revoir : fentes de 16 m pour des portes de 20 m ; bancs placés pour l'ancienne salle de 24 m.</p>
</main></body></html>
"""
open(OUT, "w").write(html)
print("ok", n_f, fentes)
