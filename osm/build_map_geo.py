#!/usr/bin/env python3
"""
build_map_geo.py — Genera `map_geo.json` (parques + colegios + salud + avenidas ruidosas) para
Habita a partir de OpenStreetMap (Overpass API), en el formato que consume `window.MAP_GEO`.

  MAP_GEO = {
    "parks":   [ { "name", "poly": [[lat,lng], ...] } ],
    "schools": [ { "name", "lat", "lng" } ],
    "health":  [ { "name", "lat", "lng" } ],
    "stroads": [ { "name", "severity": "HIGH"|"MODERATE", "path": [[lat,lng], ...] } ]
  }

USO
    python3 build_map_geo.py --out map_geo.json
    python3 build_map_geo.py --no-roads --out map_geo.json   # sin avenidas

El centinela en map_template.html es:
    <script>window.MAP_GEO = /*__MAP_GEO__*/{}/*__/MAP_GEO__*/;</script>
y build_map.py lo reemplaza con el contenido de map_geo.json al generar el HTML.

NOTA IMPORTANTE: el área Overpass `name="Pueblo Libre"` matchea DISTRITOS HOMÓNIMOS en otras
regiones del Perú. Por eso recortamos TODO a la BBOX de Pueblo Libre, Lima (BBOX abajo).
"""

import json, sys, argparse, time, urllib.request, urllib.parse, urllib.error

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
MIN_PTS = 4  # ignora polígonos con menos de 4 nodos

# Pueblo Libre, Lima — recorte para descartar distritos homónimos.
BBOX = (-12.095, -12.060, -77.085, -77.055)  # lat0, lat1, lng0, lng1

PARKS_QUERY = r"""
[out:json][timeout:90];
area["name"="Pueblo Libre"]["boundary"="administrative"]->.a;
(
  way["leisure"~"^(park|garden|pitch|playground)$"](area.a);
  way["landuse"~"^(grass|recreation_ground|village_green)$"](area.a);
  relation["leisure"="park"](area.a);
);
out tags geom;
"""

SCHOOLS_QUERY = r"""
[out:json][timeout:90];
area["name"="Pueblo Libre"]["boundary"="administrative"]->.a;
(
  node["amenity"="school"](area.a);
  way["amenity"="school"](area.a);
);
out tags center;
"""

HEALTH_QUERY = r"""
[out:json][timeout:90];
area["name"="Pueblo Libre"]["boundary"="administrative"]->.a;
(
  node["amenity"~"^(hospital|clinic|doctors)$"](area.a);
  way["amenity"~"^(hospital|clinic|doctors)$"](area.a);
);
out tags center;
"""

ROADS_QUERY = r"""
[out:json][timeout:90];
area["name"="Pueblo Libre"]["boundary"="administrative"]->.a;
(
  way["highway"~"^(trunk|primary|secondary)$"](area.a);
);
out tags geom;
"""


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
                if e.code in (429, 504, 502, 503):
                    wait = 5 * (attempt + 1)
                    print(f"  {e.code} en {url.split('/')[2]}, reintento en {wait}s…", file=sys.stderr)
                    time.sleep(wait)
                    continue
                raise
            except Exception as e:
                last = e
                time.sleep(3)
        print(f"  cambiando de mirror…", file=sys.stderr)
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
        if len(poly) < MIN_PTS:
            continue
        if not _in_bbox(*_centroid(poly)):   # descarta homónimos fuera de PL-Lima
            continue
        name = el.get("tags", {}).get("name", "Área verde")
        out.append({"name": name, "poly": poly})
    return out


def points_from(osm, default_name):
    out = []
    for el in osm.get("elements", []):
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lon = el.get("lon", (el.get("center") or {}).get("lon"))
        if lat is None or lon is None:
            continue
        if not _in_bbox(lat, lon):
            continue
        name = el.get("tags", {}).get("name", default_name)
        out.append({"name": name, "lat": round(lat, 6), "lng": round(lon, 6)})
    return out


def stroads_from(osm):
    sev = {"trunk": "HIGH", "primary": "HIGH", "secondary": "MODERATE"}
    out = []
    for el in osm.get("elements", []):
        geom = el.get("geometry")
        if not geom:
            continue
        path = [[round(p["lat"], 6), round(p["lon"], 6)] for p in geom]
        if len(path) < 2:
            continue
        if not _in_bbox(*_centroid(path)):
            continue
        tags = el.get("tags", {})
        out.append({
            "name": tags.get("name", "Avenida"),
            "severity": sev.get(tags.get("highway"), "MODERATE"),
            "path": path,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="-", help="archivo de salida (default: stdout)")
    ap.add_argument("--no-roads", action="store_true", help="sin avenidas")
    args = ap.parse_args()

    print("Consultando Overpass (parques)…", file=sys.stderr)
    parks = parks_from(overpass(PARKS_QUERY)); time.sleep(2)
    print("Consultando Overpass (colegios)…", file=sys.stderr)
    schools = points_from(overpass(SCHOOLS_QUERY), "Colegio"); time.sleep(2)
    print("Consultando Overpass (salud)…", file=sys.stderr)
    health = points_from(overpass(HEALTH_QUERY), "Centro de salud"); time.sleep(2)
    stroads = []
    if not args.no_roads:
        print("Consultando Overpass (avenidas)…", file=sys.stderr)
        stroads = stroads_from(overpass(ROADS_QUERY))

    result = {"parks": parks, "schools": schools, "health": health, "stroads": stroads}
    text = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    if args.out == "-":
        print(text)
    else:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"OK → {args.out}: {len(parks)} parques, {len(schools)} colegios, "
              f"{len(health)} salud, {len(stroads)} avenidas (recortado a PL-Lima)", file=sys.stderr)


if __name__ == "__main__":
    main()
