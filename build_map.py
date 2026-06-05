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


def main():
    no_thumbs = "--no-thumbs" in sys.argv
    serve = "--serve" in sys.argv

    listings = load_jsonl(RANKING)
    floors = load_jsonl(FLOORS_CACHE)
    floors_idx = {f["id"]: f for f in floors}
    osm = json.loads(OSM_FILE.read_text())

    print(f"Loaded {len(listings)} listings, {len(floors)} floor rows, "
          f"{len(osm.get('avenidas') or [])} avenidas.")

    if not no_thumbs:
        try:
            import PIL  # noqa: F401
        except ImportError:
            print("Pillow not installed - run `pip install Pillow` in venv, or pass --no-thumbs.")
            sys.exit(2)
        build_thumbs(listings)
    else:
        print("Skipping thumbnail generation (--no-thumbs).")

    trimmed_listings = [trim_listing(r, floors_idx) for r in listings]
    comps = [r["_score"]["composite"] for r in listings]
    score_range = [min(comps), max(comps)] if comps else [0.0, 1.0]

    data = {
        "listings": trimmed_listings,
        "parks": PARKS,
        "avenidas": trim_avenidas(osm),
        "conn_points": CONN_POINTS,
        "commerce": trim_commerce(osm),
        "score_range": score_range,
        "counts": {
            "listings": len(trimmed_listings),
            "avenidas": len(osm.get("avenidas") or []),
            "commerce": len(osm.get("commerce") or []),
            "parks": len(PARKS),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT_DATA.write_text(data_json)
    size_kb = OUT_DATA.stat().st_size / 1024
    print(f"Wrote {OUT_DATA.name} ({size_kb:.1f} KB)")

    template = TEMPLATE.read_text()
    sentinel = "/*<MAP_DATA>*/null/*</MAP_DATA>*/"
    if sentinel not in template:
        print("ERROR: template missing MAP_DATA sentinel.", file=sys.stderr)
        sys.exit(1)
    html = template.replace(sentinel, data_json)

    # Inject real OSM geometry (parks polygons + noisy avenues) if present.
    geo_path = ROOT / "map_geo.json"
    geo_sentinel = "/*__MAP_GEO__*/{}/*__/MAP_GEO__*/"
    if geo_sentinel in template:
        geo_json = geo_path.read_text() if geo_path.exists() else "{}"
        html = html.replace(geo_sentinel, "/*__MAP_GEO__*/" + geo_json + "/*__/MAP_GEO__*/")
        if geo_path.exists():
            print(f"Injected map_geo.json ({geo_path.stat().st_size/1024:.1f} KB)")

    OUT_HTML.write_text(html)
    html_kb = OUT_HTML.stat().st_size / 1024
    print(f"Wrote {OUT_HTML.name} ({html_kb:.1f} KB)")

    if serve:
        print("Starting http.server on :8765 ...")
        subprocess.Popen([sys.executable, "-m", "http.server", "8765"], cwd=ROOT)
        time.sleep(1)
        webbrowser.open("http://localhost:8765/map.html")
        print("Server running. Ctrl+C to stop.")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            print("Stopping.")


if __name__ == "__main__":
    main()
