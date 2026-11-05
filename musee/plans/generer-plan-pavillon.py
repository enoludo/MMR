"""Plan coté de la salle « pavillon » (nom provisoire), d'après le plan de Ludovic du 05/11
(plans/Fichier 2.svg, 1 m = 10 px, centre de la salle en (356,01 ; 344)).

    python3 plans/generer-plan-pavillon.py      → plans/salle-pavillon.html

Repère : x vers l'est, y vers le nord (Blender), origine au centre de la salle, en mètres.
"""
import importlib.util, math, os, re

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("plan", os.path.join(ICI, "generer-plan.py"))
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)
Dessin, f = plan.Dessin, plan.f

# --- Grande salle (relevé sur le SVG) ---
C, H = 40.0, 17.5            # carré intérieur, hauteur sous plafond (comme la salle du Seuil)
h = C / 2
T = 1.6                      # murs extérieurs : 16 px sur le SVG (0,4 m dans les autres salles)
PORTE, COULOIR, TC = 4.0, 14.0, 0.5   # portes et couloirs inchangés (paroi des couloirs : 0,5 m, Couloir.tsx)
F_LARG, F_PAS, F_PREMIERE, F_N = 1.0, 2.0, 2.0, 6
# Baies : deux par mur, 10 m de large, symétriques, trumeau de 6 m au milieu du mur (5,94 m sur le SVG)
BAIES = [(-13.0, -3.0), (3.0, 13.0)]
BAIE_H = 14.0                # proposé : du sol à 14 m (3,5 m de mur au-dessus)
VITRE = 0.3                  # vitrage à 0,3 m de la face extérieure : embrasure de 1,3 m côté salle
MENEAU_PAS, TRAVERSE_PAS = 2.5, 3.5
MENEAU_E, MENEAU_P = 0.06, 0.35       # acier noir : 6 cm vus, 35 cm de profondeur
TRAVERSE_P, DORMANT = 0.15, 0.12

# --- Espace central (relevé sur le SVG) ---
INT = 15.5                   # demi-diagonale du carré intérieur, posé sur la pointe
EXT = 18.971                 # faces extérieures : |x| + |y| = 18,97
PLAT = 16.0                  # pointes coupées à 16 m du centre : emprise de 32 × 32 m
CONGE = 1.0                  # angles extérieurs arrondis, rayon 1 m
OUV = 4 * math.sqrt(2)       # ouvertures de 5,66 m, centrées sur les faces nord-est et sud-ouest
H_INT, TOIT = 6.0, 1.0       # plafond à 6 m (demande de Ludovic) ; dalle de toit proposée : 1 m
EP = (EXT - INT) / math.sqrt(2)   # épaisseur des murs : 2,45 m
SOCLE_R, SOCLE_H = 1.2, 0.8  # socle de Huntington, sans la statue
BANC_R, BANC_P, BANC_H = 6.47, 0.76, 0.45   # bancs en arc de 45° (mêmes que la rotonde)
BANCS = [(-45 - 22.5, -45 + 22.5), (135 - 22.5, 135 + 22.5)]

PORTES = {
    "nord": dict(x=(h - PORTE, h), y=(h, h + COULOIR), fentes="est", nom="SORTIE"),
    "sud": dict(x=(-h, -h + PORTE), y=(-h - COULOIR, -h), fentes="est", nom="ENTRÉE"),
    "ouest": dict(x=(-h - COULOIR, -h), y=(h - PORTE, h), fentes="nord", nom="COULOIR OUEST"),
    "est": dict(x=(h, h + COULOIR), y=(-h, -h + PORTE), fentes="sud", nom="COULOIR EST"),
}


def tourner(pts, quarts):
    for _ in range(quarts % 4):
        pts = [(-y, x) for x, y in pts]
    return pts


def rect_pts(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def arc(a0, a1, r, pas=3.0):
    n = max(2, math.ceil(abs(a1 - a0) / pas))
    return [(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]


def conge(p, c, n, r=CONGE, k=8):
    """Arrondi de rayon r à l'angle c, entre les directions vers p et vers n (approché par une courbe)."""
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
    """Moitié est du mur de l'espace central (l'autre est la même, tournée d'un demi-tour)."""
    m = (INT / 2, INT / 2)                         # milieu de la face intérieure nord-est
    d = OUV / 2 / math.sqrt(2)
    A = (m[0] + d, m[1] - d)                       # bord sud de l'ouverture nord-est
    sw = (-INT / 2, -INT / 2)
    B = (sw[0] + d, sw[1] - d)                     # bord est de l'ouverture sud-ouest
    k = (EXT - INT) / 2
    A2, B2 = (A[0] + k, A[1] + k), (B[0] - k, B[1] - k)   # bouts des murs, perpendiculaires aux faces
    c = EXT - PLAT
    coins = [(-c, -PLAT), (c, -PLAT), (PLAT, -c), (PLAT, c)]
    ext = [B2]
    suite = [B2] + coins + [A2]
    for i in range(1, len(suite) - 1):
        ext += conge(suite[i - 1], suite[i], suite[i + 1])
    ext.append(A2)
    return [A, (INT, 0), (0, -INT), B] + ext


def contour_pavillon():
    c = EXT - PLAT
    coins = [(c, -PLAT), (PLAT, -c), (PLAT, c), (c, PLAT), (-c, PLAT), (-PLAT, c), (-PLAT, -c), (-c, -PLAT)]
    pts = []
    for i in range(8):
        pts += conge(coins[i - 1], coins[i], coins[(i + 1) % 8])
    return pts


def generer():
    p = Dessin()
    # Emprise couverte de l'espace central (plafond à 6 m)
    p.poly(contour_pavillon(), "couvert")
    p.poly([(INT, 0), (0, INT), (-INT, 0), (0, -INT)], "dedans")
    for q in (0, 2):
        p.poly(tourner(moitie_pavillon(), q), "mur")
    # Bancs et socle
    for a0, a1 in BANCS:
        p.poly(arc(a0, a1, BANC_R + BANC_P) + arc(a1, a0, BANC_R), "banc")
    p.circle(0, 0, SOCLE_R, "socle")
    p.circle(0, 0, SOCLE_R - 0.12, "gorge")
    p.circle(0, 0, 2.0, "lampe")
    # Murs extérieurs (un quart, tourné quatre fois : plan en moulinet), percés des baies
    for q in range(4):
        bords = [-h] + [v for b in BAIES for v in b] + [h - PORTE]
        for x0, x1 in zip(bords[0::2], bords[1::2]):
            p.poly(tourner(rect_pts(x0, h, x1, h + T), q), "mur")
        for x0, x1 in BAIES:
            yv = h + T - VITRE
            p.poly(tourner(rect_pts(x0, h, x1, h + T), q), "embrasure")
            p.poly(tourner(rect_pts(x0, yv - 0.05, x1, yv + 0.05), q), "vitre")
            n = round((x1 - x0) / MENEAU_PAS)
            for i in range(n + 1):
                xm = x0 + i * MENEAU_PAS
                e = DORMANT if i in (0, n) else MENEAU_E
                xa = min(max(xm - e / 2, x0), x1 - e)
                p.poly(tourner(rect_pts(xa, yv - MENEAU_P, xa + e, yv + 0.04), q), "acier")
    # Couloirs (inchangés)
    def paroi_fentes(x0, x1, y0, y1, long_axe, depuis, sens):
        bord = 0.0
        for k in range(F_N):
            dc = F_PREMIERE + k * F_PAS
            a, b = dc - F_LARG / 2, dc + F_LARG / 2
            seg = sorted((depuis + sens * bord, depuis + sens * a))
            fe = sorted((depuis + sens * a, depuis + sens * b))
            if long_axe == "y":
                p.rect(x0, seg[0], x1, seg[1], "mur"); p.rect(x0, fe[0], x1, fe[1], "fente")
            else:
                p.rect(seg[0], y0, seg[1], y1, "mur"); p.rect(fe[0], y0, fe[1], y1, "fente")
            bord = b
        fin = sorted((depuis + sens * bord, depuis + sens * COULOIR))
        if long_axe == "y":
            p.rect(x0, fin[0], x1, fin[1], "mur")
        else:
            p.rect(fin[0], y0, fin[1], y1, "mur")

    for nom, c in PORTES.items():
        (x0, x1), (y0, y1) = c["x"], c["y"]
        if nom in ("nord", "sud"):
            sens = 1 if nom == "nord" else -1
            seuil = h if nom == "nord" else -h
            paroi_fentes(x1, x1 + TC, 0, 0, "y", seuil, sens); p.rect(x0 - TC, y0, x0, y1, "mur")
            p.line(x0, seuil, x1, seuil, "seuil")
            p.line(x0, seuil + sens * COULOIR, x1, seuil + sens * COULOIR, "seuil")
            p.text((x0 + x1) / 2 + 0.4, seuil + sens * COULOIR * 0.6, f"COULOIR {c['nom']}", "tb", rot=-90)
        else:
            sens = 1 if nom == "est" else -1
            seuil = h if nom == "est" else -h
            if c["fentes"] == "nord":
                paroi_fentes(0, 0, y1, y1 + TC, "x", seuil, sens); p.rect(x0, y0 - TC, x1, y0, "mur")
            else:
                paroi_fentes(0, 0, y0 - TC, y0, "x", seuil, sens); p.rect(x0, y1, x1, y1 + TC, "mur")
            bout = seuil + sens * COULOIR
            p.line(seuil, y0, seuil, y1, "seuil")
            p.rect(bout, y0 - TC, bout + sens * TC, y1 + TC, "mur")
            p.text((seuil + bout) / 2, (y0 + y1) / 2 - 0.1, c["nom"] + " (fermé)", "tb")
    p.text(h - PORTE / 2, h + COULOIR + 1.2, "vers la salle suivante", "tn")
    p.text(-h + PORTE / 2, -h - COULOIR - 1.2, "depuis la salle précédente", "tn")

    # Parcours proposé : porte sud → ouverture sud-ouest → vue d'arrivée ; sortie par le nord-est
    arrivee = -8.5 / math.sqrt(2)
    p.add('<polyline class="parcours" points="' + " ".join(f"{x:.2f},{-y:.2f}" for x, y in
          [(-18, -19), (-12.5, -12.5), (arrivee, arrivee)]) + '" marker-end="url(#pointe-v)"/>')
    p.add('<polyline class="parcours" points="' + " ".join(f"{x:.2f},{-y:.2f}" for x, y in
          [(9.5, 9.5), (12.5, 12.5), (18, 19)]) + '" marker-end="url(#pointe-v)"/>')
    p.circle(arrivee, arrivee, 0.35, "oeil")
    p.text(arrivee - 0.6, arrivee - 0.9, "vue d'arrivée ?", "tn", "end")
    # Soleil proposé, venant du sud-est
    for x, y in [(23.5, -27.5), (27.5, -23.5)]:
        p.add(f'<path class="rayon" d="M{x:.2f},{-y:.2f} L{x - 3.2:.2f},{-(y + 3.2):.2f}" marker-end="url(#pointe)"/>')
    p.circle(27.2, -27.2, 0.9, "soleil")
    p.text(27.2, -28.9, "soleil proposé (sud-est, bas)", "tl")

    # Étiquettes
    p.text(0, 9.6, "ESPACE CENTRAL", "tb")
    p.text(0, 8.7, "plafond à 6 m", "tp")
    p.text(-1.6, -1.5, "socle de Huntington Ø 2,4", "tp", "end")
    p.text(0, 2.8, "lumière au plafond ?", "tl")
    p.text(6.85 * math.cos(math.radians(-45)) + 1.2, 6.85 * math.sin(math.radians(-45)) - 1.0, "banc", "tn", "start")
    p.text(-10.5, 17.0, "GRANDE SALLE · 17,5 m", "tb")
    p.text(-8.0, -h + 1.6, "baie vitrée", "tl")
    p.text(8.0, -h + 1.6, "baie vitrée", "tl")
    p.text(13.2, 11.6, "ouverture", "tn", "start")
    p.text(-13.2, -11.6, "ouverture", "tn", "end")
    # Cotes
    p.cote((-h - T, -h), (-h - T, h), 2.4)
    p.chaine([-h, BAIES[0][0], BAIES[0][1], BAIES[1][0], BAIES[1][1], h - PORTE, h], 2.4, a_y=h + T)
    p.cote((-h, -h - T), (-h, -h), 2.0)
    p.cote((-PLAT, -h + 1), (PLAT, -h + 1), 0, "32 (emprise de l'espace central)")
    p.cote((PLAT, 0.0), (h, 0.0), 0.5)
    p.cote((0, -INT), (INT, 0), 1.0, f"{INT * math.sqrt(2):.2f}".replace(".", ","))
    m = (-INT / 2, INT / 2)
    p.cote(m, (m[0] - EP / math.sqrt(2), m[1] + EP / math.sqrt(2)), 0.5, "2,45")
    a = (INT / 2 + 2, INT / 2 - 2)
    p.cote((INT / 2 - 2, INT / 2 + 2), a, -0.6, "5,66")
    p.cote((0, 0), (BANC_R * math.cos(math.radians(-45)), BANC_R * math.sin(math.radians(-45))), 0.5, "R 6,47")
    # Repère de la coupe A–A (est-ouest par le centre, vue vers le nord)
    for x in (-h - T - 4.5, h + T + 2.9):
        p.coupe(x, 0, "A")
    p.line(-h - T - 2.9, 0, h + T + 2.9, 0, "trait-coupe")
    nx0, ny0 = -h - 10, h + 10
    p.add(f'<g transform="translate({nx0},{-ny0})"><circle class="boussole" r="1.6"/>'
          f'<path class="nord" d="M0,-1.5 L0.6,0.6 L0,0.1 L-0.6,0.6 Z"/>'
          f'<text class="tb" x="0" y="-2.3" text-anchor="middle" dominant-baseline="middle">N</text></g>')
    p.echelle(5, -h - COULOIR)
    vb = (-h - COULOIR - 3, -(h + COULOIR + 3), C + 2 * COULOIR + 6, C + 2 * COULOIR + 6)
    svg_plan = p.svg(vb, "Plan")

    # --- Coupe A–A : est-ouest par le centre, vue vers le nord ---
    c = Dessin()
    # au-delà : mur nord et ses deux baies (au-dessus de l'espace central), porte nord-est
    for x0, x1 in BAIES:
        c.rect(x0, 0, x1, BAIE_H, "vitre-loin")
        for i in range(1, round((x1 - x0) / MENEAU_PAS)):
            c.rect(x0 + i * MENEAU_PAS - MENEAU_E / 2, 0, x0 + i * MENEAU_PAS + MENEAU_E / 2, BAIE_H, "acier")
        for j in range(1, round(BAIE_H / TRAVERSE_PAS)):
            c.rect(x0, j * TRAVERSE_PAS - MENEAU_E / 2, x1, j * TRAVERSE_PAS + MENEAU_E / 2, "acier")
        c.add(f'<rect class="cadre" x="{x0}" y="{-BAIE_H}" width="{x1 - x0}" height="{BAIE_H}"/>')
    c.rect(h - PORTE, 0, h, H, "porte-loin")
    c.text(h - PORTE / 2, H / 2, "porte nord", "tn", rot=-90)
    # espace central : murs coupés aux pointes (0,5 m), dalle, faces intérieures au-delà
    c.rect(-PLAT, H_INT, PLAT, H_INT + TOIT, "mur")
    for s in (-1, 1):
        c.rect(s * INT, 0, s * PLAT, H_INT, "mur")
    c.rect(-INT, 0, INT, H_INT, "dedans-coupe")
    o0, o1 = INT / 2 - OUV / 2 / math.sqrt(2), INT / 2 + OUV / 2 / math.sqrt(2)
    c.rect(o0, 0, o1, H_INT, "porte-loin")
    c.text((o0 + o1) / 2, 3.0, "ouverture NE", "tn", rot=-90)
    c.add(f'<line class="arete" x1="0" y1="0" x2="0" y2="{-H_INT}"/>')
    c.text(0.3, 4.6, "angle nord (au-delà)", "tn", "start")
    # gorge lumineuse proposée en haut des murs, lumière au plafond au-dessus du socle
    c.rect(-2.0, H_INT - 0.12, 2.0, H_INT, "lampe-coupe")
    c.poly([(-2.0, H_INT - 0.12), (2.0, H_INT - 0.12), (3.2, SOCLE_H), (-3.2, SOCLE_H)], "faisceau")
    c.rect(-SOCLE_R, 0, SOCLE_R, SOCLE_H, "banc")
    c.add(f'<line class="lueur" x1="{-SOCLE_R}" y1="{-SOCLE_H + 0.25}" x2="{SOCLE_R}" y2="{-SOCLE_H + 0.25}"/>')
    c.text(0, SOCLE_H + 0.7, "socle (sans statue)", "tp")
    xb = [BANC_R * math.cos(math.radians(a)) for a in (112.5, 157.5)] + [(BANC_R + BANC_P) * math.cos(math.radians(157.5))]
    c.rect(min(xb), 0, max(xb), BANC_H, "banc-loin")
    # grande salle : murs est et ouest coupés (trumeaux), sol, plafond
    for s in (-1, 1):
        c.rect(s * h, -0.6, s * (h + T), H + 0.8, "mur")
    c.rect(-h - T, -0.6, h + T, 0, "mur")
    c.rect(-h - T, H, h + T, H + 0.8, "mur")
    c.text(-10.5, H - 1.4, "GRANDE SALLE", "tb")
    c.text(0, H_INT + TOIT + 0.8, "ESPACE CENTRAL", "tb")
    c.cote((h + T, 0), (h + T, H), -1.6)
    c.cote((-PLAT - 0.6, 0), (-PLAT - 0.6, H_INT), 0)
    c.cote((-PLAT - 0.6, H_INT), (-PLAT - 0.6, H_INT + TOIT), 0, "1")
    c.cote((BAIES[1][1], 0), (BAIES[1][1], BAIE_H), -0.9)
    c.cote((-h, -0.6), (h, -0.6), -1.4)
    c.cote((-PLAT, H_INT + TOIT), (PLAT, H_INT + TOIT), 1.8)
    c.echelle(-h, -4.4)
    svg_coupe = c.svg((-h - 5, -(H + 4), C + 10, H + 10), "Coupe A–A")

    # --- Élévation d'une baie, vue de l'intérieur, et détail d'un meneau (coupe horizontale) ---
    e = Dessin()
    L = BAIES[0][1] - BAIES[0][0]
    e.rect(-1.5, -0.4, L + 1.5, BAIE_H + 1.8, "paroi")
    e.rect(0, 0, L, BAIE_H, "vitre-loin")
    for i in range(1, round(L / MENEAU_PAS)):
        e.rect(i * MENEAU_PAS - MENEAU_E / 2, 0, i * MENEAU_PAS + MENEAU_E / 2, BAIE_H, "acier")
    for j in range(1, round(BAIE_H / TRAVERSE_PAS)):
        e.rect(0, j * TRAVERSE_PAS - MENEAU_E / 2, L, j * TRAVERSE_PAS + MENEAU_E / 2, "acier")
    for x0, y0, x1, y1 in [(0, 0, DORMANT, BAIE_H), (L - DORMANT, 0, L, BAIE_H), (0, BAIE_H - DORMANT, L, BAIE_H), (0, 0, L, 0.1)]:
        e.rect(x0, y0, x1, y1, "acier")
    e.chaine([0, 2.5, 5, 7.5, 10], 1.0, a_y=BAIE_H)
    e.chaine([0, 3.5, 7, 10.5, 14], -1.0, a_x=L)
    e.text(-0.75, BAIE_H / 2, "embrasure 1,3 m", "tn", rot=-90)
    e.add('<g transform="translate(18,-8)">')
    # détail : un meneau au 1:10 (mis à l'échelle ×10 dans le dessin)
    z = 10
    d = Dessin()
    d.rect(-3.5 * 1, 0, 3.5, 0.02 * z, "vitre")
    d.rect(-MENEAU_E / 2 * z, -MENEAU_P * z + 0.04 * z, MENEAU_E / 2 * z, 0.04 * z, "acier")
    d.rect(-0.04 * z, 0.02 * z, 0.04 * z, 0.06 * z, "acier")
    d.text(0, 1.4, "extérieur", "tn")
    d.text(0, -4.1, "intérieur", "tn")
    d.text(2.2, -1.6, "meneau acier noir", "tn", "start")
    d.text(2.2, -2.3, "6 × 35 cm", "tn", "start")
    d.text(2.2, 0.8, "verre", "tn", "start")
    e.add("".join(d.e) + "</g>")
    e.text(18, 12.6, "DÉTAIL D'UN MENEAU", "tb")
    e.text(18, 11.8, "coupe horizontale, ×10", "tp")
    e.echelle(0, -2.8)
    svg_baie = e.svg((-3, -(BAIE_H + 3.5), 27, BAIE_H + 7.5), "Élévation d'une baie")

    style = re.search(r"<style>.*?</style>", open(os.path.join(ICI, "salle-refonte.html")).read(), re.S).group(0)
    style = style.replace("</style>", """  figure svg text { paint-order:stroke; stroke:#fff; stroke-width:.14px; stroke-linejoin:round; }
  .couvert { fill:rgba(58,54,49,.07); } .dedans { fill:rgba(58,54,49,.05); stroke:none; }
  .dedans-coupe { fill:#f1eee9; }
  .embrasure { fill:#efeae2; }
  .vitre { fill:#5fa8cc; } .vitre-loin { fill:rgba(169,211,230,.45); }
  .acier { fill:#111; } .cadre { fill:none; stroke:#111; stroke-width:.12; }
  .socle { fill:#b9b1a5; stroke:var(--mur); stroke-width:.06; }
  .gorge { fill:none; stroke:rgba(240,170,50,.9); stroke-width:.14; }
  .lampe { fill:rgba(255,206,110,.18); stroke:var(--lum); stroke-width:.07; stroke-dasharray:.3 .2; }
  .lampe-coupe { fill:rgba(255,206,110,.9); }
  .banc-loin { fill:none; stroke:var(--mur); stroke-width:.06; stroke-dasharray:.25 .15; }
  .parcours { fill:none; stroke:#5d8a66; stroke-width:.12; stroke-dasharray:.5 .3; }
  .arete { stroke:#6f6a63; stroke-width:.05; }
  .l-vitre::before { background:#5fa8cc; border-color:#111!important; }
  .l-couvert::before { background:rgba(58,54,49,.12); border-color:rgba(58,54,49,.3)!important; }
  .vues { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }
  .vues figure { padding:0; overflow:hidden; } .vues img { display:block; width:100%; height:auto; }
  .vues figcaption { padding:8px 12px; font-size:13.5px; color:#555; }
  .l-parcours::before { background:none; border-color:#5d8a66!important; border-style:dashed!important; }
</style>""")
    lu = [
        "Même carré de <b>40 × 40 m</b>, mêmes <b>portes</b> de 4 m dans les angles (en moulinet) et mêmes <b>couloirs</b> "
        "de 14 × 4 m : on entre au sud, on sort au nord, impasses à l'ouest et à l'est.",
        "Grande salle à <b>17,5 m</b> sous plafond, comme celle du Seuil. <b>Plus de puits de lumière</b>, plus de colonnes.",
        "Murs extérieurs dessinés <b>épais de 1,6 m</b> (0,4 m dans les autres salles) : j'en fais de profondes embrasures "
        "pour les baies ; le carré intérieur reste de 40 m.",
        "<b>8 baies vitrées de 10 m</b>, deux par mur, symétriques : 7 m depuis l'angle, un trumeau de 6 m au milieu du "
        "mur, 3 m jusqu'à la porte.",
        "Au centre, un <b>espace couvert</b> : un carré posé sur la pointe (côté intérieur 21,9 m), murs de 2,45 m, pointes "
        "coupées à 16 m du centre (emprise 32 × 32 m), angles extérieurs arrondis. Il reste <b>4 m</b> entre ses pointes et les murs.",
        "<b>Deux ouvertures de 5,66 m</b>, au milieu des faces nord-est et sud-ouest, face à face : dans l'axe qui va de "
        "l'entrée (sud) à la sortie (nord).",
        "<b>Deux bancs en arc</b> de 45°, de 6,5 à 7,2 m du centre (les mêmes que dans la rotonde), au sud-est et au nord-ouest.",
        "Au centre, le <b>socle de Huntington</b> (Ø 2,4 m, 0,8 m, gorge lumineuse), <b>sans la statue</b>. "
        "Le disque « œuvre » de 8 m du SVG est lu comme un repère.",
    ]
    propose = [
        "<b>Plafond de l'espace central à 6 m</b>, dalle de toit de 1 m (dessus à 7 m) ; les ouvertures montent jusqu'au plafond.",
        "<b>Baies du sol à 14 m</b> (3,5 m de mur au-dessus), vitrage à 0,3 m de la face extérieure : 1,3 m d'embrasure "
        "côté salle, qui découpe nettement les taches de soleil.",
        "<b>Huisseries en acier noir</b>, façon grandes façades modernes : cadre de 12 cm scellé dans l'embrasure, "
        "<b>meneaux tous les 2,5 m</b> (6 cm vus, 35 cm de profondeur, comme des raidisseurs), <b>traverses tous les 3,5 m</b> "
        "(6 × 15 cm), seuil métallique au sol : 16 carreaux de 2,5 × 3,5 m par baie.",
        "<b>Soleil bas venant du sud-est</b> (≈ 30° de hauteur) : il entre par les baies sud et est, dessine au sol "
        "le quadrillage des huisseries et frappe la face sud-est, pleine, de l'espace central ; il passe parallèlement "
        "aux deux ouvertures, donc <b>n'entre pas</b> dans l'espace central.",
        "<b>Éclairage artificiel</b> de l'espace central : la gorge du socle, une <b>lumière ronde au plafond</b> au-dessus "
        "du socle (Ø 4 m), et une gorge lumineuse discrète en haut des murs. Pénombre autour, comme partout.",
        "Les quatre <b>fentes zénithales</b> de la salle du Seuil sont retirées aussi : la lumière ne vient que des baies.",
    ]
    a_trancher = [
        "<b>Dehors</b> : très lumineux et simple (sol clair, ciel) ; il ne se voit guère que pendant le passage vers une autre salle.",
        "<b>Couloirs</b> : ceux de toutes les salles (parois de 0,5 m) ; murs de la salle de 1,6 m.",
        "<b>Vue d'arrivée</b> : dans l'espace central, à 8,5 m de l'œuvre, depuis l'ouverture sud-ouest.",
        "<b>Œuvre</b> : « Souffle d'éclats » (le socle seul, en attendant l'œuvre en 3D).",
    ]
    vues = [
        ("entree", "En entrant par la porte sud : l'espace central (7 m) dans la grande salle (17,5 m), son ouverture sud-ouest."),
        ("arrivee", "Vue d'arrivée proposée, dans l'espace central, à 8,5 m du socle ; au fond, l'ouverture nord-est."),
        ("dedans", "Depuis l'ouverture nord-est : plafond à 6 m, lumière ronde au-dessus du socle, gorge en haut des murs, bancs."),
        ("galerie-est", "Entre l'espace central et le mur est (4 m au plus étroit) : baies au soleil, ombres des huisseries au sol."),
        ("galerie-ouest", "Entre l'espace central et le mur ouest, à l'ombre ; au fond, la lumière des baies sud."),
        ("baie", "Une baie sud de près : 10 × 14 m, embrasure de 1,3 m, huisseries en acier noir."),
        ("dessus", "Vue de dessus, plafond de la grande salle retiré (la lumière reste celle de la salle couverte)."),
        ("dessus-centre", "Vue de dessus, coupée à 5,7 m : l'intérieur de l'espace central et les taches de soleil."),
    ]
    galerie = "".join(f'<figure><img src="captures/pavillon-{n}.png" alt=""><figcaption>{t}</figcaption></figure>' for n, t in vues)
    html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pavillon — projet</title>
{style}</head>
<body><main>
<h1>Pavillon — plan coté (d'après ton SVG)</h1>
<p class="sous">Relevé sur « Fichier 2.svg » (1 m = 10 px), 05/11/2026. Cotes en mètres. Nom provisoire : « pavillon ».</p>
<h2>Ce que j'ai lu</h2><ul>{''.join(f'<li>{x}</li>' for x in lu)}</ul>
<h2>Ce que je propose</h2><ul>{''.join(f'<li>{x}</li>' for x in propose)}</ul>
<h2>Décisions de Ludovic (05/11)</h2><ul>{''.join(f'<li>{x}</li>' for x in a_trancher)}</ul>
<h2>Aperçu 3D</h2>
<p class="note">Rendu direct dans Blender (<code>blender/apercu-pavillon.py</code>), sans précalcul de lumière : les volumes sont justes, la lumière est indicative. Pas de couloirs (amorces fermées), dehors simplifié (sol clair et ciel).</p>
<div class="vues">{galerie}</div>
<svg width="0" height="0" style="position:absolute"><defs>
  <marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#c0392b"/></marker>
  <marker id="pointe-v" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#5d8a66"/></marker>
</defs></svg>
<h2>Plan</h2>
<p class="note">Nord en haut. En gris clair : l'emprise couverte de l'espace central. En vert : le parcours proposé de la porte d'entrée à la vue d'arrivée, puis vers la sortie.</p>
<figure>{svg_plan}
<div class="legende"><span class="l-mur">pierre pleine</span><span class="l-vitre">baie vitrée, huisseries acier noir</span><span class="l-couvert">espace couvert (6 m)</span><span class="l-fente">fente des couloirs</span><span class="l-porte">porte / seuil</span><span class="l-parcours">parcours proposé</span></div></figure>
<h2>Coupe A–A</h2>
<p class="note">Est-ouest par le centre, vue vers le nord : l'espace central coupé à ses pointes (0,5 m de mur) ; au-delà, les faces intérieures, l'ouverture nord-est, et au-dessus de la dalle, les deux baies du mur nord. En jaune : la lumière proposée au-dessus du socle.</p>
<figure>{svg_coupe}</figure>
<h2>Une baie vue de l'intérieur</h2>
<p class="note">10 × 14 m, meneaux tous les 2,5 m, traverses tous les 3,5 m. À droite, la coupe d'un meneau, dix fois plus grande.</p>
<figure>{svg_baie}</figure>
</main></body></html>
"""
    open(os.path.join(ICI, "salle-pavillon.html"), "w").write(html)
    print("ok → salle-pavillon.html", "épaisseur des murs du centre", round(EP, 3))


generer()
