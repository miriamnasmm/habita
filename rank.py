#!/usr/bin/env python3
"""Rank Pueblo Libre PROPERTY-venta listings by walkability + livability +
connectivity, using OpenStreetMap road geometry and amenity nodes.

Hard filters: PROPERTY + venta + at least 2 bedrooms + building age <= 15y
or new + has coordinates + price USD >= $80k.

Composite weights (sum to 1.0), grouped by the owner's priority tiers
(Nivel 1 = daily use, weighs most; Nivel 2 = important; Nivel 3 = nice-to-have):

  -- Nivel 1 (0.56): lo que usas todos los días --
  stroad_geo        0.24    "calle tranquila": OSM polyline distance, exp decay
                            65m half-life, severity-weighted
  commerce          0.20    bodega/super/botica/resto a pie: amenity nodes <400m
  connectivity      0.12    commute (genérico): nearest L2 station + destination

  -- Nivel 2 (0.30): importante, no de uso diario --
  park              0.14    nearest park distance, exp decay 200m half-life
  health            0.09    acceso a salud: nearest pharmacy/clinic within 600m
  modernity         0.07    "la casa en sí" (proxy): 1 - (antiquity / 15)

  -- Nivel 3 (0.14): suma, no decisivo --
  crossings         0.06    caminable y seguro (proxy): ped crossings <200m
  bus               0.04    acceso a transporte: bus stops within 250m
  value             0.04    discount as price/m² falls below ~$2,400

Backlog (sin dato aún): seguridad, servicios (agua/luz), colegios, club social,
mall, ciclovía, tejido social, riesgo sísmico. Ver roadmap.
"""

import argparse
import json
import math
import sys
from pathlib import Path

from shapely.geometry import LineString, Point

ROOT = Path(__file__).parent
DISTRICTS = ROOT / "districts.json"
# Set in main() from --district:
LISTINGS = None
OSM_FILE = None   # map_geo_<slug>.json (parques/avenidas/comercio/buses/salud/cruces)
OUT_FILE = None
FLOORS_CACHE = ROOT / "floors_cache.jsonl"   # compartido (solo PL tiene datos)

FLOOR_CAP = 25  # buildings taller than this are dropped (lifestyle: the live
# UI floor filter does the fine-grained narrowing; keep the hard cap generous)


PARKS = []  # poblado en load_osm() desde los parques de map_geo (centroides)

# Map OSM avenida names (as they appear in the data) to a severity tier.
# Anything not in this map gets MODERATE by default.
SEVERITY = {
    "Avenida Brasil": "SEVERE",
    "Avenida Universitaria": "SEVERE",
    "Avenida de La Marina": "SEVERE",
    "Avenida Colonial": "SEVERE",
    "Avenida Óscar R. Benavides": "SEVERE",
    "Avenida Antonio José de Sucre": "MODERATE",
    "Avenida Simón Bolivar": "MODERATE",
    "Avenida Mariano Cornejo": "MODERATE",
    "Avenida Manuel Cipriano Dulanto": "MODERATE",
    "Prolongación Avenida Mariscal José de la Mar": "MODERATE",
    "Avenida San Felipe": "MINOR",
    "Avenida del Río": "MINOR",
    "Avenida General Manuel L. Vivanco": "MINOR",
    "Avenida Paso de los Andes": "MINOR",
}
SEVERITY_WEIGHT = {"HIGH": 1.0, "SEVERE": 1.0, "MODERATE": 0.55, "MINOR": 0.25}

# Connectivity points kept inline (researched separately).
CONN_POINTS = [
    {"type": "metro", "name": "L2 - San Marcos", "lat": -12.05702, "lng": -77.08125},
    {"type": "metro", "name": "L2 - Elio", "lat": -12.06060, "lng": -77.07555},
    {"type": "metro", "name": "L2 - La Alborada", "lat": -12.06060, "lng": -77.06760},
    {"type": "metro", "name": "L2 - Tingo Maria", "lat": -12.06060, "lng": -77.05935},
    {"type": "metro", "name": "L2 - Parque Murillo", "lat": -12.06080, "lng": -77.04920},
    {"type": "metro", "name": "L2 - Plaza Bolognesi", "lat": -12.06093, "lng": -77.04203},
    {"type": "destination", "name": "CC Plaza San Miguel", "lat": -12.07694, "lng": -77.08272},
    {"type": "destination", "name": "PUCP", "lat": -12.06917, "lng": -77.07993},
    {"type": "destination", "name": "Plaza Vea Pueblo Libre", "lat": -12.07601, "lng": -77.06462},
    {"type": "destination", "name": "Hospital Santa Rosa", "lat": -12.07208, "lng": -77.06104},
    {"type": "destination", "name": "Real Plaza Salaverry", "lat": -12.08988, "lng": -77.05272},
]

# Exponential decay half-lives (in metres)
HL_PARK = 200
HL_STROAD = 65  # ~one Pueblo Libre block, matches CNOSSOS-EU ~6dB/block
HL_METRO = 600
HL_DEST = 500
HL_HEALTH = 300

STROAD_HARD_CUTOFF = 250  # beyond this, no stroad penalty


# -- geometry helpers ------------------------------------------------------

def m_per_deg(lat):
    return 111000.0, 111000.0 * math.cos(math.radians(lat))


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# Local equirectangular projection cached at PL latitude
_M_LAT, _M_LNG = m_per_deg(-12.075)


def project_point(lat, lng):
    return Point(lng * _M_LNG, lat * _M_LAT)


def project_line(geom):
    return LineString([(g["lon"] * _M_LNG, g["lat"] * _M_LAT) for g in geom])


def project_latlng_line(path):
    return LineString([(lng * _M_LNG, lat * _M_LAT) for lat, lng in path])


# -- OSM data load ---------------------------------------------------------

def load_osm():
    """Lee map_geo_<distrito>.json (un solo archivo OSM por distrito).
    Puebla el global PARKS desde los centroides de los parques, proyecta las
    avenidas con su severidad (HIGH/MODERATE por tipo de vía), y arma los nodos
    de scoring (comercio/buses/cruces como [lat,lng]; salud como puntos)."""
    global PARKS
    data = json.loads(OSM_FILE.read_text())

    PARKS = []
    for p in data.get("parks", []):
        poly = p.get("poly") or []
        if not poly:
            continue
        lat = sum(q[0] for q in poly) / len(poly)
        lng = sum(q[1] for q in poly) / len(poly)
        PARKS.append({"name": p.get("name") or "Parque", "lat": lat, "lng": lng})

    avenidas = []
    for s in data.get("stroads", []):
        path = s.get("path") or []
        if len(path) < 2:
            continue
        avenidas.append({
            "name": s.get("name") or "",
            "severity": s.get("severity") or "MODERATE",
            "line": project_latlng_line(path),
            "id": None,
        })

    nodes = {}
    for key in ("commerce", "bus", "crossings"):
        nodes[key] = [(q[0], q[1]) for q in data.get(key, [])
                      if isinstance(q, (list, tuple)) and len(q) >= 2]
    nodes["health"] = [(h["lat"], h["lng"]) for h in data.get("health", [])
                       if h.get("lat") is not None and h.get("lng") is not None]
    return avenidas, nodes


# -- amenity filter --------------------------------------------------------

# general_features.label values that signal a shared luxury amenity (we'd be
# paying maintenance for something we wouldn't use). Lowercased on compare.
LUXURY_FT = {
    "parrilla", "area de bbq", "área de bbq",
    "gimnasio",
    "piscina",
    "juegos infantiles",
    "sala de entretenimiento", "sala de estar", "sala de cine", "sala de juegos",
    "sala de eventos", "sala de reuniones", "sala de conferencia", "sala de computos",
    "salón de usos múltiples", "salon de usos multiples", "sum",
    "club house",
    "espacio de co-working", "coworking", "co-working",
    "areas verdes", "áreas verdes",
    "sky lounge",
    "sauna", "spa", "jacuzzi", "hidromasaje",
}

# Description-text keyword groups. A listing counts a "hit" once per group
# even if it mentions multiple synonyms in the same group.
LUXURY_KW = {
    "pool":      ["piscina", "alberca"],
    "gym":       ["gimnasio", "gym"],
    "sauna":     ["sauna"],
    "jacuzzi":   ["jacuzzi", "hidromasaje"],
    "events":    ["sala de eventos", "salon de eventos", "salón de eventos",
                  "sala social", "salon de fiestas", "salón de fiestas",
                  "sala de usos multiples", "salon de usos multiples", "sum "],
    "kids":      ["juegos infantiles", "parque infantil", "sala de juegos",
                  "kids area", "playroom", "playground"],
    "bbq":       ["parrilla", "parrillero", "bbq"],
    "skylounge": ["sky lounge", "skybar", "rooftop", "terraza panoramica",
                  "terraza panorámica", "terraza social", "mirador"],
    "coworking": ["coworking", "co-working"],
    "sports":    ["cancha deportiva", "canchas deportivas", "area deportiva",
                  "área deportiva"],
    "spa_yoga":  ["area de yoga", "área de yoga", "spa"],
    "cinema":    ["sala de cine", "home theater"],
}

LUXURY_THRESHOLD = 99  # luxury no longer excluded (comprehensive coverage); the
# score still down-weights as appropriate. Set lower again to re-enable the cut.


def count_luxury_features(general_features):
    if not general_features:
        return 0
    hits = set()
    for item in general_features:
        label = (item.get("label") or "").strip().lower()
        if label in LUXURY_FT:
            hits.add(label)
    return len(hits)


def load_floors_cache():
    if not FLOORS_CACHE.exists():
        return {}
    out = {}
    for line in FLOORS_CACHE.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        # last write wins if duplicates
        out[row["id"]] = row
    return out


def effective_building_height(r, floors_by_id):
    """Return (estimated_floors_lower_bound, source) for the building.

    Combines LLM-extracted building total / unit floor with the structured
    `general_features` "Número de pisos" / "Piso en el que se encuentra"
    values. For developer-site rows, also considers `building_total_floors`
    / `unit_floor` exposed directly on the row. Returns (None, None) if
    nothing is known.
    """
    candidates = []
    floor_row = floors_by_id.get(r.get("id")) if r.get("id") else None
    if floor_row and floor_row.get("confidence") in ("high", "medium"):
        if floor_row.get("building_total_floors"):
            candidates.append((floor_row["building_total_floors"], "llm_total"))
        if floor_row.get("unit_floor"):
            candidates.append((floor_row["unit_floor"], "llm_unit_floor"))

    # Developer-site fields exposed at row level
    if r.get("building_total_floors"):
        try:
            candidates.append((int(r["building_total_floors"]), "dev_total"))
        except (ValueError, TypeError):
            pass
    if r.get("unit_floor"):
        try:
            candidates.append((int(r["unit_floor"]), "dev_unit_floor"))
        except (ValueError, TypeError):
            pass

    for item in r.get("general_features") or []:
        label = (item.get("label") or "").strip().lower()
        v = item.get("value")
        try:
            n = int(v) if v else 0
        except (ValueError, TypeError):
            continue
        if n <= 0:
            continue
        if label == "número de pisos":
            candidates.append((n, "gf_numero_pisos"))
        elif label == "piso en el que se encuentra":
            candidates.append((n, "gf_piso_en_que_se_encuentra"))

    if not candidates:
        return None, None
    return max(candidates, key=lambda x: x[0])


def count_luxury_keywords(description):
    if not description:
        return 0
    text = description.lower()
    # collapse HTML breaks and entities crudely
    text = text.replace("<br>", " ").replace("<br/>", " ").replace("<br />", " ")
    hits = 0
    for group, words in LUXURY_KW.items():
        for w in words:
            if w in text:
                hits += 1
                break  # one hit per group
    return hits


# -- scoring ---------------------------------------------------------------

def parse_antiquity(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().lower()
    if "construc" in s or "estrenar" in s or s in ("0", "nuevo"):
        return 0
    try:
        return int(s.split()[0])
    except (ValueError, IndexError):
        return None


ACCEPTED_POSTING_TYPES = {
    "PROPERTY", "PROJECT", "PROJECT_UNIT", "DEVELOPMENT_UNIT", "DEVELOPMENT",
}


def normalize_developer_row(r):
    """Map developer-site field names to Urbania equivalents at read time.

    The original row is left untouched in fields it already has; we only fill
    in canonical aliases used by the scorer.
    """
    if r.get("source") != "developer_site":
        return r
    out = dict(r)
    # Aliases used downstream
    if not out.get("publisher_name"):
        out["publisher_name"] = out.get("developer_name") or out.get("project_name")
    if not out.get("images") and out.get("photos"):
        # photos is a list of urls; coerce to Urbania-shape [{url}]
        out["images"] = [{"url": p} for p in out.get("photos", []) if p]
    if "transaction" not in out or not out.get("transaction"):
        out["transaction"] = "venta"  # developer sites are always venta
    if not out.get("real_estate_type"):
        out["real_estate_type"] = "Departamento"
    if not out.get("antiquity"):
        # Project rows: brand new. Use "0" for under-construction or pre-sale.
        if out.get("project_status") in ("preventa", "en_construccion"):
            out["antiquity"] = 0
    # URL fallback
    if not out.get("url"):
        out["url"] = out.get("source_url")
    return out


def project_has_unit_children(project_id, all_rows):
    return any(r.get("is_unit_of") == project_id for r in all_rows)


def passes_hard_filter(r, floors_by_id, all_rows=None):
    if r.get("superseded_by"):
        return False
    pt = r.get("posting_type")
    if pt not in ACCEPTED_POSTING_TYPES:
        return False
    # PROJECT parents with unit children: drop the parent (units carry pricing)
    if pt == "PROJECT" and all_rows is not None:
        if project_has_unit_children(r.get("id"), all_rows):
            return False
    # PROJECT rows without unit children are still useful if they have pricing
    if r.get("transaction") and r.get("transaction") != "venta":
        return False
    rt = r.get("real_estate_type")
    if rt and rt not in ("Apartamento", "Casa", "Departamento"):
        return False
    # Bedrooms: 2+ required for Urbania PROPERTY rows; developer-site rows
    # often lack per-unit bedroom data, so don't reject them on null.
    br = r.get("bedrooms")
    if r.get("source") == "urbania":
        if (br or 0) < 1:
            return False
    else:
        if br is not None and br < 1:
            return False
    if r.get("lat") is None or r.get("lng") is None:
        return False
    # Require photos: every shown listing must have images (quality bar).
    if not (r.get("images") or r.get("photos")):
        return False
    # Price: prefer USD if available, else convert PEN at 3.7 (rough)
    price_usd = r.get("price_usd")
    if not price_usd and r.get("price_pen"):
        price_usd = r["price_pen"] / 3.7
    if r.get("source") == "urbania":
        if not price_usd or price_usd < 50_000:
            return False
    else:
        # Developer rows: allow missing price (PROJECT-level rows often lack it)
        if price_usd is not None and price_usd < 50_000:
            return False
    age = parse_antiquity(r.get("antiquity"))
    if age is not None and age > 30:
        return False
    # Luxury common-area filter: exclude if 2+ luxury amenities OR 2+ luxury
    # keyword groups in the description.
    ft_lux = count_luxury_features(r.get("general_features"))
    kw_lux = count_luxury_keywords(r.get("description"))
    if ft_lux >= LUXURY_THRESHOLD or kw_lux >= LUXURY_THRESHOLD:
        return False
    # Building-size filter: drop if known building height (or lower-bound
    # implied by the unit's floor) exceeds the cap. Unknown stays in.
    floors, _src = effective_building_height(r, floors_by_id)
    if floors is not None and floors > FLOOR_CAP:
        return False
    return True


def nearest_park(lat, lng):
    best, best_d = None, float("inf")
    for p in PARKS:
        d = haversine_m(lat, lng, p["lat"], p["lng"])
        if d < best_d:
            best_d, best = d, p
    return best, best_d


def stroad_impact(point, avenidas):
    """Sum severity-weighted exponential-decay penalties across all stroads."""
    total = 0.0
    nearest = (float("inf"), None, None, None)
    for a in avenidas:
        d = point.distance(a["line"])
        if d < nearest[0]:
            nearest = (d, a["name"], a["severity"], a["id"])
        if d > STROAD_HARD_CUTOFF:
            continue
        sw = SEVERITY_WEIGHT[a["severity"]]
        # exp(-d / (HL / ln(2))) -> half-life HL
        decay = math.exp(-d * math.log(2) / HL_STROAD)
        total += sw * decay
    return min(total, 1.0), nearest


def count_within(lat, lng, latlngs, radius_m):
    n = 0
    for plat, plng in latlngs:
        if haversine_m(lat, lng, plat, plng) <= radius_m:
            n += 1
    return n


def nearest_distance(lat, lng, latlngs):
    if not latlngs:
        return None
    return min(haversine_m(lat, lng, plat, plng) for plat, plng in latlngs)


def nearest_conn(lat, lng, kind):
    pts = [p for p in CONN_POINTS if p["type"] == kind]
    best, best_d = None, float("inf")
    for p in pts:
        d = haversine_m(lat, lng, p["lat"], p["lng"])
        if d < best_d:
            best_d, best = d, p
    return best, best_d


def log_norm(count, cap):
    """Log-scaled 0..1: count=0 -> 0, count>=cap -> 1."""
    if count <= 0:
        return 0.0
    return min(1.0, math.log1p(count) / math.log1p(cap))


def score(r, avenidas, nodes, floors_by_id):
    lat, lng = r["lat"], r["lng"]
    point = project_point(lat, lng)
    ft_lux = count_luxury_features(r.get("general_features"))
    kw_lux = count_luxury_keywords(r.get("description"))
    floor_row = floors_by_id.get(r["id"]) or {}
    floors_est, floors_src = effective_building_height(r, floors_by_id)

    # Park
    park, dist_park = nearest_park(lat, lng)
    park_score = math.exp(-dist_park * math.log(2) / HL_PARK)

    # Stroad geographic
    stroad_pen, stroad_near = stroad_impact(point, avenidas)
    stroad_score = 1.0 - stroad_pen

    # Connectivity
    metro, dist_metro = nearest_conn(lat, lng, "metro")
    dest, dist_dest = nearest_conn(lat, lng, "destination")
    metro_score = math.exp(-dist_metro * math.log(2) / HL_METRO) * 0.6
    dest_score = math.exp(-dist_dest * math.log(2) / HL_DEST)
    conn_score = 0.5 * metro_score + 0.5 * dest_score

    # Commerce density within 400m, log-scaled cap=25
    n_commerce = count_within(lat, lng, nodes["commerce"], 400)
    commerce_score = log_norm(n_commerce, 25)

    # Bus stops within 250m, cap=5
    n_bus = count_within(lat, lng, nodes["bus"], 250)
    bus_score = log_norm(n_bus, 5)

    # Healthcare nearest within 600m
    d_health = nearest_distance(lat, lng, nodes["health"])
    if d_health is None or d_health > 1000:
        health_score = 0.0
    else:
        health_score = math.exp(-d_health * math.log(2) / HL_HEALTH)

    # Crossings within 200m, cap=15
    n_cross = count_within(lat, lng, nodes["crossings"], 200)
    cross_score = log_norm(n_cross, 15)

    # Modernity
    age = parse_antiquity(r.get("antiquity"))
    modernity = 0.5 if age is None else max(0.0, 1 - age / 15)
    age_label = "Nuevo / a estrenar" if age == 0 else (
        f"{age} años" if age is not None else "?"
    )

    # Value (price/m² discount). Use USD if present, else convert PEN at 3.7
    price_usd_for_ppm = r.get("price_usd")
    if not price_usd_for_ppm and r.get("price_pen"):
        price_usd_for_ppm = r["price_pen"] / 3.7
    if r.get("area_total_m2") and r["area_total_m2"] > 10 and price_usd_for_ppm:
        ppm = price_usd_for_ppm / r["area_total_m2"]
        value = max(0.0, min(1.0, (2400 - ppm) / 1400))
    else:
        ppm = None
        value = 0.5

    composite = (
        # Nivel 1 (0.56): calle tranquila + comercio a pie + commute
        0.24 * stroad_score
        + 0.20 * commerce_score
        + 0.12 * conn_score
        # Nivel 2 (0.30): parque + salud + la casa
        + 0.14 * park_score
        + 0.09 * health_score
        + 0.07 * modernity
        # Nivel 3 (0.14): caminabilidad + transporte + valor
        + 0.06 * cross_score
        + 0.04 * bus_score
        + 0.04 * value
    )

    return {
        "composite": round(composite, 4),
        "park_name": park["name"] if park else None,
        "park_dist_m": round(dist_park),
        "park_score": round(park_score, 3),
        "stroad_nearest_name": stroad_near[1],
        "stroad_nearest_dist_m": round(stroad_near[0]) if stroad_near[0] < float("inf") else None,
        "stroad_nearest_severity": stroad_near[2],
        "stroad_pen": round(stroad_pen, 3),
        "stroad_score": round(stroad_score, 3),
        "metro_name": metro["name"] if metro else None,
        "metro_dist_m": round(dist_metro),
        "dest_name": dest["name"] if dest else None,
        "dest_dist_m": round(dist_dest),
        "conn_score": round(conn_score, 3),
        "n_commerce_400m": n_commerce,
        "commerce_score": round(commerce_score, 3),
        "n_bus_250m": n_bus,
        "bus_score": round(bus_score, 3),
        "health_dist_m": round(d_health) if d_health else None,
        "health_score": round(health_score, 3),
        "n_crossings_200m": n_cross,
        "cross_score": round(cross_score, 3),
        "age_label": age_label,
        "modernity": round(modernity, 3),
        "ppm_usd": round(ppm) if ppm else None,
        "value": round(value, 3),
        "luxury_ft": ft_lux,
        "luxury_kw": kw_lux,
        "building_floors_est": floors_est,
        "building_floors_src": floors_src,
        "llm_building_floors": floor_row.get("building_total_floors"),
        "llm_unit_floor": floor_row.get("unit_floor"),
        "llm_confidence": floor_row.get("confidence"),
    }


def main():
    global LISTINGS, OSM_FILE, OUT_FILE
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    args = ap.parse_args()
    LISTINGS = ROOT / f"listings_combined_{args.district}.jsonl"
    OSM_FILE = ROOT / f"map_geo_{args.district}.json"
    OUT_FILE = ROOT / f"ranking_{args.district}.jsonl"

    avenidas, nodes = load_osm()
    floors_by_id = load_floors_cache()
    print(
        f"Loaded OSM: {len(avenidas)} avenida segments, "
        f"{len(nodes['commerce'])} commerce, {len(nodes['bus'])} bus, "
        f"{len(nodes['health'])} health, {len(nodes['crossings'])} crossings; "
        f"floors_cache: {len(floors_by_id)} listings",
        file=sys.stderr,
    )

    rows = [json.loads(l) for l in LISTINGS.read_text().splitlines() if l.strip()]
    rows = [normalize_developer_row(r) for r in rows]
    candidates = [r for r in rows if passes_hard_filter(r, floors_by_id, rows)]
    print(
        f"Total listings: {len(rows)}, after hard filter: {len(candidates)}",
        file=sys.stderr,
    )

    scored = []
    for r in candidates:
        s = score(r, avenidas, nodes, floors_by_id)
        scored.append({**r, "_score": s})
    scored.sort(key=lambda x: -x["_score"]["composite"])

    with OUT_FILE.open("w") as f:
        for r in scored:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\n=== Top 20 picks (composite) ===\n", file=sys.stderr)
    for i, r in enumerate(scored[:20], 1):
        s = r["_score"]
        addr = (r.get("address") or "?")[:55]
        ppm = f"${s['ppm_usd']:,}/m²" if s["ppm_usd"] else "?"
        sev = s["stroad_nearest_severity"]
        stroad_str = f"{s['stroad_nearest_name']} ({s['stroad_nearest_dist_m']}m, {sev}) pen={s['stroad_pen']:.2f}"
        price_str = f"${r['price_usd']:,}" if r.get("price_usd") else (
            f"S/{r['price_pen']:,}" if r.get("price_pen") else "?"
        )
        src_str = r.get("source", "?")
        print(
            f"{i:2}. score={s['composite']:.3f}  {price_str}  "
            f"{r.get('area_total_m2', '?')}m²  {r.get('bedrooms')}BR  "
            f"age={s['age_label']}  ppm={ppm}  [{src_str}]",
            file=sys.stderr,
        )
        print(f"    addr: {addr}", file=sys.stderr)
        print(
            f"    park: {s['park_name']} ({s['park_dist_m']}m)  "
            f"stroad: {stroad_str}",
            file=sys.stderr,
        )
        print(
            f"    commerce@400m: {s['n_commerce_400m']}  bus@250m: {s['n_bus_250m']}  "
            f"health: {s['health_dist_m']}m  crossings@200m: {s['n_crossings_200m']}  "
            f"L2: {s['metro_name']} ({s['metro_dist_m']}m)",
            file=sys.stderr,
        )
        floors_str = (
            f"{s['building_floors_est']} ({s['building_floors_src']})"
            if s["building_floors_est"] is not None
            else "?"
        )
        llm_str = ""
        if s["llm_confidence"]:
            llm_str = (
                f" llm: total={s['llm_building_floors']} "
                f"unit={s['llm_unit_floor']} ({s['llm_confidence']})"
            )
        print(
            f"    floors: {floors_str}{llm_str}  "
            f"luxury: ft={s['luxury_ft']} kw={s['luxury_kw']}",
            file=sys.stderr,
        )
        print(f"    id: {r.get('id')}  url: {r.get('url') or r.get('source_url') or '?'}", file=sys.stderr)
        if r.get("id"):
            photo_dir = ROOT / "images" / r["id"]
            if photo_dir.exists():
                n = len(list(photo_dir.glob("*.jpg")))
                print(f"    photos: {n} in images/{r['id']}/", file=sys.stderr)
            elif r.get("photos"):
                print(f"    photos: {len(r['photos'])} (developer CDN)", file=sys.stderr)
        print(file=sys.stderr)

    print(f"Wrote {OUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
