#!/usr/bin/env python3
"""Combine final de todos los distritos data:true + validación JS + deploy a GitHub.
Pensado para correr tras los drivers de scraping. Loguea a _famous.log."""
import json, re, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
H = Path("/Users/miriamna/habita")
LOG = open(ROOT / "_famous.log", "a")


def log(m):
    line = f"{time.strftime('%H:%M:%S')} FINALIZE {m}"
    print(line, flush=True); LOG.write(line + "\n"); LOG.flush()


def run(cmd, cwd=ROOT):
    return subprocess.run(cmd, shell=True, cwd=str(cwd)).returncode == 0


def main():
    cfg = json.loads((ROOT / "districts.json").read_text())
    live = [k for k, v in cfg.items() if v.get("data")]
    log(f"distritos data:true = {live}")
    if not run("python3 build_map.py"):
        log("build_map combine FALLÓ"); return
    # validar el JS del app
    html = (ROOT / "map.html").read_text()
    scripts = [s for s in re.findall(r"<script>(.*?)</script>", html, re.S) if "const MAP_DATA" in s]
    (ROOT / "_mc.js").write_text(scripts[0] if scripts else "// vacío")
    if subprocess.run("node --check _mc.js", shell=True, cwd=str(ROOT)).returncode != 0:
        log("JS INVÁLIDO — NO despliego"); return
    log("JS OK")
    # publicar
    for fn in ("map.html", "map_template.html", "districts.json", "map_data.js", "map_geo.js",
               "map_data.json", "rank.py", "build_map.py", "_famous_driver.py", "_finalize.py"):
        run(f"cp -X {fn} {H}/")
    run(f"cp -X map.html {H}/index.html")
    run(f"cp -X osm/build_map_geo.py {H}/osm/")
    n_listings = sum(1 for _ in open(ROOT / "map_data.json")) if (ROOT / "map_data.json").exists() else 0
    total = len(json.loads((ROOT / "map_data.json").read_text()).get("listings", []))
    msg = f"Multi-distrito: {len(live)} distritos activos ({total} propiedades)"
    ok = run(f"git add -A && git commit -q -m '{msg}' && git push -q origin main", cwd=H)
    log(f"DEPLOY {'OK' if ok else 'FALLÓ'} — {msg}")
    log("ORQUESTA COMPLETA")


if __name__ == "__main__":
    main()
