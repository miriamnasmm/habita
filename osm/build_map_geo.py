#!/usr/bin/env python3
"""
build_map_geo.py — Genera `map_geo_<distrito>.json` (parques + colegios + salud + avenidas)
desde OpenStreetMap (Overpass) para CUALQUIER distrito definido en ../districts.json.

  MAP_GEO = {
    "parks":   [ { "name", "poly": [[lat,lng], ...] } ],
    "schools": [ { "name", "lat", "lng" } ],
    "health":  [ { "name", "lat", "lng" } ],
    "stroads": [ { "name", "severity": "HIGH"|"MODERATE", "path": [[lat,lng], ...] } ]
  }

USO
    python3 osm/build_map_geo.py --district san-miguel
    python3 osm/build_map_geo.py --district pueblo-libre --out map_geo.json   # nombre fijo

Lee la config (nombre OSM + bbox) de ../districts.json. El recorte por bbox descarta
distritos homónimos en otras regiones del Perú.
"""

import json, sys, argparse, time, urllib.request, urllib.parse, urllib.error
from pathlib import Path

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
MIN_PTS = 4          # ignora polígonos con menos de 4 nodos
PAD = 0.0015         # margen al bbox para no cortar features del borde

PROJ = Path(__file__).resolve().parent.parent
DISTRICTS = PROJ / "districts.json"

BBOX = None  # (lat0, lat1, lng0, lng1) — se setea en main() desde el distrito


def queries(osm_name):
    area = f'area["name"="{osm_name}"]["boundary"="administrative"]->.a;'
    parks = (f'[out:json][timeout:90];{area}('
             f'way["leisure"~"^(park|garden|pitch|playground)$"](area.a);'
             f'way["landuse"~"^(grass|recreation_ground|village_green)$"](area.a);'
             f'relation["leisure"="park"](area.a););out tags geom;')
    schools = (f'[out:json][timeout:90];{area}('
               f'node["amenity"="school"](area.a);way["amenity"="school"](area.a););out tags center;')
    health = (f'[out:json][timeout:90];{area}('
              f'node["amenity"~"^(hospital|clinic|doctors)$"](area.a);'
              f'way["amenity"~"^(hospital|clinic|doctors)$"](area.a););out tags center;')
    roads = (f'[out:json][timeout:90];{area}('
             f'way["highway"~"^(trunk|primary|secondary)$"](area.a););out tags geom;')
    # Nodos de scoring (no se muestran; los consume rank.py):
    commerce = (f'[out:json][timeout:90];{area}('
                f'node["amenity"~"^(cafe|restaurant|bar|pharmacy|supermarket|convenience|fast_food|bakery|marketplace)$"](area.a);'
                f'node["shop"~"^(supermarket|convenience|bakery|greengrocer|butcher)$"](area.a););out center;')
    bus = (f'[out:json][timeout:90];{area}('
           f'node["highway"="bus_stop"](area.a);node["public_transport"="stop_position"](area.a););out center;')
    crossings = (f'[out:json][timeout:90];{area}('
                 f'node["highway"~"^(crossing|traffic_signals)$"](area.a););out center;')
    return parks, schools, health, roads, commerce, bus, crossings


def overpass(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in OVERPASS_URLS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "habita-mapgeo/1.0"})
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                last = e
                if e.code in (429, 403, 504, 502, 503):
                    wait = 8 * (attempt + 1)
                    print(f"  {e.code} en {url.split('/')[2]}, reintento en {wait}s…", file=sys.stderr)
                    time.sleep(wait); continue
                raise
            except Exception as e:
                last = e; time.sleep(3)
        print("  cambiando de mirror…", file=sys.stderr)
    raise last


def _centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def _in_bbox(lat, lng):
    return BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lng <= BBOX[3]


def parks_from(osm):
    out = []
    for el in osm.get("elements", []):
        geom = el.get("geometry")
        if not geom:
            continue
        poly = [[round(p["lat"], 6), round(p["lon"], 6)] for p in geom]
        if len(poly) < MIN_PTS or not _in_bbox(*_centroid(poly)):
            continue
        out.append({"name": el.get("tags", {}).get("name", "Área verde"), "poly": poly})
    return out


def points_from(osm, default_name):
    out = []
    for el in osm.get("elements", []):
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        if lat is None or lon is None or not _in_bbox(lat, lon):
            continue
        out.append({"name": el.get("tags", {}).get("name", default_name),
                    "lat": round(lat, 6), "lng": round(lon, 6)})
    return out


def coords_from(osm):
    """Lista compacta [[lat,lng],...] de nodos (para scoring), recortada al bbox."""
    out = []
    for el in osm.get("elements", []):
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        if lat is None or lon is None or not _in_bbox(lat, lon):
            continue
        out.append([round(lat, 6), round(lon, 6)])
    return out


def stroads_from(osm):
    sev = {"trunk": "HIGH", "primary": "HIGH", "secondary": "MODERATE"}
    out = []
    for el in osm.get("elements", []):
        geom = el.get("geometry")
        if not geom:
            continue
        path = [[round(p["lat"], 6), round(p["lon"], 6)] for p in geom]
        if len(path) < 2 or not _in_bbox(*_centroid(path)):
            continue
        tags = el.get("tags", {})
        out.append({"name": tags.get("name", "Avenida"),
                    "severity": sev.get(tags.get("highway"), "MODERATE"), "path": path})
    return out


def main():
    global BBOX
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    ap.add_argument("--out", default=None, help="salida (default: map_geo_<slug>.json)")
    ap.add_argument("--no-roads", action="store_true")
    args = ap.parse_args()

    cfg = json.loads(DISTRICTS.read_text())
    if args.district not in cfg:
        sys.exit(f"distrito '{args.district}' no está en districts.json ({list(cfg)})")
    d = cfg[args.district]
    s, n, w, e = d["bbox"]
    BBOX = (s - PAD, n + PAD, w - PAD, e + PAD)
    PARKS_Q, SCHOOLS_Q, HEALTH_Q, ROADS_Q, COMMERCE_Q, BUS_Q, CROSS_Q = queries(d["osm_name"])
    out_path = Path(args.out) if args.out else (PROJ / f"map_geo_{args.district}.json")

    print(f"Distrito: {d['name']} ({args.district}) — bbox {BBOX}", file=sys.stderr)
    print("Overpass (parques)…", file=sys.stderr)
    parks = parks_from(overpass(PARKS_Q)); time.sleep(2)
    print("Overpass (colegios)…", file=sys.stderr)
    schools = points_from(overpass(SCHOOLS_Q), "Colegio"); time.sleep(2)
    print("Overpass (salud)…", file=sys.stderr)
    health = points_from(overpass(HEALTH_Q), "Centro de salud"); time.sleep(2)
    print("Overpass (comercio)…", file=sys.stderr)
    commerce = coords_from(overpass(COMMERCE_Q)); time.sleep(2)
    print("Overpass (buses)…", file=sys.stderr)
    bus = coords_from(overpass(BUS_Q)); time.sleep(2)
    print("Overpass (cruces)…", file=sys.stderr)
    crossings = coords_from(overpass(CROSS_Q)); time.sleep(2)
    stroads = []
    if not args.no_roads:
        print("Overpass (avenidas)…", file=sys.stderr)
        stroads = stroads_from(overpass(ROADS_Q))

    result = {"parks": parks, "schools": schools, "health": health, "stroads": stroads,
              "commerce": commerce, "bus": bus, "crossings": crossings}
    out_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    print(f"OK → {out_path.name}: {len(parks)} parques, {len(schools)} colegios, {len(health)} salud, "
          f"{len(stroads)} avenidas, {len(commerce)} comercio, {len(bus)} bus, {len(crossings)} cruces",
          file=sys.stderr)


if __name__ == "__main__":
    main()
