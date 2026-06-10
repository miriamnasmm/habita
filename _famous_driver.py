#!/usr/bin/env python3
"""Scrapea + procesa los distritos famosos y los deja listos (data:true) para
combinar. NO despliega (eso lo hace el humano tras revisar). Rápido: solo
venta deptos+casas, cap por distrito, sin descargar imágenes (usa CDN fallback)."""
import json, re, subprocess, sys, time, traceback
from pathlib import Path
from curl_cffi import requests

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import walk_index as wi

_cli = [a for a in sys.argv[1:] if not a.startswith("-")]
DISTRICTS = _cli if _cli else ["barranco", "miraflores", "san-isidro", "san-borja", "surco"]
CAP = 600          # tope de listados por distrito (antes de fetch_details)
MIN_RANK = 30      # mínimo en ranking para activar el distrito
LOG = open(ROOT / "_famous.log", "a")

wi.COMBOS = [("venta", "departamentos"), ("venta", "casas")]
wi.MAX_PAGES = 25


def log(m):
    line = f"{time.strftime('%H:%M:%S')} {m}"
    print(line, flush=True); LOG.write(line + "\n"); LOG.flush()


def run(cmd):
    log(f"$ {cmd}")
    return subprocess.run(cmd, shell=True, cwd=str(ROOT)).returncode == 0


def count(p):
    f = ROOT / p
    return sum(1 for _ in open(f)) if f.exists() else 0


def walk(d):
    cfg = json.loads((ROOT / "districts.json").read_text())
    wi.DISTRICT = cfg[d]["urbania_slug"]
    wi.INDEX_DIR = ROOT / f"index_{d}"; wi.INDEX_DIR.mkdir(exist_ok=True)
    wi.INDEX_FILE = ROOT / f"listings_index_{d}.jsonl"
    s = requests.Session(impersonate="chrome")
    seen, rows = set(), []
    for t, p in wi.COMBOS:
        try:
            rows += wi.walk_combo(s, t, p, seen)
        except Exception as e:
            log(f"  walk_combo {t}/{p} error: {e}")
    rows = rows[:CAP]
    with wi.INDEX_FILE.open("w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(rows)


def main():
    activated = []
    cfg = json.loads((ROOT / "districts.json").read_text())
    for d in DISTRICTS:
        log(f"===== {d} =====")
        try:
            n = walk(d)
            log(f"{d}: índice {n} (venta deptos+casas, cap {CAP})")
            if n < MIN_RANK:
                log(f"{d}: índice pobre ({n}); skip"); continue
            steps = [f"python3 fetch_details.py --district {d}",
                     f"python3 parse_details.py --district {d}",
                     f"python3 merge_listings.py --district {d}",
                     f"python3 osm/build_map_geo.py --district {d}",
                     f"python3 rank.py --district {d}",
                     f"python3 build_map.py --district {d} --no-thumbs"]
            okall = True
            for st in steps:
                if not run(st):
                    log(f"{d}: FALLO en `{st}`"); okall = False; break
            if not okall:
                continue
            nr = count(f"ranking_{d}.jsonl")
            log(f"{d}: ranking {nr} listings")
            if nr < MIN_RANK:
                log(f"{d}: ranking pobre ({nr}); no activo"); continue
            cfg = json.loads((ROOT / "districts.json").read_text())
            cfg[d]["data"] = True
            (ROOT / "districts.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
            activated.append((d, nr))
            log(f"{d}: ACTIVADO ✓ ({nr})")
        except Exception:
            log(f"{d}: EXCEPCIÓN\n{traceback.format_exc()}")
        time.sleep(5)
    log(f"===== DONE activados: {activated} =====")


if __name__ == "__main__":
    main()
