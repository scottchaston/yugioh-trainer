#!/usr/bin/env python3
"""Extract card data for the supported Structure Decks from the Yaml Yugi aggregate.

Source: https://github.com/DawnbrandBots/yaml-yugi (aggregate branch, cards.json).
Yaml Yugi mirrors the official Konami card database text (TCG English).

Usage:
  python3 scripts/extract-cards.py path/to/cards.json > src/cards/data/cards.json
"""
import json, sys

SET_PREFIXES = ("SDBE-EN", "SDCB-EN")

def type_line(x):
    line = x.get("monster_type_line") or ""
    parts = [p.strip() for p in line.split("/") if p.strip()]
    return parts

def main():
    src = json.load(open(sys.argv[1]))
    out = {}
    for x in src:
        for e in (x.get("sets") or {}).get("en", []):
            n = e.get("set_number") or ""
            if not n.startswith(SET_PREFIXES):
                continue
            pw = x["password"]
            rec = out.setdefault(str(pw), {
                "id": str(pw),
                "konamiId": x.get("konami_id"),
                "name": x["name"]["en"],
                "cardType": x["card_type"],  # Monster | Spell | Trap
                "text": x["text"]["en"],
                "setNumbers": [],
            })
            rec["setNumbers"].append(n)
            if x["card_type"] == "Monster":
                parts = type_line(x)
                rec["race"] = parts[0] if parts else None
                mtypes = parts[1:]
                # A monster with no "Effect" marker (and no Pendulum effect) is a Normal Monster;
                # the source omits the "Normal" marker for a few cards (e.g. Alexandrite Dragon).
                if "Effect" not in mtypes and "Normal" not in mtypes and x.get("pendulum_scale") is None:
                    mtypes = mtypes + ["Normal"]
                rec["monsterTypes"] = mtypes
                rec["attribute"] = x.get("attribute")
                rec["level"] = x.get("level")
                rec["atk"] = x.get("atk")
                rec["def"] = x.get("def")
                if x.get("pendulum_scale") is not None:
                    rec["pendulumScale"] = x.get("pendulum_scale")
                    rec["pendulumEffect"] = (x.get("pendulum_effect") or {}).get("en")
                if x.get("materials"):
                    rec["materials"] = x.get("materials")
            else:
                rec["property"] = x.get("property")  # Normal, Quick-Play, Continuous, Equip, Field, Counter
    recs = sorted(out.values(), key=lambda r: (r["setNumbers"][0]))
    json.dump(recs, sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")

if __name__ == "__main__":
    main()
