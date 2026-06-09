#!/usr/bin/env python3
"""Build map.html (Leaflet) for ranked Pueblo Libre listings.

Reads ranking.jsonl + osm_pl.json + floors_cache.jsonl, joins them,
generates 400x300 thumbnails, builds a thin map_data.json, and writes
a self-contained map.html via template substitution.

Usage:
  python build_map.py [--no-thumbs] [--serve]
"""

import json
import re
import subprocess
import sys
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
from rank import PARKS, SEVERITY, CONN_POINTS  # noqa: E402

RANKING = ROOT / "ranking.jsonl"
OSM_FILE = ROOT / "osm_pl.json"
FLOORS_CACHE = ROOT / "floors_cache.jsonl"
_COMBINED = ROOT / "listings_combined.jsonl"
LISTINGS = _COMBINED if _COMBINED.exists() else (ROOT / "listings.jsonl")
IMAGES_DIR = ROOT / "images"
THUMBS_DIR = ROOT / "thumbs"
TEMPLATE = ROOT / "map_template.html"
OUT_HTML = ROOT / "map.html"
OUT_DATA = ROOT / "map_data.json"

THUMB_W, THUMB_H = 400, 300
THUMB_QUALITY = 80
THUMB_MAX = 8  # only thumbnail the first 8 photos per listing


def load_jsonl(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def listing_photo_files(lid):
    """Sorted list of photo filenames in images/<lid>/."""
    d = IMAGES_DIR / lid
    if not d.is_dir():
        return []
    return sorted(p.name for p in d.glob("*.jpg"))


def thumb_path(lid, filename):
    """thumbs/<lid>/NNN.jpg where NNN is the leading number of the source file."""
    stem = filename.split("-", 1)[0]  # NNN
    return THUMBS_DIR / lid / f"{stem}.jpg"


def generate_thumb(src, dst):
    from PIL import Image
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return False  # current
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as img:
        img = img.convert("RGB")
        img.thumbnail((THUMB_W, THUMB_W))  # max bbox; keeps aspect
        img.save(dst, "JPEG", quality=THUMB_QUALITY, optimize=True)
    return True


def build_thumbs(listings):
    THUMBS_DIR.mkdir(exist_ok=True)
    jobs = []
    for r in listings:
        lid = r.get("id")
        if not lid:
            continue
        files = listing_photo_files(lid)[:THUMB_MAX]
        for f in files:
            src = IMAGES_DIR / lid / f
            dst = thumb_path(lid, f)
            jobs.append((src, dst))
    print(f"Thumbnailing up to {len(jobs)} photos (first {THUMB_MAX}/listing)...")
    done = [0]
    def work(j):
        try:
            generate_thumb(*j)
        except Exception as e:
            print(f"  fail {j[0].name}: {e}", file=sys.stderr)
        done[0] += 1
        if done[0] % 100 == 0:
            print(f"  ...{done[0]}/{len(jobs)}")
    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(work, jobs))
    print(f"Thumbs done ({done[0]}).")


def thumbs_for_listing(lid):
    """Web-relative thumb paths for first THUMB_MAX photos. Dedupe collisions."""
    files = listing_photo_files(lid)[:THUMB_MAX]
    out, seen = [], set()
    for f in files:
        tp = thumb_path(lid, f)
        rel = f"thumbs/{lid}/{tp.name}"
        if tp.exists() and rel not in seen:
            out.append(rel)
            seen.add(rel)
    return out


def fallback_image_urls(r):
    """Use the original CDN URLs as fallback if local thumbs are missing.
    Strip ?isFirstImage=true from the first image. Falls back to developer
    `photos` list when `images` is empty.
    """
    out = []
    for img in (r.get("images") or [])[:THUMB_MAX]:
        u = img.get("url") if isinstance(img, dict) else img
        if not u:
            continue
        u = u.split("?", 1)[0]
        if u:
            out.append(u)
    if not out and r.get("photos"):
        for u in r["photos"][:THUMB_MAX]:
            if u:
                out.append(u.split("?", 1)[0])
    return out


def whatsapp_link(raw):
    if not raw:
        return ""
    digits = re.sub(r"\D", "", str(raw))
    if not digits:
        return ""
    if not digits.startswith("51"):
        digits = "51" + digits
    return f"https://wa.me/{digits}"


def trim_listing(r, floors_idx):
    """Strip fields we don't need; attach floor cache row; produce a thin record."""
    desc = (r.get("description_jsonld") or r.get("description") or "")[:300]
    source = r.get("source") or "urbania"
    lid = r.get("id") or ""
    out = {
        "id": lid,
        "url": r.get("url") or r.get("source_url"),
        "address": r.get("address"),
        "lat": r.get("lat"),
        "lng": r.get("lng"),
        "price_usd": r.get("price_usd"),
        "price_pen": r.get("price_pen"),
        "area_total_m2": r.get("area_total_m2"),
        "bedrooms": r.get("bedrooms"),
        "antiquity": r.get("antiquity"),
        "real_estate_type": r.get("real_estate_type"),
        "publisher_name": r.get("publisher_name") or r.get("developer_name"),
        "publisher_whatsapp": whatsapp_link(r.get("publisher_whatsapp")),
        "description_jsonld": desc,
        "_score": r["_score"],
        "thumbs": thumbs_for_listing(lid),
        "fallback_images": fallback_image_urls(r),
        "floors": floors_idx.get(lid),
        "source": source,
        "posting_type": r.get("posting_type"),
        "project_name": r.get("project_name"),
        "project_status": r.get("project_status"),
        "delivery_year": r.get("delivery_year"),
    }
    out["cover_thumb"] = out["thumbs"][0] if out["thumbs"] else (
        out["fallback_images"][0] if out["fallback_images"] else None
    )
    return out


def trim_avenidas(osm):
    out = []
    for w in osm.get("avenidas") or []:
        geom = w.get("geometry") or []
        if len(geom) < 2:
            continue
        tags = w.get("tags") or {}
        name = tags.get("name") or "?"
        sev = SEVERITY.get(name, "MODERATE")
        out.append({
            "name": name,
            "severity": sev,
            "lanes": tags.get("lanes"),
            "geometry": [[g["lat"], g["lon"]] for g in geom],
        })
    return out


def trim_commerce(osm):
    return [{"lat": n["lat"], "lng": n["lon"]} for n in (osm.get("commerce") or [])
            if "lat" in n and "lon" in n]


MAP_DATA_SENTINEL = "/*<MAP_DATA>*/null/*</MAP_DATA>*/"
MAP_GEO_SENTINEL = "/*__MAP_GEO__*/{}/*__/MAP_GEO__*/"
GEO_DISPLAY_KEYS = ("parks", "schools", "health", "stroads", "police", "markets", "cycleways",
                    "malls", "banks", "universities", "pharmacies", "kindergarten")  # commerce/bus/crossings solo para rank.py


def build_district_data(slug, no_thumbs):
    """Construye map_data_<slug>.json desde ranking_<slug>.jsonl (listings + thumbs)."""
    ranking = ROOT / f"ranking_{slug}.jsonl"
    listings = load_jsonl(ranking)
    floors = load_jsonl(FLOORS_CACHE) if FLOORS_CACHE.exists() else []
    floors_idx = {f["id"]: f for f in floors}
    if not no_thumbs:
        try:
            import PIL  # noqa: F401
        except ImportError:
            print("Pillow no instalado; pasa --no-thumbs."); sys.exit(2)
        build_thumbs(listings)
    trimmed = [trim_listing(r, floors_idx) for r in listings]
    for t in trimmed:
        t["district"] = slug
    out = ROOT / f"map_data_{slug}.json"
    out.write_text(json.dumps({"listings": trimmed}, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {out.name}: {len(trimmed)} listings")


def combine_and_render():
    """Junta todos los distritos con data:true en un solo map.html (listings + geo concatenados)."""
    cfg = json.loads((ROOT / "districts.json").read_text())
    active = [s for s, d in cfg.items() if d.get("data")]
    all_listings = []
    geo = {k: [] for k in GEO_DISPLAY_KEYS}
    boundaries = []
    for s in active:
        md = ROOT / f"map_data_{s}.json"
        if md.exists():
            all_listings += json.loads(md.read_text()).get("listings", [])
        g = ROOT / f"map_geo_{s}.json"
        if g.exists():
            gj = json.loads(g.read_text())
            for k in GEO_DISPLAY_KEYS:
                geo[k] += gj.get(k, [])
            b = gj.get("boundary")
            if b and len(b) >= 3:
                boundaries.append(b)
    geo["boundaries"] = boundaries  # lista de anillos (uno por distrito activo)
    comps = [r["_score"]["composite"] for r in all_listings if r.get("_score")]
    score_range = [min(comps), max(comps)] if comps else [0.0, 1.0]
    data = {
        "listings": all_listings,
        "score_range": score_range,
        "districts": cfg,
        "active_districts": active,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    geo_json = json.dumps(geo, ensure_ascii=False, separators=(",", ":"))
    OUT_DATA.write_text(data_json)  # map_data.json (referencia)

    # Datos externos: el HTML los carga con <script src> → HTML chico, carga
    # rápida (con loader) y escala a muchos distritos sin inflar el HTML.
    (ROOT / "map_data.js").write_text("window.MAP_DATA = " + data_json + ";\n")
    (ROOT / "map_geo.js").write_text("window.MAP_GEO = " + geo_json + ";\n")
    OUT_HTML.write_text(TEMPLATE.read_text())  # plantilla tal cual (sin inyección)

    html_kb = OUT_HTML.stat().st_size / 1024
    data_kb = (ROOT / "map_data.js").stat().st_size / 1024
    print(f"Wrote map.html ({html_kb:.1f} KB) + map_data.js ({data_kb:.1f} KB) + map_geo.js — "
          f"{len(all_listings)} listings, distritos: {active}")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default=None, help="construir map_data_<slug>.json para un distrito")
    ap.add_argument("--no-thumbs", action="store_true")
    ap.add_argument("--serve", action="store_true")
    args = ap.parse_args()

    if args.district:
        build_district_data(args.district, args.no_thumbs)
    else:
        combine_and_render()

    if args.serve:
        print("Starting http.server on :8765 ...")
        subprocess.Popen([sys.executable, "-m", "http.server", "8765"], cwd=ROOT)
        time.sleep(1)
        webbrowser.open("http://localhost:8765/map.html")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            print("Stopping.")


if __name__ == "__main__":
    main()
