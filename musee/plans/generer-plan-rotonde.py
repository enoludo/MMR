"""Plan coté de la rotonde, d'après le plan de Ludovic du 30/10 (plans/planCercleColonne.svg, 1 m = 10 px).

    python3 plans/generer-plan-rotonde.py      → plans/salle-rotonde.html

Aperçu 3D : blender/apercu-rotonde.py (mêmes cotes), images dans plans/captures/rotonde-*.png.
Repère : x vers l'est, y vers le nord (Blender), origine au centre de la salle, en mètres.
"""
import importlib.util, math, os, re

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("plan", os.path.join(ICI, "generer-plan.py"))
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)
Dessin, f = plan.Dessin, plan.f

# --- Valeurs relevées sur le SVG (mêmes noms que dans blender/apercu-rotonde.py) ---
C, H, T = 40.0, 17.5, 0.4
h = C / 2
R = 20.0
PORTE, COULOIR = 4.0, 14.0
PIL_P, PIL_L, PIL_PENTE = 1.0, 4.2, 0.714
FENTE_L, FENTE_BAS, FENTE_PLAF, FENTE_FOND, FENTE_P = 0.6, 3.0, 5.0, 0.6, 3.0   # fentes en L (31/10)
F0, FOND = h - PIL_P - FENTE_PLAF, h - PIL_P + FENTE_FOND   # bout de la fente au plafond, fond dans le pilastre
PUITS_R, PUITS_P = 5.5, 3.0
COUPOLE_R, COUPOLE_H = 10.0, 7.0    # coupole détachée des colonnes (13 m)
zc = ((PUITS_R ** 2 + (H + COUPOLE_H) ** 2) - (COUPOLE_R ** 2 + H ** 2)) / (2 * COUPOLE_H)
RHO = math.hypot(COUPOLE_R, H - zc)
TOIT = H + COUPOLE_H + PUITS_P
SOCLE_R, SOCLE_H = 1.2, 0.8
LAME_E, LAME_H = 0.25, 1.5
VIDES = [v * (2 * PUITS_R - 6 * LAME_E) / 8.5 for v in [1.58, 0.85, 1.7, 0.97, 1.46, 0.73, 1.21]]
COL_R, COL_D, COL_N = 13.0, 1.5, 12
BANC_R, BANC_P, BANC_H = 6.47, 0.76, 0.45
BANCS = [(a - 22.5, a + 22.5) for a in (0, 90, 180, 270)]
OEUVRE = (1.6, 1.2, 2.7)      # « La maladie de Huntington » (essais du 30/10), sur son socle
ANNEAUX = [(3, "cercle réduit 3 m"), (4.5, "cercle 4,5 m"), (11, "vue d'arrivée 11 m")]
F_LARG, F_PAS, F_PREMIERE, F_N = 1.0, 2.0, 2.0, 6
PORTES = {
    "nord": dict(x=(h - PORTE, h), y=(h, h + COULOIR), fentes="est", ouvert=True, nom="SORTIE"),
    "sud": dict(x=(-h, -h + PORTE), y=(-h - COULOIR, -h), fentes="est", ouvert=True, nom="ENTRÉE"),
    "ouest": dict(x=(-h - COULOIR, -h), y=(h - PORTE, h), fentes="nord", ouvert=False, nom="COULOIR OUEST"),
    "est": dict(x=(h, h + COULOIR), y=(-h, -h + PORTE), fentes="sud", ouvert=False, nom="COULOIR EST"),
}


def arc(a0, a1, r=R, pas=2.0):
    n = max(2, math.ceil(abs(a1 - a0) / pas))
    return [(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), r * math.sin(math.radians(a0 + (a1 - a0) * k / n)))
            for k in range(n + 1)]


def tourner(pts, quarts):
    for _ in range(quarts):
        pts = [(-y, x) for x, y in pts]
    return pts


# Contour de la salle (même construction que l'aperçu 3D)
x0, y0 = R - PIL_P, PIL_L / 2
a_, b_, c_ = 1 + PIL_PENTE ** 2, 2 * (x0 + y0 * PIL_PENTE), x0 ** 2 + y0 ** 2 - R ** 2
u = (-b_ + math.sqrt(b_ ** 2 - 4 * a_ * c_)) / (2 * a_)
PIL = (x0 + u, y0 + PIL_PENTE * u)
A_PIL = math.degrees(math.atan2(PIL[1], PIL[0]))
QUART = [(x0, 0), (x0, y0), PIL] + arc(A_PIL, math.degrees(math.atan2(12, 16)))[1:] + \
        [(h, h - PORTE), (h, h), (h - PORTE, h)] + arc(math.degrees(math.atan2(16, 12)), 90 - A_PIL) + [(y0, x0)]
CONTOUR = [p for q in range(4) for p in tourner(QUART, q)]


def chemin(pts):
    return "M" + " L".join(f"{x:.3f},{-y:.3f}" for x, y in pts) + " Z"


def generer():
    p = Dessin()
    # Masses pleines entre le carré et la rotonde (pilastres compris)
    p.add(f'<path class="mur" fill-rule="evenodd" d="{chemin([(-h, -h), (h, -h), (h, h), (-h, h)])} {chemin(CONTOUR)}"/>')
    for r, lab in ANNEAUX:
        p.circle(0, 0, r, "anneau")
        p.text(r * math.cos(math.radians(-60)) + 0.3, r * math.sin(math.radians(-60)) - 0.3, lab, "tn", "start")
    # Ouvertures du plafond : fentes en L et oculus avec ses lames
    for q in range(4):
        p.poly(tourner([(F0, -FENTE_L / 2), (FOND, -FENTE_L / 2), (FOND, FENTE_L / 2), (F0, FENTE_L / 2)], q), "lum")
    p.circle(0, 0, PUITS_R, "lum")
    x = -PUITS_R
    for v in VIDES[:-1]:
        x += v
        demi = lambda xx: math.sqrt(max(PUITS_R ** 2 - xx ** 2, 0))
        e = min(demi(x), demi(x + LAME_E))
        p.rect(x, -e, x + LAME_E, e, "lame")
        x += LAME_E
    p.text(0, 4.2, "OCULUS ET LAMES", "tl")
    # Œuvre
    w, d, _ = OEUVRE
    p.circle(0, 0, SOCLE_R, "oeuvre")
    p.text(0, 1.9, "HUNTINGTON (socle Ø 2,4)", "tp")
    # coupole : pas une ouverture, seulement son pied (au droit des colonnes), en tirets
    p.circle(0, 0, COUPOLE_R, "coupole")
    p.text(COUPOLE_R * math.cos(math.radians(105)), COUPOLE_R * math.sin(math.radians(105)) + 1.7, "pied de la coupole (R 10)", "tl")
    # Bancs, colonnes
    for a0, a1 in BANCS:
        p.poly(arc(a0, a1, BANC_R + BANC_P, 3) + arc(a1, a0, BANC_R, 3), "banc")
    for k in range(COL_N):
        if k % 3 == 0:
            continue                    # pas de colonne dans les axes (31/10)
        a = math.radians(360 * k / COL_N)
        p.circle(COL_R * math.cos(a), COL_R * math.sin(a), COL_D / 2, "mur")
    # Murs extérieurs, percés des quatre portes
    p.rect(-h - T, h, h - PORTE, h + T, "mur")
    p.rect(-h + PORTE, -h - T, h + T, -h, "mur")
    p.rect(-h - T, -h - T, -h, h - PORTE, "mur")
    p.rect(h, -h + PORTE, h + T, h + T, "mur")

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
            paroi_fentes(x1, x1 + T, 0, 0, "y", seuil, sens); p.rect(x0 - T, y0, x0, y1, "mur")
            p.line(x0, seuil, x1, seuil, "seuil")
            p.line(x0, seuil + sens * COULOIR, x1, seuil + sens * COULOIR, "seuil")
            p.text((x0 + x1) / 2 + 0.4, seuil + sens * COULOIR * 0.6, f"COULOIR {c['nom']}", "tb", rot=-90)
        else:
            sens = 1 if nom == "est" else -1
            seuil = h if nom == "est" else -h
            if c["fentes"] == "nord":
                paroi_fentes(0, 0, y1, y1 + T, "x", seuil, sens); p.rect(x0, y0 - T, x1, y0, "mur")
            else:
                paroi_fentes(0, 0, y0 - T, y0, "x", seuil, sens); p.rect(x0, y1, x1, y1 + T, "mur")
            bout = seuil + sens * COULOIR
            p.line(seuil, y0, seuil, y1, "seuil")
            p.rect(bout, y0 - T, bout + sens * T, y1 + T, "mur")
            p.text((seuil + bout) / 2, (y0 + y1) / 2 - 0.1, c["nom"] + " (fermé)", "tb")
    p.text(h - PORTE / 2, h + COULOIR + 1.2, "vers la salle suivante", "tn")
    p.text(-h + PORTE / 2, -h - COULOIR - 1.2, "depuis la salle précédente", "tn")

    # Étiquettes et cotes
    p.text(F0 - 0.3, 1.2, "fente en L", "tl", "end")
    p.text(h - PIL_P - 0.4, -3.2, "pilastre", "tn", "end")
    p.text(COL_R * math.cos(math.radians(15)) + 0.4, COL_R * math.sin(math.radians(15)), "colonne Ø 1,5", "tn", "start")
    p.text(8.4 * math.cos(math.radians(112)), 8.4 * math.sin(math.radians(112)), "banc", "tn")
    p.cote((-h - T, -h), (-h - T, h), 2.2)
    p.cote((-h, -h - T), (h, -h - T), -2.2)
    p.cote((0, 0), (0, -R), 0.6, "R 20")
    p.cote((0, 0), (COL_R * math.cos(math.radians(-150)), COL_R * math.sin(math.radians(-150))), 0.6, "R 13")
    p.cote((-PUITS_R, 0), (PUITS_R, 0), 0, "")
    p.text(-PUITS_R + 1.6, 0.4, "Ø 11", "tc")
    p.cote((-BANC_R - BANC_P, -1.2), (-BANC_R, -1.2), -0.6)
    # pan coupé vers la porte nord-est : largeur du passage
    p.cote((12, 16), (16, 12), -0.6, "5,66")
    p.cote((h - PORTE, h + T), (h, h + T), 1.4)
    # pilastre est : saillie et largeur
    p.cote((h - PIL_P, -PIL_L / 2), (h - PIL_P, PIL_L / 2), 0.6)
    p.cote((h - PIL_P, -PIL_L / 2 - 0.2), (h, -PIL_L / 2 - 0.2), 1.6)
    p.cote((F0, 0.9), (h - PIL_P, 0.9), -1.6)
    nx0, ny0 = -h - 10, h + 10
    p.add(f'<g transform="translate({nx0},{-ny0})"><circle class="boussole" r="1.6"/>'
          f'<path class="nord" d="M0,-1.5 L0.6,0.6 L0,0.1 L-0.6,0.6 Z"/>'
          f'<text class="tb" x="0" y="-2.3" text-anchor="middle" dominant-baseline="middle">N</text></g>')
    p.echelle(5, -h - COULOIR)
    vb = (-h - COULOIR - 3, -(h + COULOIR + 3), C + 2 * COULOIR + 6, C + 2 * COULOIR + 6)
    svg_plan = p.svg(vb, "Plan")

    # --- Coupe A–A est-ouest par le centre, vue vers le nord ---
    c = Dessin()
    # faisceau de l'oculus (soleil de la salle presque vertical : 3° vers l'ouest dans ce plan)
    kx = math.tan(math.radians(3))
    hb = H + COUPOLE_H
    c.rect(-PUITS_R, hb, PUITS_R, TOIT, "lum")
    c.poly([(-PUITS_R, TOIT), (PUITS_R, TOIT), (PUITS_R - kx * TOIT, 0), (-PUITS_R - kx * TOIT, 0)], "faisceau")
    x = -PUITS_R
    for v in VIDES[:-1]:
        x += v
        c.rect(x, TOIT - LAME_H, x + LAME_E, TOIT, "lame-loin")
        x += LAME_E
    # coupole : coque de 0,6 m entre le plafond plat et l'oculus
    calotte = [(r, zc + math.sqrt(RHO ** 2 - r ** 2)) for r in [PUITS_R + (COUPOLE_R - PUITS_R) * k / 24 for k in range(25)]]
    for s_ in (-1, 1):
        c.poly([(s_ * r, z) for r, z in calotte] + [(s_ * COUPOLE_R, H + 0.6), (s_ * (COUPOLE_R + 1), H + 0.6),
               (s_ * (COUPOLE_R + 1), TOIT), (s_ * (PUITS_R + 0.6), TOIT), (s_ * (PUITS_R + 0.6), hb), (s_ * PUITS_R, hb)], "mur")
        c.rect(s_ * PUITS_R, hb, s_ * (PUITS_R + 0.6), TOIT, "mur")
    for s in (-1, 1):
        # fente en L : dans le pilastre depuis 3 m, puis au plafond sur 5 m, avec sa chambre ; paroi lumineuse au fond
        sx = lambda v: s * v
        c.rect(sx(h - PIL_P), FENTE_BAS, sx(FOND), H, "lum")
        c.rect(sx(F0), H, sx(FOND), H + FENTE_P - 0.2, "lum")
        trait = [(sx(FOND - 0.08), FENTE_BAS), (sx(FOND - 0.08), H + FENTE_P - 0.28), (sx(F0), H + FENTE_P - 0.28)]
        c.add('<polyline class="lueur-trait" points="' + " ".join(f"{x:.3f},{-y:.3f}" for x, y in trait) + '"/>')
        c.rect(sx(h), -0.6, sx(h + T), H + FENTE_P, "mur")                      # mur extérieur
        c.rect(sx(h - PIL_P), 0, sx(h), FENTE_BAS, "mur")                       # pilastre (coupé), sous la fente
        c.rect(sx(FOND), FENTE_BAS, sx(h), H + FENTE_P, "mur")                  # pilastre, derrière la fente
        c.rect(sx(F0), H + FENTE_P - 0.2, sx(FOND), H + FENTE_P, "mur")         # dessus de la chambre
        c.rect(sx(F0 - 0.25), H, sx(F0), H + FENTE_P, "mur")
        c.rect(sx(COUPOLE_R), H, sx(F0 - 0.25), H + 0.6, "mur")
        for a in (30, 60):
            xc = s * COL_R * math.cos(math.radians(a))
            c.rect(xc - COL_D / 2, 0, xc + COL_D / 2, H, "porte-loin")             # colonnes au-delà
        c.rect(s * BANC_R, 0, s * (BANC_R + BANC_P), BANC_H, "banc")
    c.rect(-h - T, -0.6, h + T, 0, "mur")
    c.rect(-SOCLE_R, 0, SOCLE_R, SOCLE_H, "banc")
    c.add(f'<rect class="oeuvre" x="{-OEUVRE[0]/2}" y="{-(SOCLE_H + OEUVRE[2])}" width="{OEUVRE[0]}" height="{OEUVRE[2]}" rx="0.4"/>')
    c.text(0, SOCLE_H + OEUVRE[2] + 0.8, "HUNTINGTON", "tb")
    c.text(-(h - PIL_P) + 0.5, 9, "fente en L", "tn", "start", rot=-90)
    c.cote((F0, H), (h - PIL_P, H), -0.9)
    c.cote((-h, -0.6), (h, -0.6), -1.4)
    c.cote((h + T, 0), (h + T, H), -1.6)
    c.cote((h + T, 0), (h + T, FENTE_BAS), -3.2)
    c.cote((-PUITS_R, TOIT), (PUITS_R, TOIT), 2.2)
    c.cote((-COUPOLE_R + 1.5, 0), (-COUPOLE_R + 1.5, hb), 0, f(hb))
    c.echelle(-h, -5.0)
    svg_coupe = c.svg((-h - 5, -(TOIT + 4), C + 10, TOIT + 10), "Coupe A–A")

    style = re.search(r"<style>.*?</style>", open(os.path.join(ICI, "salle-refonte.html")).read(), re.S).group(0)
    style = style.replace("</style>", "  .vues { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }\n"
                          "  .vues figure { padding:0; overflow:hidden; } .vues img { display:block; width:100%; height:auto; }\n"
                          "  .vues figcaption { padding:8px 12px; font-size:13.5px; color:#555; }\n"
                          "  .lueur-trait { fill:none; stroke:rgba(240,170,50,.9); stroke-width:.16; }\n"
                          "  .coupole { fill:none; stroke:#8a5d0c; stroke-width:.09; stroke-dasharray:.9 .35; }\n"
                          "  figure svg text { paint-order:stroke; stroke:#fff; stroke-width:.14px; stroke-linejoin:round; }\n"
                          "  .l-coupole::before { background:none; border-color:#8a5d0c!important; border-style:dashed!important; border-radius:50%; }\n</style>")
    lu = [
        "Même carré de <b>40 × 40 m</b>, mêmes <b>portes</b> dans les angles (en moulinet) et mêmes <b>couloirs</b> de 14 × 4 m : "
        "le passage d'une salle à l'autre ne change pas.",
        "À l'intérieur, une <b>rotonde de 40 m de diamètre</b>, tangente aux quatre murs ; entre le cercle et le carré, de la pierre pleine.",
        "Vers chaque porte, deux <b>pans coupés à 45°</b> ouvrent la rotonde (passage de 5,66 m) sur un carré de 4 × 4 m dans l'angle.",
        "Au milieu de chaque mur, un <b>pilastre</b> : 1 m de saillie, 4,2 m de large côté salle, côtés évasés vers le mur.",
        "Dans l'axe de chaque pilastre, une <b>fente</b> de 0,6 m de large (au lieu des quatre fentes de 28 m le long des murs).",
        "<b>12 colonnes rondes</b> de 1,5 m de diamètre, du sol au plafond, sur un cercle de 13 m, une tous les 30° (dont une dans chaque axe).",
        "<b>Oculus rond de 11 m</b> au-dessus de l'œuvre, centré, avec les 6 lames nord-sud (même rythme, mis à 11 m).",
        "Essais sur <b>« La maladie de Huntington »</b>, sur son socle à gorge lumineuse, avec les couleurs bleutées de sa salle.",
        "<b>Quatre bancs en arc</b> de 45°, de 6,5 à 7,2 m du centre, centrés sur les axes (au lieu de 10 à 11 m).",
    ]
    questions = [
        "<b>8 colonnes</b> : celles des axes nord, sud, est et ouest sont retirées (31/10), pour laisser entrer la lumière des fentes.",
        "<b>Vue d'arrivée à 11 m</b>, devant les colonnes. Cercle (4,5 m) et cercle réduit (3 m) de Huntington inchangés : ils "
        "restent à l'intérieur des bancs.",
        "<b>Oculus centré</b>, comme sur le plan. Pour que le faisceau tombe sur l'œuvre, cette salle a son propre soleil, "
        "presque vertical (4° vers le nord, 3° vers l'ouest, au lieu de 10° et 8°).",
        "<b>Fentes en L</b> (31/10) : dans chaque pilastre, une fente de 0,6 m part de 3 m du sol, monte jusqu'au plafond "
        "(0,6 m de profondeur dans le pilastre), puis longe le plafond vers le centre sur 5 m (chambre de 3 m au-dessus). "
        "Au fond, une paroi lumineuse : la fente se lit comme un trait de lumière et éclaire doucement la salle.",
        "<b>Coupole</b> à l'intérieur du cercle des colonnes, sans reposer sur elles : elle part du plafond plat (17,5 m) à 10 m "
        "du centre, entre les colonnes et les bancs, et monte jusqu'au bord de l'oculus, à 24,5 m ; conduit de 3 m au-dessus, "
        "avec les lames. Un anneau de plafond plat de 3 m reste au-dessus des colonnes.",
    ]
    a_trancher = [
        "Hauteur de la coupole (7 m au-dessus du plafond plat) : avec un pied à 10 m, c'est presque une demi-sphère.",
        "Le raccord entre coupole et plafond plat fait une arête : on peut l'adoucir ou la souligner (corniche).",
    ]
    vues = [
        ("arrivee", "Vue d'arrivée, à 11 m de l'œuvre."),
        ("entree", "En entrant par la porte sud-ouest : le pan coupé, la colonnade et la coupole."),
        ("cercle", "Sur le cercle de 4,5 m, face à l'œuvre."),
        ("coupole", "La coupole, l'oculus et ses lames ; en bas, les fentes au plafond."),
        ("pilastre", "Le pilastre ouest : la fente part de 3 m, monte et longe le plafond sur 5 m."),
        ("dessus", "Vue de dessus, plafond retiré (la lumière reste celle de la salle couverte)."),
    ]
    galerie = "".join(f'<figure><img src="captures/rotonde-{n}.png" alt=""><figcaption>{t}</figcaption></figure>' for n, t in vues)
    html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rotonde — projet</title>
{style}</head>
<body><main>
<h1>Rotonde — plan coté et aperçu (d'après ton SVG)</h1>
<p class="sous">Relevé sur « planCercleColonne.svg » (1 m = 10 px), 30/10/2026. Cotes en mètres. Aperçu rendu directement
dans Blender, sans précalcul de lumière : la géométrie est juste, la lumière est indicative.</p>
<h2>Ce que j'ai lu</h2><ul>{''.join(f'<li>{x}</li>' for x in lu)}</ul>
<h2>Décisions de Ludovic (30/10)</h2><ul>{''.join(f'<li>{x}</li>' for x in questions)}</ul>
<h2>À trancher</h2><ul class="q">{''.join(f'<li>{x}</li>' for x in a_trancher)}</ul>
<h2>Aperçu</h2>
<div class="vues">{galerie}</div>
<svg width="0" height="0" style="position:absolute"><defs>
  <marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#c0392b"/></marker>
</defs></svg>
<h2>Plan</h2>
<p class="note">Nord en haut. Ouvertures du plafond en pointillés. Anneaux verts : trajets de la caméra pour Huntington.</p>
<figure>{svg_plan}
<div class="legende"><span class="l-mur">pierre pleine, colonnes</span><span class="l-lum">ouverture au plafond</span><span class="l-fente">fente des couloirs</span><span class="l-porte">porte / seuil</span><span class="l-anneau">trajets de la caméra</span><span class="l-coupole">pied de la coupole</span></div></figure>
<h2>Coupe A–A</h2>
<p class="note">Est-ouest par le centre, vue vers le nord : coupole, pilastres et colonnes est et ouest coupés, colonnes au-delà en pointillés. En jaune : le faisceau de l'oculus et les fentes en L, avec leur paroi lumineuse.</p>
<figure>{svg_coupe}</figure>
</main></body></html>
"""
    open(os.path.join(ICI, "salle-rotonde.html"), "w").write(html)
    print("ok → salle-rotonde.html", "pilastre", tuple(round(v, 2) for v in PIL))


generer()
