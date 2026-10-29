"""Plan coté de la salle de 40 × 40 m, d'après le plan de Ludovic (plans/plan salle.svg, 1 m = 10 px).

    python3 plans/generer-plan-40.py      → plans/salle-40.html

Interprétation à valider avant la 3D : les points incertains sont listés en tête de la page.
Repère : x vers l'est, y vers le nord (Blender), origine au centre de la salle, en mètres.
"""
import importlib.util, math, os, re

ICI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("plan", os.path.join(ICI, "generer-plan.py"))
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)
Dessin, f, PX = plan.Dessin, plan.f, plan.PX

# --- Valeurs relevées sur le SVG (et reprises de la salle actuelle quand le SVG ne dit rien) ---
C = 40.0; h = C / 2         # salle 40 × 40 m
H = 17.5                    # hauteur sous plafond (inchangée)
T = 0.4                     # murs dessinés à 0,4 m sur le SVG
PORTE = 4.0                 # portes et couloirs de 4 m de large
COULOIR = 14.0              # couloirs de 14 m
PUITS, PUITS_P = 10.0, 5.0
FENTE_L, FENTE_LONG, FENTE_P = 0.9, 28.0, 3.0   # 1,4 m sur le SVG, à cheval sur le mur : voir questions
COLONNE = 3.0               # 4 colonnes de 3 × 3 m (4 m sur le SVG, réduites le 29/10), à 4 m des murs
BANC_R, BANC_P = 10.0, 1.0  # bancs en arc : de 10 à 11 m du centre, 1 m de profondeur, 45° chacun
BANCS = [(0, 45), (90, 135), (180, 225), (270, 315)]  # angles depuis l'est, sens trigonométrique
F_LARG, F_PAS, F_PREMIERE, F_N, F_H, F_EP = 1.0, 2.0, 2.0, 6, 14.0, 0.4  # fentes des couloirs
OEUVRE = (6.6, 3.9, 10.0)
ANNEAUX = [(5.5, "cercle réduit 5,5 m"), (9, "cercle 9 m"), (13, "vue d'arrivée 13 m")]
# Soleil actuel (sud 10°, est 8°) : puits décalé vers lui pour que le faisceau tombe sur l'œuvre
SOLEIL = tuple(c / math.hypot(math.tan(math.radians(8)), math.tan(math.radians(10)), 1)
               for c in (-math.tan(math.radians(8)), math.tan(math.radians(10)), -1.0))
kx, ky = SOLEIL[0] / -SOLEIL[2], SOLEIL[1] / -SOLEIL[2]
z_mi = H + PUITS_P / 2 - OEUVRE[2] / 2
PX0, PY0 = round(-kx * z_mi, 1), round(-ky * z_mi, 1)
LAMES = dict(epaisseur=0.25, hauteur=1.5, vides=[1.58, 0.85, 1.7, 0.97, 1.46, 0.73, 1.21])

# Portes : (mur, bord de l'ouverture le long du mur, sens du couloir, couloir ouvert au bout ?)
# Plan « en moulinet » : chaque porte est au bout droit de son mur vu de l'intérieur.
PORTES = {
    "nord": dict(x=(h - PORTE, h), y=(h, h + COULOIR), fentes="est", ouvert=True, nom="SORTIE"),
    "sud": dict(x=(-h, -h + PORTE), y=(-h - COULOIR, -h), fentes="est", ouvert=True, nom="ENTRÉE"),
    "ouest": dict(x=(-h - COULOIR, -h), y=(h - PORTE, h), fentes="nord", ouvert=False, nom="COULOIR OUEST"),
    "est": dict(x=(h, h + COULOIR), y=(-h, -h + PORTE), fentes="sud", ouvert=False, nom="COULOIR EST"),
}


def generer():
    p = Dessin()
    for r, lab in ANNEAUX:
        p.circle(0, 0, r, "anneau")
        p.text(r * math.cos(math.radians(-60)) + 0.3, r * math.sin(math.radians(-60)) - 0.3, lab, "tn", "start")

    # Fentes zénithales : contre chaque mur, centrées, 28 m (6 m des angles)
    fl, fd = FENTE_L, FENTE_LONG / 2
    p.rect(-h, -fd, -h + fl, fd, "lum"); p.rect(h - fl, -fd, h, fd, "lum")
    p.rect(-fd, h - fl, fd, h, "lum"); p.rect(-fd, -h, fd, -h + fl, "lum")
    # Puits et lames
    P = PUITS
    p.rect(PX0 - P / 2, PY0 - P / 2, PX0 + P / 2, PY0 + P / 2, "lum")
    x = PX0 - P / 2
    for i, v in enumerate(LAMES["vides"][:-1]):
        x += v
        p.rect(x, PY0 - P / 2, x + LAMES["epaisseur"], PY0 + P / 2, "lame")
        x += LAMES["epaisseur"]
    p.text(PX0, PY0 + P / 2 + 2.9, "PUITS DE LUMIÈRE ET LAMES", "tl")
    p.text(PX0, PY0 + P / 2 + 2.1, f"10 × 10 m, décalé de {f(abs(PY0))} m au sud et {f(abs(PX0))} m à l'est", "tp")
    # Œuvre
    w, d, _ = OEUVRE
    p.add(f'<rect class="oeuvre" x="{-w/2}" y="{-d/2}" width="{w}" height="{d}" rx="1.2"/>')
    p.text(0, 0.35, "ŒUVRE", "tb"); p.text(0, -0.55, "H 10 m", "tp")
    p.fleche(0, -2.4, -3.4); p.text(0.45, -3.05, "face avant", "tn", "start")
    # Bancs en arc
    for a0, a1 in BANCS:
        r0, r1 = BANC_R, BANC_R + BANC_P
        pts = [(r1 * math.cos(math.radians(a)), r1 * math.sin(math.radians(a))) for a in range(a0, a1 + 1, 3)]
        pts += [(r0 * math.cos(math.radians(a)), r0 * math.sin(math.radians(a))) for a in range(a1, a0 - 1, -3)]
        p.poly(pts, "banc")
    p.text(11.6 * math.cos(math.radians(22)), 11.6 * math.sin(math.radians(22)) + 0.6, "banc en arc", "tn", "start")
    # Colonnes
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.rect(sx * (16 - COLONNE), sy * (16 - COLONNE), sx * 16, sy * 16, "mur")
    p.text(-14.5, 16.9, f"colonne {f(COLONNE)} × {f(COLONNE)} m", "tn")

    # Murs de la salle, percés des quatre portes
    p.rect(-h - T, h, h - PORTE, h + T, "mur")             # nord, porte à l'est
    p.rect(-h + PORTE, -h - T, h + T, -h, "mur")           # sud, porte à l'ouest
    p.rect(-h - T, -h - T, -h, h - PORTE, "mur")           # ouest, porte au nord
    p.rect(h, -h + PORTE, h + T, h + T, "mur")             # est, porte au sud

    # Couloirs
    def paroi_fentes(x0, x1, y0, y1, long_axe, depuis, sens):
        """Paroi percée de 6 fentes de 1 m : depuis = coordonnée du seuil, sens = +1/-1."""
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
        vertical = nom in ("nord", "sud")
        if vertical:
            sens = 1 if nom == "nord" else -1
            seuil = h if nom == "nord" else -h
            if c["fentes"] == "est":
                paroi_fentes(x1, x1 + T, 0, 0, "y", seuil, sens); p.rect(x0 - T, y0, x0, y1, "mur")
            else:
                paroi_fentes(x0 - T, x0, 0, 0, "y", seuil, sens); p.rect(x1, y0, x1 + T, y1, "mur")
            bout = seuil + sens * COULOIR
            p.line(x0, seuil, x1, seuil, "seuil")
            if c["ouvert"]:
                p.line(x0, bout, x1, bout, "seuil")
            else:
                p.rect(x0 - T, bout, x1 + T, bout + sens * T, "mur")
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
            if c["ouvert"]:
                p.line(bout, y0, bout, y1, "seuil")
            else:
                p.rect(bout, y0 - T, bout + sens * T, y1 + T, "mur")
            p.text((seuil + bout) / 2, (y0 + y1) / 2 - 0.1, c["nom"] + " (fermé)", "tb")
    p.text(h - PORTE / 2, h + COULOIR + 1.2, "vers la salle suivante", "tn")
    p.text(-h + PORTE / 2, -h - COULOIR - 1.2, "depuis la salle précédente", "tn")

    # Étiquettes des fentes zénithales
    p.text(-6, -h + fl + 1.0, "fente zénithale 28 m (une le long de chaque mur)", "tl", "start")

    # Cotes
    p.chaine([-h, h - PORTE, h], 1.4, a_y=h + T)                       # nord : mur + porte
    p.cote((-h - T, -h), (-h - T, h), 2.2)                              # 40
    p.cote((-h, -h - T), (h, -h - T), -2.2)                             # 40 (sud)
    p.chaine([h, h + COULOIR], -2.0, a_x=h - PORTE - T)                 # couloir nord 14
    p.cote((h - PORTE, h + COULOIR), (h, h + COULOIR), 1.4)             # 4
    p.chaine([-h, -fd, fd, h], -2.4, a_x=-h)                            # fente ouest : 6 / 28 / 6
    p.cote((-h, 9), (-h + fl, 9), 1.0, f(fl))
    p.cote((-16, 16 - COLONNE), (-16 + COLONNE, 16 - COLONNE), 1.0)       # colonne
    p.cote((-h, 14), (-16, 14), 0.8)                                     # 4 du mur
    p.cote((PX0 - P / 2, PY0 - P / 2), (PX0 + P / 2, PY0 - P / 2), -1.2)
    p.text(-11.5, -1.0, "bancs : r 10 à 11 m", "tn", "end")
    # Fentes du couloir nord : 1,5 / 1 / 1 / … (premier entraxe)
    p.cote((h + T, h), (h + T, h + F_PREMIERE - F_LARG / 2), -1.2)
    p.cote((h + T, h + F_PREMIERE - F_LARG / 2), (h + T, h + F_PREMIERE + F_LARG / 2), -1.2)
    p.cote((h + T, h + F_PREMIERE), (h + T, h + F_PREMIERE + F_PAS), -2.6)
    # Nord, échelle
    nx0, ny0 = -h - 10, h + 10
    p.add(f'<g transform="translate({nx0},{-ny0})"><circle class="boussole" r="1.6"/>'
          f'<path class="nord" d="M0,-1.5 L0.6,0.6 L0,0.1 L-0.6,0.6 Z"/>'
          f'<text class="tb" x="0" y="-2.3" text-anchor="middle" dominant-baseline="middle">N</text></g>')
    p.echelle(5, -h - COULOIR)
    vb = (-h - COULOIR - 3, -(h + COULOIR + 3), C + 2 * COULOIR + 6, C + 2 * COULOIR + 6)
    svg_plan = p.svg(vb, "Plan")

    # --- Coupe A–A est-ouest par le centre, vue vers le nord ---
    c = Dessin()
    c.rect(-h, H, -h + fl, H + FENTE_P, "lum"); c.rect(h - fl, H, h, H + FENTE_P, "lum")
    c.rect(PX0 - P / 2, H, PX0 + P / 2, H + PUITS_P, "lum")
    # faisceau (projection est-ouest, sans les lames pour la lisibilité)
    lo, hi = PX0 - P / 2 - kx * PUITS_P, PX0 + P / 2
    c.poly([(lo, H + PUITS_P), (hi, H + PUITS_P), (hi + kx * (H + PUITS_P), 0), (lo + kx * (H + PUITS_P), 0), (PX0 - P / 2, H)], "faisceau")
    # fente ouest : le soleil (venant de l'est) effleure le mur ouest → lueur
    xc = fl + FENTE_P * kx
    bas = H - xc / -kx
    c.poly([(-h, H + FENTE_P), (-h + fl, H + FENTE_P), (-h, bas)], "faisceau")
    c.line(-h + 0.12, bas, -h + 0.12, H, "lueur")
    # fente est : le soleil s'éloigne du mur est → il atteint le sol (bande au sol)
    sol0, sol1 = h - fl + kx * (H + FENTE_P), h + kx * H
    c.poly([(h - fl, H + FENTE_P), (h, H + FENTE_P), (h, H), (sol1, 0), (sol0, 0)], "faisceau-alerte")
    c.text((sol0 + sol1) / 2 - 0.3, 0.9, "soleil au sol (fente est)", "tn", "end")
    # murs, sol, plafond
    c.rect(-h - T, -0.6, h + T, 0, "mur")
    c.rect(-h - T, 0, -h, H + FENTE_P, "mur"); c.rect(h, 0, h + T, H + FENTE_P, "mur")
    c.rect(-h + fl, H, PX0 - P / 2, H + 0.6, "mur"); c.rect(PX0 + P / 2, H, h - fl, H + 0.6, "mur")
    c.rect(-h + fl, H, -h + fl + 0.25, H + FENTE_P, "mur"); c.rect(h - fl - 0.25, H, h - fl, H + FENTE_P, "mur")
    c.rect(PX0 - P / 2 - 0.25, H, PX0 - P / 2, H + PUITS_P, "mur"); c.rect(PX0 + P / 2, H, PX0 + P / 2 + 0.25, H + PUITS_P, "mur")
    # au-delà : colonnes nord (à 12–16 m) et bancs
    for sx in (-1, 1):
        c.rect(sx * (16 - COLONNE), 0, sx * 16, H, "porte-loin")
    c.text(-14.5, H / 2, "colonne (au-delà)", "tn", rot=-90)
    for sx in (-1, 1):
        c.rect(sx * BANC_R, 0, sx * (BANC_R + BANC_P), 0.45, "banc")
    c.add(f'<rect class="oeuvre" x="{-OEUVRE[0]/2}" y="{-OEUVRE[2]}" width="{OEUVRE[0]}" height="{OEUVRE[2]}" rx="1.5"/>')
    c.text(0, 5.5, "ŒUVRE", "tb")
    c.cote((-h, -0.6), (h, -0.6), -1.4)
    c.cote((h + T, 0), (h + T, H), -1.6)
    c.cote((-h + 0.3, bas), (-h + 0.3, H), -1.2, f"cœur de la lueur {f(round(H - bas, 1))}")
    c.cote((PX0 - P / 2, H + PUITS_P), (PX0 + P / 2, H + PUITS_P), 2.2)
    c.echelle(-h, -5.0)
    svg_coupe = c.svg((-h - 5, -(H + PUITS_P + 4), C + 10, H + PUITS_P + 10), "Coupe A–A")

    # --- Élévation de la paroi à fentes d'un couloir ---
    e = Dessin()
    e.rect(0, 0, COULOIR, H, "paroi")
    for k in range(F_N):
        dc = F_PREMIERE + k * F_PAS
        e.rect(dc - F_LARG / 2, 0, dc + F_LARG / 2, F_H, "fente")
    e.rect(-0.6, -0.6, COULOIR + 0.6, 0, "mur")
    e.line(0, 0, 0, H, "seuil"); e.line(COULOIR, 0, COULOIR, H, "seuil")
    e.text(-1.1, H / 2, "côté salle", "tn", rot=-90)
    e.text(COULOIR + 1.1, H / 2, "bout du couloir", "tn", rot=-90)
    e.chaine([0, 1.5, 2.5, 3.5], 1.2, a_y=H)
    e.cote((12.5, H), (COULOIR, H), 1.2)
    e.cote((0, H), (COULOIR, H), 2.8)
    e.cote((COULOIR, 0), (COULOIR, F_H), -3.0); e.cote((COULOIR, F_H), (COULOIR, H), -3.0)
    e.text(COULOIR / 2, -2.0, "6 fentes de 1 × 14 m, entraxe 2 m, 1,5 m aux bouts", "tl")
    e.echelle(0, -4.4)
    svg_elev = e.svg((-3.5, -(H + 5.5), COULOIR + 12, H + 11), "Paroi à fentes")

    style = re.search(r"<style>.*?</style>", open(os.path.join(ICI, "salle-refonte.html")).read(), re.S).group(0)
    style = style.replace("</style>", "  .faisceau-alerte { fill:rgba(220,70,60,.22); stroke:none; }\n</style>")
    questions = [
        "<b>Fentes zénithales</b> de 0,9 m contre le mur (3 m de profondeur).",
        "<b>Soleil au sol</b> accepté par les fentes est et sud (en rouge sur la coupe) ; lueur sur les murs ouest et nord.",
        "<b>Couloirs est et ouest</b> : impasses, pour enrichir l'environnement visuel (fentes et lumière, sans passage).",
        "<b>Fentes du couloir entre deux salles à l'est</b> (couloirs de sortie et d'entrée : c'est le même couloir).",
        "<b>Puits décalé</b> de 2,6 m au sud et 2,1 m à l'est, pour que le faisceau incliné tombe sur l'œuvre.",
        "Inchangés : hauteur 17,5 m, portes jusqu'au plafond, fentes des couloirs de 14 m de haut, colonnes jusqu'au "
        "plafond, bancs de 0,45 m de haut, anneaux de la caméra (5,5 / 9 / 13 m).",
    ]
    lu = [
        "Salle de <b>40 × 40 m</b> (30 × 30 aujourd'hui), murs de 0,4 m.",
        "<b>Quatre portes</b> de 4 m, chacune au bout droit de son mur vu de l'intérieur (plan « en moulinet ») : "
        "nord (sortie), sud (entrée), ouest et est.",
        "<b>Quatre couloirs</b> de 14 × 4 m : nord et sud ouverts au bout (vers les salles voisines), ouest et est fermés.",
        "Dans chaque couloir, <b>6 fentes de 1 m</b>, une tous les 2 m (1,5 m de mur plein aux deux bouts), dans la paroi "
        "qui prolonge un mur de la salle.",
        "<b>Quatre fentes zénithales</b> de 28 m, une le long de chaque mur, à 6 m des angles (elles ne vont plus dans le couloir).",
        "<b>Quatre colonnes</b> de 3 × 3 m (4 m sur ton plan, réduites ensuite), à 4 m des murs dans les angles.",
        "<b>Quatre bancs en arc</b>, de 10 à 11 m du centre, 45° chacun, en moulinet.",
        "Puits de 10 × 10 m (avec ses lames) et œuvre au centre.",
    ]
    html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Salle de 40 m — projet</title>
{style}</head>
<body><main>
<h1>Salle de 40 × 40 m — plan coté (d'après ton SVG)</h1>
<p class="sous">Relevé sur « plan salle.svg » (1 m = 10 px), 29/10/2026, validé par Ludovic. Cotes en mètres.</p>
<h2>Ce que j'ai lu</h2><ul>{''.join(f'<li>{x}</li>' for x in lu)}</ul>
<h2>Décisions de Ludovic (29/10)</h2><ul>{''.join(f'<li>{x}</li>' for x in questions)}</ul>
<svg width="0" height="0" style="position:absolute"><defs>
  <marker id="pointe" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#c0392b"/></marker>
</defs></svg>
<h2>Plan</h2>
<p class="note">Nord en haut. Fentes zénithales et puits au plafond (pointillés). Anneaux verts : trajets de la caméra.</p>
<figure>{svg_plan}
<div class="legende"><span class="l-mur">murs, colonnes</span><span class="l-lum">ouverture au plafond</span><span class="l-fente">fente des couloirs</span><span class="l-porte">porte / seuil</span><span class="l-anneau">trajets de la caméra</span></div></figure>
<h2>Coupe A–A</h2>
<p class="note">Est-ouest par le centre, vue vers le nord. En rouge : le soleil qui, par la fente est, atteint le sol.</p>
<figure>{svg_coupe}</figure>
<h2>Paroi à fentes d'un couloir</h2>
<figure>{svg_elev}</figure>
</main></body></html>
"""
    open(os.path.join(ICI, "salle-40.html"), "w").write(html)
    print("ok → salle-40.html", "puits", PX0, PY0, "lueur jusqu'à", round(bas, 1))


generer()
