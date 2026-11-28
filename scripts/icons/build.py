#!/usr/bin/env python3
"""RLC icon set: builds public/icons.svg (a sprite of <symbol>s) from hand-drawn glyphs.

Style: every icon is a glossy "sticker" — a dark outline around the whole glyph, a two-tone gradient
with a hard highlight split, a soft aura behind and sparkles for the rarer items.
Run:  python3 scripts/icons/build.py   (also writes /tmp/icons-sheet.svg for a visual check)
"""
import math, os, hashlib

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "icons.svg")
MANIFEST = os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "icons.ts")
INK = "#071024"

# light, mid, deep
PAL = {
    "fire":   ("#FFF0A0", "#FF8A1F", "#D3201B"),
    "gold":   ("#FFF4C2", "#F5C443", "#A86C0E"),
    "ice":    ("#F0FEFF", "#7FE3FF", "#2477F0"),
    "sky":    ("#E6F7FF", "#37BEFE", "#0B5FD6"),
    "purple": ("#F3E1FF", "#B36BFF", "#5A1FC9"),
    "pink":   ("#FFE3F2", "#FF6BB5", "#B3155F"),
    "green":  ("#E6FFE4", "#5CEB8B", "#0E8F4C"),
    "red":    ("#FFDCDC", "#FF4D5E", "#9B0E26"),
    "teal":   ("#DBFFF8", "#2EE5C5", "#087C80"),
    "silver": ("#FFFFFF", "#C9D6E8", "#5E6F8E"),
    "void":   ("#D9CCFF", "#6A4BE0", "#170A45"),
    "orange": ("#FFE6C2", "#FFA23A", "#B54B05"),
    "bone":   ("#FFFFFF", "#E8E1D0", "#8C8270"),
    "steel":  ("#F2F6FF", "#9FB2D1", "#3B4A66"),
    "lime":   ("#F4FFD6", "#B7F542", "#4E8A0B"),
    "rose":   ("#FFE8EE", "#FF8FAB", "#C2185B"),
    "uz":     ("#E9FBFF", "#1EB6E8", "#0A6E3A"),
}

defs = []
symbols = []
names = []


def grad(pal):
    gid = f"g-{pal}"
    if gid not in [d[0] for d in defs]:
        l, m, d = PAL[pal]
        def mix(a, b, t):
            a, b = int(a[1:], 16), int(b[1:], 16)
            ch = [round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) for s in (16, 8, 0)]
            return "#%02X%02X%02X" % tuple(ch)
        defs.append((gid, f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="20" y1="4" x2="34" y2="60"><stop offset="0" stop-color="{l}"/><stop offset=".47" stop-color="{mix(l, m, .7)}"/><stop offset=".47" stop-color="{m}"/><stop offset="1" stop-color="{d}"/></linearGradient>'))
        aid = f"a-{pal}"
        defs.append((aid, f'<radialGradient id="{aid}"><stop offset="0" stop-color="{m}" stop-opacity=".55"/><stop offset=".6" stop-color="{m}" stop-opacity=".15"/><stop offset="1" stop-color="{m}" stop-opacity="0"/></radialGradient>'))
    return f"url(#{gid})"


def fill_of(role, pal, acc):
    if role == "main":
        return grad(pal)
    if role == "acc":
        return grad(acc)
    if role == "light":
        return "#FFFFFF"
    if role == "dark":
        return INK
    if role == "soft":
        return PAL[pal][0]
    if role in PAL:
        return grad(role)
    return role


# A part: (kind, attrs, role, extra) where kind is "path"/"circle"/"ellipse"/"rect"/"polygon"/"stroke"/"text".
def P(d, role="main"):
    return ("path", f'd="{d}"', role, None)


def C(cx, cy, r, role="main"):
    return ("circle", f'cx="{cx}" cy="{cy}" r="{r}"', role, None)


def E(cx, cy, rx, ry, role="main", rot=0):
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ""
    return ("ellipse", f'cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"{t}', role, None)


def R(x, y, w, h, rx=0, role="main", rot=0, cx=None, cy=None):
    t = f' transform="rotate({rot} {cx if cx is not None else x + w / 2} {cy if cy is not None else y + h / 2})"' if rot else ""
    return ("rect", f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"{t}', role, None)


def S(d, w, role="main"):
    """A stroked line (round caps) — outlined like any other part."""
    return ("stroke", f'd="{d}"', role, w)


def T(x, y, txt, size, role="light", weight=900):
    return ("text", f'x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif"', role, txt)


def poly(points, role="main"):
    return ("polygon", 'points="' + " ".join(f"{x:.1f},{y:.1f}" for x, y in points) + '"', role, None)


def star(cx, cy, r1, r2, n=5, rot=-90, role="main"):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(rot + i * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(pts, role)


def gear(cx, cy, r1, r2, teeth=8, role="main"):
    pts = []
    for i in range(teeth * 4):
        a = math.radians(i * 360 / (teeth * 4))
        r = r1 if (i % 4) in (0, 1) else r2
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(pts, role)


def laurel(cx, cy, r, role="acc", leaves=7, span=150):
    parts = []
    for side in (-1, 1):
        for i in range(leaves):
            a = math.radians(90 + side * (25 + i * span / leaves))
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            parts.append(E(round(x, 1), round(y, 1), 3.4, 6.5, role, rot=round(math.degrees(a) + 90 + side * 25)))
    return parts


def sparkle(x, y, s):
    return f'<path d="M{x} {y - s} Q{x} {y} {x + s} {y} Q{x} {y} {x} {y + s} Q{x} {y} {x - s} {y} Q{x} {y} {x} {y - s}Z" fill="#fff"/>'


def render_part(p, pal, acc, outline):
    kind, attrs, role, extra = p
    if outline:
        if kind == "stroke":
            return f'<path {attrs} fill="none" stroke="{INK}" stroke-width="{extra + 5}" stroke-linecap="round" stroke-linejoin="round"/>'
        if kind == "text":
            return f'<text {attrs} fill="{INK}" stroke="{INK}" stroke-width="5" stroke-linejoin="round">{extra}</text>'
        el = kind
        return f'<{el} {attrs} fill="{INK}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>'
    f = fill_of(role, pal, acc)
    if kind == "stroke":
        return f'<path {attrs} fill="none" stroke="{f}" stroke-width="{extra}" stroke-linecap="round" stroke-linejoin="round"/>'
    if kind == "text":
        return f'<text {attrs} fill="{f}">{extra}</text>'
    return f"<{kind} {attrs} fill=\"{f}\"/>"


def icon(name, pal, parts, acc=None, aura=True, sparkles=0, detail=()):
    """parts: outlined silhouette; detail: drawn on top without outline (facets, eyes, highlights)."""
    acc = acc or pal
    grad(pal)
    grad(acc)
    body = []
    if aura:
        body.append(f'<circle cx="32" cy="32" r="31" fill="url(#a-{pal})"/>')
    body += [render_part(p, pal, acc, True) for p in parts]
    body += [render_part(p, pal, acc, False) for p in parts]
    body += [render_part(p, pal, acc, False) for p in detail]
    spots = [(53, 12, 5), (11, 50, 3.6), (55, 50, 2.8), (9, 14, 3)]
    for x, y, s in spots[:sparkles]:
        body.append(sparkle(x, y, s))
    symbols.append(f'<symbol id="{name}" viewBox="0 0 64 64">{"".join(body)}</symbol>')
    names.append(name)


# ---------------------------------------------------------------- glyph library
def g_flame():
    return [P("M32 5C40 17 51 24 49 39C48 51 40 59 32 59C23 59 15 52 15 41C15 31 22 27 24 18C28 24 29 27 31 28C30 20 31 12 32 5Z")], [
        P("M32 31C36 37 41 41 40 47C39 53 36 56 32 56C27 56 24 52 24 47C24 42 29 39 32 31Z", "acc")]


def g_bolt():
    return [P("M37 3L13 36H29L23 61L51 25H35Z")], []


def g_crown():
    return [P("M8 20L20 31L32 12L44 31L56 20L51 50H13Z"), R(12, 46, 40, 10, 3, "acc")], [
        C(32, 12, 3.4, "light"), C(8, 20, 3, "light"), C(56, 20, 3, "light"), C(22, 51, 2.6, "dark"), C(32, 51, 2.6, "dark"), C(42, 51, 2.6, "dark")]


def g_diamond():
    return [P("M19 10H45L58 25L32 58L6 25Z")], [
        S("M6 25H58", 1.6, "soft"), S("M19 10L25 25L32 58L39 25L45 10", 1.6, "soft"), P("M19 10H45L39 25H25Z", "light")]


def g_rocket():
    return [P("M20 32L9 47L21 45Z", "acc"), P("M44 32L55 47L43 45Z", "acc"), P("M32 3C43 11 47 25 44 42H20C17 25 21 11 32 3Z"), P("M24 43H40L32 61Z", "fire")], [
        C(32, 23, 6, "dark"), C(32, 23, 4, "ice"), C(30.5, 21.5, 1.4, "light")]


def g_shuriken():
    return [star(32, 32, 28, 8, 4, rot=-45)], [C(32, 32, 5, "dark"), C(32, 32, 2.2, "soft")]


def g_target():
    return [C(32, 32, 26)], [C(32, 32, 19, "light"), C(32, 32, 13, "main"), C(32, 32, 6, "light"), C(32, 32, 3, "dark")]


def g_ball():
    return [C(32, 32, 25, "silver")], [
        poly([(32, 22), (41.5, 29), (38, 40), (26, 40), (22.5, 29)], "dark"),
        poly([(32, 7.5), (38, 11), (32, 15), (26, 11)], "dark"),
        poly([(53, 25), (56, 32), (51, 36), (48, 29)], "dark"),
        poly([(11, 25), (16, 29), (13, 36), (8, 32)], "dark"),
        poly([(18, 50), (24, 48), (26, 54), (21, 56)], "dark"),
        poly([(46, 50), (43, 56), (38, 54), (40, 48)], "dark")]


def g_wing():
    return [P("M6 44C10 24 28 11 58 8C52 14 48 18 46 22C52 22 56 21 60 19C54 29 46 32 40 33C46 35 50 35 55 34C46 43 36 46 26 44C18 50 11 51 6 44Z")], [
        S("M14 42C24 30 36 22 50 16", 1.6, "soft")]


def g_snow():
    arms = []
    for a in (0, 60, 120):
        arms.append(S(f"M32 6V58", 6))
    det = []
    return [R(29, 5, 6, 54, 3, "main"), R(29, 5, 6, 54, 3, "main", rot=60, cx=32, cy=32), R(29, 5, 6, 54, 3, "main", rot=120, cx=32, cy=32)], [
        C(32, 32, 6, "light"), C(32, 32, 3, "acc")]


def g_moon():
    return [P("M42 6A27 27 0 1 0 58 44A21 21 0 1 1 42 6Z"), star(48, 22, 9, 3.6, 4, rot=-90, role="acc")], [C(26, 38, 3, "soft"), C(20, 26, 2, "soft")]


def g_spiral():
    d = "M32 32"
    pts = []
    for i in range(0, 721, 20):
        a = math.radians(i)
        r = 2 + i / 720 * 24
        pts.append(f"{32 + r * math.cos(a):.1f} {32 + r * math.sin(a):.1f}")
    return [S("M" + " L".join(pts), 7)], []


def g_tornado():
    return [S("M12 12H52", 7), S("M16 22H48", 7), S("M20 32H44", 7), S("M24 42H38", 7), S("M28 52H34", 7)], []


def g_ceiling():
    return [R(8, 5, 48, 8, 3, "acc"), P("M32 17L50 36H39V58H25V36H14Z")], []


def g_phoenix():
    return [P("M32 22C26 11 14 8 4 12C13 16 18 22 21 28C13 28 8 33 6 40C14 37 21 37 25 39L32 61L39 39C43 37 50 37 58 40C56 33 51 28 43 28C46 22 51 16 60 12C50 8 38 11 32 22Z"), C(32, 20, 6)], [
        P("M32 34L28 50L32 46L36 50Z", "acc"), C(33.5, 19, 1.6, "dark")]


def g_eye():
    return [P("M4 32C15 13 49 13 60 32C49 51 15 51 4 32Z", "bone")], [
        C(32, 32, 14, "main"), E(32, 32, 3.2, 12, "dark"), C(37, 26, 2.6, "light")]


def g_shield(inner=None):
    return [P("M32 4L55 12V30C55 45 45 55 32 60C19 55 9 45 9 30V12Z")], (inner or [])


def g_ghost():
    return [P("M14 31C14 15 22 6 32 6C42 6 50 15 50 31V56L44 51L38 56L32 51L26 56L20 51L14 56Z", "silver")], [
        E(25, 29, 4, 6, "dark"), E(39, 29, 4, 6, "dark"), C(26.3, 27, 1.4, "light"), C(40.3, 27, 1.4, "light"), E(32, 41, 4, 3, "dark")]


def g_goat():
    return [S("M24 22C16 6 4 10 8 24", 7, "acc"), S("M40 22C48 6 60 10 56 24", 7, "acc"),
            P("M20 22C20 14 44 14 44 22L41 44C39 54 25 54 23 44Z", "bone"), P("M26 50L32 62L38 50Z", "bone")], [
        E(26, 29, 2.4, 3.2, "dark"), E(38, 29, 2.4, 3.2, "dark"), E(32, 45, 5, 3, "silver")]


def g_trident():
    return [R(29, 26, 6, 35, 2), P("M12 8L18 8L20 24H27L25 6L32 0L39 6L37 24H44L46 8L52 8L49 31H15Z")], []


def g_comet():
    return [P("M38 26L62 6L48 38Z", "acc"), P("M30 22L52 4L42 30Z", "acc"), C(24, 40, 16)], [C(19, 35, 4, "light")]


def g_bubble(txt):
    return [P("M10 9H54Q59 9 59 14V40Q59 45 54 45H30L17 57V45H10Q5 45 5 40V14Q5 9 10 9Z")], [T(32, 36, txt, 22, "light")]


def g_pacifier():
    return [S("M32 40m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", 5, "acc"), E(32, 33, 22, 8), E(32, 20, 7, 10, "soft")], [C(32, 33, 3, "light")]


def g_glove():
    return [P("M16 34V20a4 4 0 0 1 8 0V30V12a4 4 0 0 1 8 0V30V14a4 4 0 0 1 8 0V32V24a4 4 0 0 1 8 0V42C48 53 42 58 33 58C23 58 16 50 16 40Z"), R(18, 52, 28, 10, 3, "acc")], [
        S("M24 30V40", 1.6, "soft"), S("M32 30V40", 1.6, "soft"), S("M40 32V40", 1.6, "soft")]


def g_calc():
    return [R(12, 4, 40, 56, 7)], [R(17, 9, 30, 13, 3, "dark"), T(32, 20, "1+1", 9, "teal", 900),
                                    R(17, 27, 8, 8, 2, "light"), R(28, 27, 8, 8, 2, "light"), R(39, 27, 8, 8, 2, "acc"),
                                    R(17, 38, 8, 8, 2, "light"), R(28, 38, 8, 8, 2, "light"), R(39, 38, 8, 19, 2, "acc"),
                                    R(17, 49, 19, 8, 2, "light")]


def g_uz():
    return [P("M42 6A27 27 0 1 0 58 44A21 21 0 1 1 42 6Z")], [
        star(40, 22, 4.6, 1.9, 5, role="light"), star(49, 17, 4.6, 1.9, 5, role="light"), star(50, 28, 4.6, 1.9, 5, role="light")]


def g_speed():
    return [S("M6 20H34", 6, "acc"), S("M4 32H28", 6, "acc"), S("M8 44H32", 6, "acc"), C(44, 32, 14, "silver")], [
        poly([(44, 26), (49.5, 30), (47.5, 36.5), (40.5, 36.5), (38.5, 30)], "dark")]


def g_dribble():
    return [S("M12 44C12 20 52 20 52 44", 6, "acc"), P("M47 38L57 42L50 50Z", "acc"), C(32, 36, 14, "silver")], [
        poly([(32, 30), (37.5, 34), (35.5, 40.5), (28.5, 40.5), (26.5, 34)], "dark")]


def g_burst():
    pts = []
    radii = [29, 15, 25, 13, 30, 16, 23, 14, 28, 15, 26, 13]
    for i, r in enumerate(radii):
        a = math.radians(-90 + i * 30)
        pts.append((32 + r * math.cos(a), 32 + r * math.sin(a)))
    return [poly(pts)], [star(32, 32, 12, 6, 6, role="light")]


def g_medal(inner="star"):
    return [P("M18 4H28L34 26H24Z", "red"), P("M46 4H36L30 26H40Z", "sky"), C(32, 40, 18)], [
        C(32, 40, 12.5, "acc"), star(32, 40, 8, 3.4, 5, role="light") if inner == "star" else T(32, 46, inner, 16, "light")]


def g_gamepad():
    return [P("M15 20H49C56 20 61 30 61 41C61 52 54 56 47 51L41 45H23L17 51C10 56 3 52 3 41C3 30 8 20 15 20Z")], [
        R(13, 30, 14, 4.5, 2, "light"), R(17.8, 25.2, 4.5, 14, 2, "light"), C(44, 28, 3, "acc"), C(50, 34, 3, "light"), C(38, 34, 3, "light"), C(44, 40, 3, "fire")]


def g_drop():
    return [P("M32 4C41 19 50 30 50 41C50 52 42 60 32 60C22 60 14 52 14 41C14 30 23 19 32 4Z")], [T(32, 51, "1", 22, "light"), E(24, 36, 3, 6, "soft", rot=20)]


def g_pickaxe():
    return [S("M18 52L44 22", 7, "orange"), P("M10 22C20 8 44 4 58 12C46 12 36 16 30 22C38 26 44 34 46 46C36 34 24 28 10 22Z", "steel")], []


def g_sword(x=32):
    return [P("M29 4H35L37 40H27Z", "steel"), R(18, 39, 28, 6, 3, "acc"), R(29, 45, 6, 12, 2, "orange"), C(32, 59, 4, "acc")], [S("M32 8V38", 1.4, "light")]


def g_crosshair():
    return [S("M32 32m-20 0a20 20 0 1 0 40 0a20 20 0 1 0 -40 0", 5), S("M32 4V18", 5), S("M32 46V60", 5), S("M4 32H18", 5), S("M46 32H60", 5)], [C(32, 32, 4, "acc")]


def g_bricks():
    rows = []
    for r, y in enumerate((8, 22, 36, 50)):
        off = 0 if r % 2 == 0 else -9
        for x in range(4 + off, 58, 18):
            w = 16
            x0 = max(4, x)
            w = min(x + 16, 60) - x0
            if w > 4:
                rows.append(R(x0, y, w, 12, 2))
    return rows, []


def g_scales():
    return [R(29, 10, 6, 44, 3, "acc"), R(16, 54, 32, 6, 3, "acc"), S("M8 18H56", 5, "acc"), P("M4 34Q14 46 24 34Z"), P("M40 34Q50 46 60 34Z"),
            S("M14 18L6 34", 2, "acc"), S("M14 18L22 34", 2, "acc"), S("M50 18L42 34", 2, "acc"), S("M50 18L58 34", 2, "acc")], [C(32, 10, 4, "light")]


def g_card():
    return [R(12, 4, 40, 56, 6)], [R(16, 8, 32, 48, 4, "dark"), star(32, 30, 13, 5.5, 5, role="acc"), T(32, 52, "IF", 9, "light")]


def g_chart():
    return [R(8, 40, 10, 18, 2), R(22, 30, 10, 28, 2), R(36, 20, 10, 38, 2), P("M8 26L24 14L34 20L50 6L44 6M50 6V13", "acc"), S("M8 26L24 14L34 20L50 6", 4, "acc"), P("M42 3H53V14Z", "acc")], []


def g_shield_bolt():
    return [P("M32 4L55 12V30C55 45 45 55 32 60C19 55 9 45 9 30V12Z")], [P("M35 13L22 34H31L27 51L42 28H33Z", "acc")]


def xf(parts, t):
    out = []
    for kind, attrs, role, extra in parts:
        if ' transform="' in attrs:
            attrs = attrs.replace(' transform="', f' transform="{t} ', 1)
        else:
            attrs += f' transform="{t}"'
        out.append((kind, attrs, role, extra))
    return out


def g_crossed_swords(crown=True):
    blade = [P("M30 6H34L36 40H28Z", "steel"), R(19, 39, 26, 6, 3, "acc"), R(29.5, 45, 5, 10, 2, "orange"), C(32, 57, 3.6, "acc")]
    shine = [S("M32 9V37", 1.3, "light")]
    parts = xf(blade, "rotate(-38 32 34)") + xf(blade, "rotate(38 32 34)")
    det = xf(shine, "rotate(-38 32 34)") + xf(shine, "rotate(38 32 34)")
    if crown:
        parts.append(P("M21 6L26 11L32 3L38 11L43 6L41 17H23Z", "gold"))
    return parts, det


def g_swords_crown_old():
    return [P("M10 54L14 58L46 22L48 10L36 12L4 48Z".replace("M10 54L14 58", "M6 54L10 58"), "steel"), P("M54 58L58 54L24 16L12 10L14 22Z".replace("M54 58L58 54", "M54 58L58 54"), "steel"),
            P("M20 22L26 28M44 22", "steel"), P("M20 4L26 10L32 2L38 10L44 4L42 16H22Z", "acc")], []


def g_stadium():
    return [P("M4 30C4 20 60 20 60 30V50C60 58 4 58 4 50Z"), R(26, 6, 3, 18, 1, "acc"), P("M29 6H42L38 10L42 14H29Z", "red")], [E(32, 32, 22, 5, "green"), S("M32 28V36", 1.4, "light")]


def g_robot_ball():
    return [gear(32, 32, 28, 22, 10, "steel")], [C(32, 32, 14, "silver"), poly([(32, 26), (37.5, 30), (35.5, 36.5), (28.5, 36.5), (26.5, 30)], "dark")]


def g_castle():
    return [P("M6 58V22H14V28H20V22H28V28H36V22H44V28H50V22H58V58H38V44Q32 36 26 44V58Z")], [R(10, 32, 6, 8, 2, "dark"), R(48, 32, 6, 8, 2, "dark"), P("M30 6H40L36 10L40 14H30Z", "acc"), R(29, 6, 2, 16, 1, "acc")]


def g_whistle():
    return [C(26, 38, 18), R(26, 18, 34, 14, 4), S("M12 18C8 12 12 6 18 8", 3, "acc")], [C(26, 38, 7, "dark"), R(48, 21, 8, 8, 2, "dark")]


def g_team_shield():
    return [P("M32 4L55 12V30C55 45 45 55 32 60C19 55 9 45 9 30V12Z")], [
        star(20, 28, 7, 3, 5, role="light"), star(32, 22, 8, 3.4, 5, role="acc"), star(44, 28, 7, 3, 5, role="light"), S("M20 42Q32 52 44 42", 3, "light")]


def g_flag():
    return [R(10, 4, 6, 56, 3, "steel"), P("M16 8H56L46 20L56 32H16Z")], [S("M22 14H40", 2, "soft")]


def g_rosette():
    petals = [E(round(32 + 17 * math.cos(math.radians(a)), 1), round(30 + 17 * math.sin(math.radians(a)), 1), 7, 10, "main", rot=a + 90) for a in range(0, 360, 45)]
    return [P("M22 40L16 62L26 56L32 62L30 44Z", "red"), P("M42 40L48 62L38 56L32 62L34 44Z", "sky")] + petals + [C(32, 30, 13, "acc")], [T(32, 36, "8", 16, "light")]


def g_bag():
    return [P("M22 14L18 6H46L42 14Z", "acc"), P("M22 14C8 26 6 58 32 58C58 58 56 26 42 14Z"), R(20, 12, 24, 6, 3, "acc")], [T(32, 48, "$", 22, "light")]


def g_chest():
    return [P("M6 26C6 14 58 14 58 26V30H6Z"), R(6, 28, 52, 28, 4), R(28, 22, 8, 14, 2, "acc")], [S("M6 30H58", 2, "dark"), R(10, 30, 4, 26, 1, "acc"), R(50, 30, 4, 26, 1, "acc"), C(32, 31, 2, "dark")]


def g_trophy():
    return [S("M16 16C4 16 6 34 22 34", 5, "acc"), S("M48 16C60 16 58 34 42 34", 5, "acc"), P("M14 8H50V22C50 34 42 42 32 42C22 42 14 34 14 22Z"), R(28, 40, 8, 10, 2), R(18, 48, 28, 10, 3, "acc")], [
        star(32, 22, 8, 3.4, 5, role="light")]


def g_turbo():
    return [P("M6 44A26 26 0 0 1 58 44Z", "steel"), S("M32 44L48 24", 5, "fire")], [
        S("M12 44A20 20 0 0 1 22 27", 3, "green"), S("M24 25A20 20 0 0 1 40 25", 3, "gold"), S("M42 27A20 20 0 0 1 52 44", 3, "red"), C(32, 44, 5, "dark")]


def g_void():
    return [E(32, 32, 29, 11, "main", rot=-20), C(32, 32, 14, "dark")], [
        S("M6 40Q32 22 58 24", 2.6, "light"), C(32, 32, 9.5, "#000"), C(27, 28, 1.8, "soft")]


def g_nova():
    return [star(32, 32, 30, 7, 8, rot=-90), star(32, 32, 20, 9, 8, rot=-67.5, role="acc")], [C(32, 32, 7, "light")]


def g_katana():
    return [P("M54 4L60 10L22 48L16 42Z", "steel"), R(10, 40, 18, 6, 3, "acc", rot=45, cx=19, cy=43), P("M14 46L18 50L8 60L4 56Z", "red")], [S("M56 8L20 44", 1.2, "light")]


def g_sakura():
    petals = [E(round(32 + 13 * math.cos(math.radians(a)), 1), round(32 + 13 * math.sin(math.radians(a)), 1), 10, 14, "main", rot=a + 90) for a in range(-90, 270, 72)]
    return petals, [C(32, 32, 7, "acc")] + [C(round(32 + 5 * math.cos(math.radians(a)), 1), round(32 + 5 * math.sin(math.radians(a)), 1), 1.6, "light") for a in range(-90, 270, 72)]


def g_viking():
    return [S("M14 30C4 24 4 10 10 6", 7, "bone"), S("M50 30C60 24 60 10 54 6", 7, "bone"), P("M12 38C12 18 52 18 52 38Z", "steel"), R(10, 36, 44, 9, 3, "acc"), R(29, 44, 6, 16, 2, "steel")], [
        C(20, 40.5, 2, "dark"), C(32, 40.5, 2, "dark"), C(44, 40.5, 2, "dark"), S("M32 20V34", 2, "light")]


def g_skull():
    return [P("M12 30C12 14 22 6 32 6C42 6 52 14 52 30C52 38 48 42 46 44V52H18V44C16 42 12 38 12 30Z", "bone")], [
        E(23, 31, 6, 7, "dark"), E(41, 31, 6, 7, "dark"), P("M32 38L28 45H36Z", "dark"), R(24, 48, 2.5, 6, 1, "dark"), R(30.7, 48, 2.5, 6, 1, "dark"), R(37.5, 48, 2.5, 6, 1, "dark"), C(23, 31, 2.2, "main"), C(41, 31, 2.2, "main")]


def g_heart():
    return [P("M32 56C12 42 4 32 4 21C4 12 11 6 19 6C25 6 29 9 32 14C35 9 39 6 45 6C53 6 60 12 60 21C60 32 52 42 32 56Z")], [P("M14 16C16 12 20 11 23 12C19 13 16 15 15 19Z", "light")]


def g_clover():
    leaves = [C(round(32 + 11 * math.cos(math.radians(a)), 1), round(28 + 11 * math.sin(math.radians(a)), 1), 11) for a in (-135, -45, 45, 135)]
    return [S("M32 34C34 46 38 52 44 60", 5, "acc")] + leaves, [C(32, 28, 4, "soft")]


def g_alien():
    return [P("M32 4C48 4 58 16 56 30C54 44 42 58 32 58C22 58 10 44 8 30C6 16 16 4 32 4Z")], [
        E(21, 32, 9, 5.5, "dark", rot=30), E(43, 32, 9, 5.5, "dark", rot=-30), C(19, 30, 2, "light"), C(41, 30, 2, "light"), S("M28 48Q32 50 36 48", 2, "dark")]


def g_brain_chip():
    pins = []
    for i in range(4):
        y = 16 + i * 10
        pins += [R(2, y, 10, 4, 2, "acc"), R(52, y, 10, 4, 2, "acc"), R(y, 2, 4, 10, 2, "acc"), R(y, 52, 4, 10, 2, "acc")]
    return pins + [R(10, 10, 44, 44, 8)], [R(18, 18, 28, 28, 4, "dark"), T(32, 39, "AI", 15, "light")]


def g_lightning_eye():
    return g_eye()


def g_double_star():
    return [star(24, 36, 20, 8.5, 5), star(44, 22, 15, 6.5, 5, role="acc")], [C(20, 32, 2.4, "light")]


def g_laurel_star():
    return laurel(32, 34, 22, "acc") + [star(32, 30, 17, 7, 5)], []


# ---- Season Pass / quests -------------------------------------------------------
def g_ignition():
    ring = S("M32 32m-24 0a24 24 0 1 0 48 0a24 24 0 1 0 -48 0", 5, "acc")
    return [ring, P("M32 10C38 19 45 24 43 35C42 44 37 50 32 50C26 50 21 45 21 37C21 30 26 27 27 21C30 26 31 27 32 28C31 22 31 16 32 10Z")], [
        P("M32 32C35 36 38 39 37 43C36 47 34 48 32 48C29 48 27 46 27 43C27 40 30 37 32 32Z", "gold")]


def g_battery(bolt=True):
    parts = [R(8, 16, 44, 32, 6), R(52, 26, 6, 12, 2, "acc")]
    det = [R(13, 21, 34, 22, 3, "dark"), R(15, 23, 8, 18, 2, "green"), R(25, 23, 8, 18, 2, "green"), R(35, 23, 8, 18, 2, "green")]
    if bolt:
        det.append(P("M33 12L22 34H30L26 52L42 28H34Z", "gold"))
    return parts, det


def g_afterburner():
    return [P("M4 26L22 20V44L4 38Z", "fire"), P("M20 18H44L58 28V36L44 46H20Z", "steel"), R(26, 14, 10, 6, 2, "acc"), R(26, 44, 10, 6, 2, "acc")], [
        P("M2 28L14 32L2 36Z", "gold"), R(30, 26, 18, 12, 3, "dark"), R(32, 28, 14, 3, 1.5, "ice")]


def g_apex():
    return [P("M4 56L24 20L32 32L40 14L60 56Z"), star(40, 10, 8, 3.2, 5, role="acc")], [P("M40 14L34 26L40 23L46 30Z", "light"), P("M24 20L19 29L24 27L28 31Z", "light")]


def g_s1():
    return [P("M32 4L56 14V32C56 46 46 56 32 60C18 56 8 46 8 32V14Z")], [T(32, 42, "S1", 22, "light"), star(32, 12, 4, 1.6, 5, role="gold")]


def g_supercharged():
    return [C(32, 32, 26, "void"), P("M36 6L16 36H29L24 58L48 26H35Z")], [S("M32 32m-20 0a20 20 0 1 0 40 0", 2, "soft")]


def g_gradcap():
    return [P("M4 24L32 12L60 24L32 36Z"), P("M16 30V44C16 50 48 50 48 44V30L32 37Z", "acc"), S("M56 26V42", 3, "gold")], [C(56, 44, 3.5, "gold"), star(32, 24, 5, 2, 5, role="light")]


def g_whistle():
    return [P("M10 26H38C48 26 56 33 56 42C56 51 48 58 38 58C29 58 22 52 21 44H10C7 44 6 42 6 40V30C6 28 7 26 10 26Z"), R(30, 16, 8, 12, 2, "acc")], [C(38, 42, 7, "dark"), C(36, 40, 2.4, "light"), S("M44 8L40 16M54 14L46 20M30 6L32 14", 3, "acc")]


def g_var():
    return [R(6, 10, 52, 36, 6, "steel"), R(11, 15, 42, 26, 3, "dark"), R(26, 46, 12, 8, 1, "steel"), R(18, 54, 28, 5, 2.5, "steel")], [T(32, 34, "VAR", 13, "acc"), C(50, 19, 2.6, "red")]


def g_crystal():
    return [P("M32 4L44 18L40 44L32 60L24 44L20 18Z"), P("M20 18L8 26L14 40L24 44Z", "acc"), P("M44 18L56 26L50 40L40 44Z", "acc")], [P("M32 4L36 18L32 46L28 18Z", "light"), S("M32 46V58", 2, "soft"), C(14, 12, 2, "light"), C(52, 50, 2, "light")]


def g_firework():
    rays = []
    for i in range(12):
        import math
        a = math.radians(i * 30)
        x1, y1 = 32 + 9 * math.cos(a), 28 + 9 * math.sin(a)
        x2, y2 = 32 + 24 * math.cos(a), 28 + 24 * math.sin(a)
        rays.append(S(f"M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}", 4 if i % 2 == 0 else 3, "main" if i % 2 == 0 else "acc"))
    return rays + [C(32, 28, 7)], [C(32, 28, 3, "light"), S("M32 40V60", 3, "soft"), C(12, 52, 2.5, "acc"), C(52, 54, 2, "light")]


def g_lovetap():
    return [P("M32 58C12 44 4 34 4 23C4 14 11 8 19 8C25 8 29 11 32 16C35 11 39 8 45 8C53 8 60 14 60 23C60 34 52 44 32 58Z"), C(46, 44, 12, "acc")], [P("M14 18C16 14 20 13 23 14C19 15 16 17 15 21Z", "light"), P("M48 35L40 46H46L43 54L53 41H47Z", "light")]


def u_event():
    return [R(6, 12, 52, 46, 7, "steel"), R(6, 12, 52, 13, 7, "acc")], [R(15, 5, 6, 13, 3, "silver"), R(43, 5, 6, 13, 3, "silver"), star(32, 42, 13, 5.5, 5)]


def g_compass():
    return [C(32, 32, 26, "gold"), C(32, 32, 20, "void")], [P("M32 12L38 32L32 52L26 32Z", "light"), P("M32 12L38 32H26Z", "red"), C(32, 32, 3.5, "gold"), S("M32 6V10M32 54V58M6 32H10M54 32H58", 2.4, "soft")]


def g_road():
    return [P("M22 60L28 6H36L42 60Z", "steel")], [S("M32 52V46M32 38V32M32 24V18M32 12V9", 2.5, "gold"), star(32, 8, 6, 2.5, 5, role="gold")]


def g_ticket():
    return [P("M6 16H58V27A5 5 0 0 0 58 37V48H6V37A5 5 0 0 0 6 27Z")], [S("M42 18V46", 2, "soft"), star(24, 32, 9, 3.8, 5, role="light"), R(46, 24, 8, 4, 2, "light"), R(46, 36, 8, 4, 2, "light")]


def g_coins():
    return [E(30, 46, 20, 7, "gold"), R(10, 38, 40, 8, 0, "gold"), E(30, 38, 20, 7, "gold"), R(14, 24, 40, 8, 0, "gold"), E(34, 24, 20, 7, "gold"), E(34, 16, 20, 7, "gold"), R(14, 16, 40, 8, 0, "gold")], [
        E(34, 16, 14, 4.5, "soft"), T(34, 20, "C", 8, "orange")]


def g_crate_icon():
    return [R(8, 22, 48, 34, 5), R(4, 14, 56, 14, 4, "acc")], [R(28, 14, 8, 42, 1, "gold"), S("M12 36H52", 1.6, "soft")]


def g_gift():
    return [R(8, 26, 48, 30, 4), R(5, 18, 54, 12, 3, "acc"), S("M32 18C24 4 12 10 22 18", 4, "gold"), S("M32 18C40 4 52 10 42 18", 4, "gold")], [R(28, 18, 8, 38, 1, "gold")]


def g_flame_cal():
    return [R(8, 12, 48, 46, 6, "steel"), R(8, 12, 48, 12, 6, "red")], [R(16, 6, 5, 12, 2, "silver"), R(43, 6, 5, 12, 2, "silver"),
        P("M32 28C36 34 42 37 41 45C40 51 36 54 32 54C27 54 23 51 23 45C23 40 27 38 28 33C30 36 31 37 32 37C31 34 31 31 32 28Z", "fire")]


def g_lock():
    return [S("M20 28V20C20 8 44 8 44 20V28", 6, "steel"), R(12, 26, 40, 32, 6)], [C(32, 40, 4, "dark"), R(30.5, 40, 3, 9, 1.5, "dark")]


def g_check():
    return [C(32, 32, 26)], [S("M20 33L28 41L45 23", 6, "light")]


def g_match_flags():
    return [R(8, 8, 5, 50, 2.5, "steel"), P("M13 10H40L34 19L40 28H13Z"), R(51, 8, 5, 50, 2.5, "steel"), P("M51 22H24L30 31L24 40H51Z", "acc")], []


# UI glyphs (duotone, sky palette) ----------------------------------------------
def u_user():
    return [C(32, 22, 13), P("M8 58C8 44 18 36 32 36C46 36 56 44 56 58Z")], []


def u_door():
    return [R(10, 6, 30, 52, 4, "steel"), P("M36 32H58M50 24L58 32L50 40", "acc"), S("M34 32H56", 6, "acc"), S("M48 22L58 32L48 42", 6, "acc")], [C(32, 33, 2.6, "dark")]


def u_users():
    return [C(22, 22, 10, "acc"), P("M4 54C4 42 12 36 22 36C32 36 40 42 40 54Z", "acc"), C(42, 20, 11), P("M22 58C22 44 31 38 42 38C53 38 62 44 62 58Z")], []


def u_columns():
    return [P("M4 18L32 4L60 18Z"), R(10, 22, 8, 28, 2), R(28, 22, 8, 28, 2), R(46, 22, 8, 28, 2), R(4, 52, 56, 8, 2)], []


def u_scroll():
    return [R(12, 8, 40, 48, 4, "bone"), C(12, 14, 6, "orange"), C(52, 50, 6, "orange")], [S("M20 20H44", 2.6, "steel"), S("M20 28H44", 2.6, "steel"), S("M20 36H38", 2.6, "steel"), S("M20 44H40", 2.6, "steel")]


def u_key():
    return [C(20, 24, 14), S("M30 34L56 58", 7), S("M46 48L52 42", 6), S("M52 54L58 48", 6)], [C(20, 24, 5, "dark")]


def u_spark():
    return [star(28, 34, 22, 6, 4), star(48, 14, 10, 3, 4, role="acc")], []


def u_gear():
    return [gear(32, 32, 28, 21, 8)], [C(32, 32, 9, "dark"), C(32, 32, 4, "soft")]


def u_bag():
    return [S("M22 22V16C22 4 42 4 42 16V22", 4.5, "acc"), P("M8 20H56L52 58H12Z")], [C(22, 28, 3, "dark"), C(42, 28, 3, "dark")]


def u_id():
    return [R(4, 10, 56, 44, 7)], [R(10, 18, 16, 20, 3, "dark"), C(18, 25, 4, "soft"), P("M12 36C12 30 24 30 24 36Z", "soft"), S("M32 22H52", 3, "light"), S("M32 30H48", 3, "light"), S("M32 38H52", 3, "light"), S("M10 46H52", 3, "soft")]


def u_trophy():
    return g_trophy()


def u_replay():
    return [S("M48 22A20 20 0 1 0 52 36", 6), P("M40 12L56 16L50 30Z")], []


def u_live():
    return [C(32, 32, 8, "red"), S("M20 20A17 17 0 0 0 20 44", 5), S("M44 20A17 17 0 0 1 44 44", 5), S("M12 12A28 28 0 0 0 12 52", 5), S("M52 12A28 28 0 0 1 52 52", 5)], [C(30, 30, 2.5, "light")]


def u_orb():
    return [P("M14 58L20 46H44L50 58Z", "gold"), C(32, 28, 22, "purple")], [E(25, 20, 7, 4, "light", rot=-30), star(38, 32, 6, 2.4, 4, role="soft"), C(26, 36, 1.8, "soft")]


def u_bell():
    return [P("M32 6C44 6 50 16 50 28V40L56 48H8L14 40V28C14 16 20 6 32 6Z"), C(32, 53, 6, "acc")], []


def u_install():
    return [R(16, 4, 32, 56, 7), R(20, 11, 24, 38, 3, "dark"), C(32, 54, 2.5, "light")], [S("M32 17V36", 5, "acc"), P("M23 31L32 42L41 31Z", "acc")]


def u_clock():
    return [C(32, 32, 26), C(32, 32, 20, "dark")], [S("M32 18V32L42 38", 5, "acc"), C(32, 32, 3, "light")]


def u_plane():
    return [C(32, 32, 27)], [P("M14 31L48 17L42 48L31 40L25 46L24 37L42 23L21 34Z", "light"), P("M24 37L25 46L31 40Z", "acc")]


def u_home():
    return [P("M8 30L32 8L56 30V54C56 56 54 58 52 58H40V42H24V58H12C10 58 8 56 8 54Z"), P("M4 31L32 5L60 31", "acc")], [R(27, 44, 10, 14, 2, "dark"), C(32, 24, 4, "light")]


def u_play():
    return [P("M14 22H50C57 22 62 28 61 36L59 48C58 54 52 56 48 52L42 46H22L16 52C12 56 6 54 5 48L3 36C2 28 7 22 14 22Z")], [S("M18 31V41M13 36H23", 4, "light"), C(44, 32, 3.4, "acc"), C(50, 38, 3.4, "acc"), R(28, 14, 8, 8, 2, "acc")]


def u_more():
    return [R(8, 8, 20, 20, 6), R(36, 8, 20, 20, 6), R(8, 36, 20, 20, 6)], [R(36, 36, 20, 20, 6, "acc"), C(46, 46, 3, "light")]


def u_push():
    return [R(14, 4, 36, 56, 8), R(18, 11, 28, 38, 3, "dark")], [P("M32 16C38 16 41 21 41 26V32L44 36H20L23 32V26C23 21 26 16 32 16Z", "acc"), C(32, 40, 3, "acc"), C(44, 14, 6, "red")]


# ---------------------------------------------------------------- the catalogue
TAGS = {
    "noob": ("pink", g_pacifier, "sky", 0),
    "gg": ("sky", lambda: g_bubble("GG"), None, 0),
    "chaser": ("silver", lambda: ([C(32, 32, 25, "silver")], g_ball()[1]), None, 0),
    "niceshot": ("red", g_target, None, 0),
    "save": ("orange", g_glove, "steel", 0),
    "calc": ("teal", g_calc, "gold", 0),
    "fire": ("fire", g_flame, "gold", 0),
    "uz": ("uz", g_uz, None, 0),
    "bolt": ("gold", g_bolt, None, 1),
    "aerial": ("sky", g_wing, None, 1),
    "ice": ("ice", g_snow, "sky", 1),
    "speedflip": ("sky", g_speed, "ice", 1),
    "dribble": ("green", g_dribble, "lime", 1),
    "demo": ("orange", g_burst, None, 1),
    "night": ("void", g_moon, "gold", 1),
    "ninja": ("steel", g_shuriken, None, 1),
    "rocket": ("silver", g_rocket, "red", 2),
    "flip": ("purple", g_spiral, None, 2),
    "musty": ("teal", g_tornado, None, 2),
    "ceiling": ("orange", g_ceiling, "steel", 2),
    "diamond": ("ice", g_diamond, None, 2),
    "phoenix": ("fire", g_phoenix, "gold", 2),
    "dragon": ("lime", g_eye, None, 2),
    "gc": ("purple", lambda: g_shield([S("M20 24L32 32L44 24", 4, "light"), S("M20 34L32 42L44 34", 4, "light"), S("M20 44L32 52L44 44", 4, "acc")]), "gold", 2),
    "turbo": ("steel", g_turbo, None, 2),
    "void": ("void", g_void, None, 2),
    "katana": ("steel", g_katana, "gold", 2),
    "sakura": ("rose", g_sakura, "gold", 2),
    "viking": ("steel", g_viking, "gold", 2),
    "nova": ("gold", g_nova, "fire", 3),
    "skull": ("bone", g_skull, "red", 3),
    "crown": ("gold", g_crown, "red", 3),
    "ghost": ("silver", g_ghost, None, 3),
    "goat": ("bone", g_goat, "gold", 3),
    "godlike": ("gold", g_trident, None, 3),
    "ssl": ("sky", g_comet, "gold", 3),
    "heart": ("pink", g_heart, None, 2),
    "clover": ("green", g_clover, "lime", 1),
    "alien": ("lime", g_alien, None, 2),
    "ai": ("teal", g_brain_chip, "gold", 3),
    # Season Pass exclusives
    "ignition": ("fire", g_ignition, "sky", 1),
    "overcharged": ("steel", g_battery, None, 2),
    "afterburner": ("sky", g_afterburner, "gold", 2),
    "apex": ("purple", g_apex, "gold", 3),
    "s1": ("sky", g_s1, "gold", 3),
    "supercharged": ("gold", g_supercharged, None, 3),
    "rookieclass": ("sky", g_gradcap, "steel", 1),
    "pathfinder": ("gold", g_compass, "gold", 2),
    "whistle": ("silver", g_whistle, "gold", 2),
    "frostbite": ("ice", g_crystal, "sky", 2),
    "newyear": ("gold", g_firework, "red", 2),
    "lovetap": ("pink", g_lovetap, "gold", 2),
    "var": ("steel", g_var, "gold", 3),
}

QUESTS = {
    "gift": ("pink", g_gift, "gold"), "duel": ("steel", lambda: g_crossed_swords(False), "gold"), "win": ("gold", g_trophy, "gold"),
    "goal": ("silver", lambda: ([C(32, 32, 25, "silver")], g_ball()[1]), None), "match": ("sky", g_match_flags, "red"),
    "ref": ("silver", g_whistle, "red"), "shield": ("orange", g_bricks, None),
}

TITLES = {
    "rookie": ("sky", g_gamepad, "gold", 0),
    "firstwin": ("red", g_drop, None, 0),
    "grinder": ("steel", g_pickaxe, None, 0),
    "duelist": ("steel", g_sword, "gold", 0),
    "sniper": ("red", g_crosshair, "gold", 1),
    "wall": ("orange", g_bricks, None, 1),
    "judge": ("gold", g_scales, "steel", 1),
    "inform": ("gold", g_card, "fire", 1),
    "winner": ("gold", g_medal, "orange", 1),
    "rising": ("sky", g_chart, "green", 1),
    "star": ("gold", lambda: ([star(32, 33, 28, 12, 5)], [star(32, 33, 14, 6, 5, role="light")]), None, 2),
    "unstoppable": ("fire", g_comet, "gold", 2),
    "duelking": ("steel", g_crossed_swords, "gold", 2),
    "veteran": ("green", g_stadium, "gold", 2),
    "machine": ("steel", g_robot_ball, None, 2),
    "fortress": ("steel", g_castle, "red", 2),
    "headref": ("silver", g_whistle, "red", 2),
    "regular": ("sky", g_team_shield, "gold", 2),
    "conqueror": ("red", g_flag, None, 2),
    "hunter": ("gold", g_rosette, "purple", 2),
    "spender": ("green", g_bag, "gold", 2),
    "collector": ("orange", g_chest, "gold", 2),
    "legend": ("gold", g_laurel_star, "green", 3),
    "superstar": ("pink", g_double_star, "gold", 3),
    "invincible": ("sky", g_shield_bolt, "gold", 3),
    "champion": ("gold", g_trophy, "gold", 3),
    "dynasty": ("purple", g_crown, "gold", 3),
}

# Achievements (profile badges) reuse the same art language.
ACH = {
    "first_win": ("red", g_target, None, 0), "streak3": ("fire", g_flame, "gold", 1), "streak5": ("fire", g_comet, "gold", 2),
    "clean_sheet": ("orange", g_bricks, None, 1), "rout": ("orange", g_burst, None, 1), "clutch": ("ice", g_snow, "sky", 1),
    "goals25": ("silver", lambda: ([C(32, 32, 25, "silver")], g_ball()[1]), None, 1), "goals100": ("silver", g_rocket, "red", 2),
    "matches10": ("sky", g_gamepad, "gold", 0), "matches30": ("green", g_stadium, "gold", 2), "referee": ("gold", g_scales, "steel", 1),
    "potr": ("gold", lambda: ([star(32, 33, 28, 12, 5)], [star(32, 33, 14, 6, 5, role="light")]), None, 2),
    "elite": ("ice", g_diamond, None, 2), "champion": ("gold", g_trophy, "gold", 3),
}

UI = {
    "user": ("sky", u_user), "card": ("sky", u_id), "duels": ("steel", lambda: g_crossed_swords(False)), "shop": ("sky", u_bag), "referee": ("gold", g_scales),
    "admin": ("steel", u_gear), "logout": ("steel", u_door), "competitions": ("gold", u_trophy), "players": ("sky", u_users), "stats": ("sky", g_chart),
    "hall": ("gold", u_columns), "rules": ("bone", u_scroll), "login": ("gold", u_key), "signup": ("purple", u_spark), "bell": ("gold", u_bell), "pass": ("sky", g_ticket), "replay": ("sky", u_replay), "live": ("sky", u_live), "bets": ("purple", u_orb), "clubs": ("sky", g_team_shield), "story": ("gold", g_road), "fx": ("gold", lambda: g_burst()),
    "install": ("sky", u_install), "clock": ("sky", u_clock), "push": ("steel", u_push), "telegram": ("sky", u_plane), "event": ("gold", u_event), "home": ("sky", u_home), "play": ("gold", u_play), "more": ("steel", u_more),
}

for key, (pal, fn, acc, tier) in TAGS.items():
    parts, det = fn()
    icon(f"t-{key}", pal, parts, acc, sparkles=tier + (1 if tier == 3 else 0), detail=det)
for key, (pal, fn, acc, tier) in TITLES.items():
    parts, det = fn()
    icon(f"ti-{key}", pal, parts, acc, sparkles=tier + (1 if tier == 3 else 0), detail=det)
for key, (pal, fn, acc, tier) in ACH.items():
    parts, det = fn()
    icon(f"a-{key}", pal, parts, acc, sparkles=tier, detail=det)
for key, (pal, fn, acc) in QUESTS.items():
    parts, det = fn()
    icon(f"q-{key}", pal, parts, acc, aura=False, detail=det)
for key, (pal, fn, acc, sp) in {
    "coins": ("gold", g_coins, "gold", 1), "crate-rookie": ("sky", g_crate_icon, "sky", 0), "crate-elite": ("purple", g_crate_icon, "purple", 1),
    "crate-mythic": ("gold", g_crate_icon, "orange", 2), "pass": ("sky", g_ticket, "gold", 1), "streak": ("steel", g_flame_cal, "red", 0),
    "lock": ("steel", g_lock, "gold", 0), "check": ("green", g_check, None, 0),
}.items():
    parts, det = fn()
    icon(f"r-{key}", pal, parts, acc, aura=False, sparkles=sp, detail=det)
for key, (pal, fn) in UI.items():
    parts, det = fn()
    acc = {"steel": "gold", "bone": "orange"}.get(pal, "gold")
    icon(f"ui-{key}", pal, parts, acc, aura=False, detail=det)

# ---- Rank emblems ------------------------------------------------------------------
WING_L = "M20 26C12 24 6 18 2 10C6 12 10 13 13 13C10 10 8 7 7 3C12 7 17 11 21 14Z"


def wings(role="acc"):
    return [P(WING_L, role), P(WING_L, role)[:1] + (P(WING_L, role)[1] + ' transform="translate(64 0) scale(-1 1)"',) + P(WING_L, role)[2:]]


def shield_rank(n):
    det = []
    for i in range(n):
        y = 22 + i * 9 if n > 1 else 28
        det.append(S(f"M21 {y}L32 {y + 7}L43 {y}", 4.5, "light"))
    return [P("M32 6L54 13V31C54 45 44 54 32 59C20 54 10 45 10 31V13Z")], det


def rk_platinum():
    hexa = [(32 + 26 * math.cos(math.radians(a)), 32 + 26 * math.sin(math.radians(a))) for a in range(-90, 270, 60)]
    return [poly(hexa)], [poly([(32 + 17 * math.cos(math.radians(a)), 32 + 17 * math.sin(math.radians(a))) for a in range(-90, 270, 60)], "dark"), star(32, 33, 12, 5, 5, role="light")]


def rk_diamond():
    parts, det = g_diamond()
    return wings("ice") + [P("M20 14H44L54 26L32 54L10 26Z")], [S("M10 26H54", 1.6, "soft"), S("M20 14L26 26L32 54L38 26L44 14", 1.6, "soft"), P("M20 14H44L38 26H26Z", "light")]


def rk_champion():
    return wings("acc") + [P("M32 6L50 13V30C50 43 42 52 32 57C22 52 14 43 14 30V13Z")], [star(32, 30, 11, 4.6, 5, role="light"), S("M22 44L32 50L42 44", 3.5, "light")]


def rk_gc():
    return wings("gold") + [P("M32 10L50 17V32C50 45 42 53 32 58C22 53 14 45 14 32V17Z"), P("M20 8L26 13L32 4L38 13L44 8L42 17H22Z", "gold")], [
        star(32, 34, 10, 4.2, 5, role="light"), S("M23 46L32 51L41 46", 3, "light")]


def rk_ssl():
    return wings("ice") + [E(32, 34, 27, 9, "sky", rot=-18), star(32, 32, 22, 9, 5)], [star(32, 32, 10, 4.2, 5, role="light"), S("M7 40Q32 26 57 28", 2, "light")]


RANK_ICONS = {
    "bronze": ("orange", lambda: shield_rank(1), None, 0),
    "silver": ("silver", lambda: shield_rank(2), None, 0),
    "gold": ("gold", lambda: shield_rank(3), None, 1),
    "plat": ("teal", rk_platinum, None, 1),
    "diamond": ("ice", rk_diamond, "ice", 2),
    "champ": ("purple", rk_champion, "purple", 2),
    "gc": ("red", rk_gc, "gold", 3),
    "ssl": ("silver", rk_ssl, "sky", 4),
    "unranked": ("steel", lambda: ([P("M32 6L54 13V31C54 45 44 54 32 59C20 54 10 45 10 31V13Z")], [T(32, 40, "?", 22, "light")]), None, 0),
}
for key, (pal, fn, acc, sp) in RANK_ICONS.items():
    parts, det = fn()
    icon(f"rk-{key}", pal, parts, acc, sparkles=sp, detail=det)


# ---- Avatars: a round portrait plate with the glyph inside ------------------------
def avatar(name, plate, glyph_fn, pal, acc=None):
    """Circular plate (radial light from the top) with the glyph scaled into it."""
    acc = acc or pal
    grad(pal)
    grad(acc)
    l, m, d = PAL[plate]
    pid = f"pl-{name}"
    defs.append((pid, f'<radialGradient id="{pid}" cx=".5" cy=".28" r=".8"><stop offset="0" stop-color="{m}"/><stop offset=".55" stop-color="{d}"/><stop offset="1" stop-color="#050b18"/></radialGradient>'))
    parts, det = glyph_fn()
    body = [f'<circle cx="32" cy="32" r="32" fill="url(#{pid})"/>',
            '<ellipse cx="32" cy="14" rx="20" ry="9" fill="#fff" opacity=".10"/>',
            '<g transform="translate(32 34) scale(.66) translate(-32 -32)">']
    body += [render_part(p, pal, acc, True) for p in parts]
    body += [render_part(p, pal, acc, False) for p in parts]
    body += [render_part(p, pal, acc, False) for p in det]
    body.append("</g>")
    symbols.append(f'<symbol id="av-{name}" viewBox="0 0 64 64">{"".join(body)}</symbol>')
    names.append(f"av-{name}")


AVATARS = {
    "ball": ("sky", lambda: ([C(32, 32, 25, "silver")], g_ball()[1]), "silver", None),
    "blaze": ("red", g_flame, "fire", "gold"),
    "liftoff": ("sky", g_rocket, "silver", "red"),
    "volt": ("purple", g_bolt, "gold", None),
    "shadow": ("void", g_shuriken, "steel", None),
    "phantom": ("void", g_ghost, "silver", None),
    "visitor": ("green", g_alien, "lime", None),
    "berserker": ("orange", g_viking, "steel", "gold"),
    "dragon": ("green", g_eye, "lime", None),
    "reaper": ("void", g_skull, "bone", "red"),
    "monarch": ("purple", g_crown, "gold", "red"),
    "phoenix": ("orange", g_phoenix, "fire", "gold"),
    "horizon": ("void", g_void, "void", None),
    "ignition": ("red", g_ignition, "fire", "sky"),
    "pathfinder": ("gold", g_laurel_star, "gold", "green"),
    "arbiter": ("steel", g_scales, "gold", "sky"),
    "frostbite": ("sky", g_crystal, "ice", "sky"),
    "firework": ("void", g_firework, "gold", "red"),
}
for key, (plate, fn, pal, acc) in AVATARS.items():
    avatar(key, plate, fn, pal, acc)

sprite = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' + "".join(d[1] for d in defs) + "</defs>" + "".join(symbols) + "</svg>"
with open(OUT, "w") as f:
    f.write(sprite)
ver = hashlib.sha1(sprite.encode()).hexdigest()[:8]
with open(MANIFEST, "w") as f:
    f.write("// Generated by scripts/icons/build.py — do not edit by hand.\n")
    f.write(f'export const ICON_VERSION = "{ver}";\n')
    f.write("export const ICONS = new Set<string>(" + str(names).replace("'", '"') + ");\n")

# Contact sheet for a visual check.
cols = 10
cell = 80
rows = math.ceil(len(names) / cols)
sheet = [f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{cols * cell}" height="{rows * (cell + 14)}" style="background:#0a1a33"><rect width="100%" height="100%" fill="#0c2344"/><defs>' + "".join(d[1] for d in defs) + "</defs>" + "".join(symbols)]
for i, n in enumerate(names):
    x, y = (i % cols) * cell, (i // cols) * (cell + 14)
    sheet.append(f'<use xlink:href="#{n}" href="#{n}" x="{x + 8}" y="{y + 4}" width="64" height="64"/><text x="{x + 40}" y="{y + 84}" font-size="9" fill="#9fb3c8" text-anchor="middle" font-family="Arial">{n}</text>')
sheet.append("</svg>")
with open("/tmp/icons-sheet.svg", "w") as f:
    f.write("".join(sheet))
print(f"{len(names)} icons, {len(sprite) // 1024} KB, version {ver}")
