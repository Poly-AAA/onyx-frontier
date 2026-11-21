#!/usr/bin/env python3
"""Compose des feuilles personnages (Idle/Walk) depuis le pack fantasy-cc (lecture seule).
Sortie: assets/chars/<id>_<Anim>.png (1920x1024, 15x8 cases de 128)."""
from PIL import Image
from pathlib import Path
import json
SRC = Path("/workspace/creator-pers0na/assets/packs/fantasy-cc/spritesheets")
OUT = Path(__file__).resolve().parent.parent / "assets" / "chars"
OUT.mkdir(parents=True, exist_ok=True)
# ordre de couches du catalog: shadow, body, shoes, legs, chest, belt, gloves, ..., head
# (dossier, teinte RGB ou None). Les feuilles du pack sont en niveaux de gris : on teinte par couche.
SK1, SK2, SK3 = (236, 190, 150), (180, 120, 80), (110, 70, 45)
LOOKS = {
  # joueur « sumo tanky » : uniforme sombre, accents dorés (réf. delinquents.thegame), corps massif NakedBody2 ; affiché à x1.25 en jeu
  "player": [("Shadow", None), ("NakedBody2", SK2), ("Shoes5", (210, 160, 50)), ("Legs7", (58, 56, 66)), ("Chest15", (66, 62, 74)), ("Belt2", (235, 185, 60)), ("Hands4", (225, 175, 55)), ("Head2", (35, 30, 28))],
  "thug":   [("Shadow", None), ("NakedBody", SK3), ("Shoes1", (30, 30, 30)), ("Legs6", (60, 30, 40)), ("Chest13", (170, 40, 60)), ("Hands1", (40, 40, 40)), ("Head3", (30, 25, 25))],
  "rico":   [("Shadow", None), ("NakedBody2", SK2), ("Shoes1", (40, 40, 40)), ("Legs1", (70, 70, 80)), ("Chest3", (40, 160, 120)), ("Hands1", (60, 60, 60)), ("Head2", (30, 30, 30))],
  "nova":   [("Shadow", None), ("NakedBody", SK1), ("Shoes4", (90, 30, 60)), ("LegsFeminine", None), ("ChestFeminine", None), ("HandsFeminine", None), ("HeadFeminine", None)],
  "doc":    [("Shadow", None), ("NakedBody3", SK3), ("Shoes3", (200, 200, 200)), ("Legs5", (220, 220, 225)), ("Chest12", (235, 240, 245)), ("Hands3", (120, 200, 160)), ("Head9", (200, 210, 220))],
  "brute":  [("Shadow", None), ("NakedBody2", SK2), ("Shoes5", (40, 30, 25)), ("Legs7", (60, 40, 30)), ("Chest15", (150, 40, 40)), ("Belt2", (40, 30, 25)), ("Hands4", (90, 90, 95)), ("Head14", (120, 120, 130))],
  "ghost":  [("Shadow", None), ("NakedBody3", SK1), ("Shoes2", (20, 20, 25)), ("Legs8", (30, 30, 40)), ("Chest18", (60, 50, 90)), ("Head20", (120, 90, 200))],
  "vendor": [("Shadow", None), ("NakedBody", SK2), ("Shoes1", (90, 60, 40)), ("Legs2", (160, 130, 80)), ("Chest5", (230, 200, 60)), ("Head12", (200, 80, 60))],
  "cop":    [("Shadow", None), ("NakedBody2", SK3), ("Shoes3", (20, 20, 20)), ("Legs4", (30, 40, 70)), ("Chest10", (40, 60, 120)), ("Belt1", (20, 20, 20)), ("Hands2", (20, 20, 20)), ("Head17", (40, 60, 120))],
}

def tint(im, rgb):
    if rgb is None:
        return im
    r, g, b, a = im.split()
    # niveaux de gris -> multiplicatif éclairci (garde les ombres du pixel art)
    def ch(c, k):
        return r.point(lambda v: min(255, int(v / 255 * k * 1.35)))
    return Image.merge("RGBA", (ch(r, rgb[0]), ch(g, rgb[1]), ch(b, rgb[2]), a))
ANIMS = ["Idle", "Walk"]
manifest = {}
for cid, layers in LOOKS.items():
    for anim in ANIMS:
        base = None
        used = []
        for L, col in layers:
            p = SRC / L / f"{anim}.png"
            if not p.exists():
                continue
            im = tint(Image.open(p).convert("RGBA"), col)
            base = im if base is None else Image.alpha_composite(base, im)
            used.append(L)
        base.save(OUT / f"{cid}_{anim}.png", optimize=True)
        manifest[cid] = used
(OUT / "manifest.json").write_text(json.dumps({"frame": 128, "cols": 15, "rows": 8, "looks": manifest}, indent=1))
print(json.dumps(manifest))
