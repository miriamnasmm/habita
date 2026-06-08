#!/usr/bin/env python3
"""Parse details/<id>.html files into a flat listings.jsonl with all
the fields we care about: price, address, lat/lng, m², bedrooms, full
description, image gallery URLs, amenities, broker, status.
"""

import argparse
import base64
import html as html_module
import json
import re
import sys
from pathlib import Path

import json5
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
DISTRICTS = ROOT / "districts.json"
INDEX_FILE = None   # set in main() from --district
DETAILS_DIR = None
OUT_FILE = None


def extract_balanced(html, var_name):
    """Extract balanced { ... } following `<var_name> = `."""
    idx = html.find(var_name)
    if idx == -1:
        return None
    start = html.find("{", idx)
    if start == -1:
        return None
    depth = 0
    i = start
    in_string = False
    escape = False
    quote = None
    while i < len(html):
        c = html[i]
        if escape:
            escape = False
        elif c == "\\":
            escape = True
        elif in_string:
            if c == quote:
                in_string = False
        else:
            if c in "\"'":
                in_string = True
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return html[start : i + 1]
        i += 1
    return None


def page_vars(html):
    """Pull mapLatOf / mapLngOf / urlMapOf string assignments."""
    out = {}
    for var in ("mapLatOf", "mapLngOf", "urlMapOf"):
        m = re.search(rf"\b{var}\s*=\s*\"([^\"]*)\"", html)
        out[var] = m.group(1) if m else None
    return out


def parse_aviso_info(html):
    block = extract_balanced(html, "avisoInfo")
    if not block:
        return None
    block = html_module.unescape(block)
    pv = page_vars(html)
    for k, v in pv.items():
        block = re.sub(rf"\b{k}\b", f'"{v}"' if v else "null", block)
    try:
        return json5.loads(block)
    except Exception:
        return None


def fallback_from_jsonld_and_regex(html, listing_id):
    """For pages where avisoInfo has unescaped quotes inside descriptions and
    fails the JS parser. Pull what we can from JSON-LD plus targeted regexes.
    """
    aviso = {}
    jl = extract_jsonld_apartment(html) or {}
    addr = jl.get("address") or {}
    floor = jl.get("floorSize") or {}

    aviso["postingType"] = "PROPERTY"
    aviso["postingTitle"] = jl.get("name")
    aviso["description"] = jl.get("description")
    aviso["address"] = {"name": addr.get("streetAddress"), "visibility": None}
    aviso["partialPhone"] = jl.get("telephone")

    aviso["mainFeatures"] = {
        "CFT100": {"value": floor.get("value")} if floor.get("value") else {},
        "CFT2": {"value": jl.get("numberOfBedrooms")} if jl.get("numberOfBedrooms") else {},
        "CFT3": {"value": jl.get("numberOfBathroomsTotal")} if jl.get("numberOfBathroomsTotal") else {},
    }
    aviso["location"] = {
        "name": addr.get("addressRegion"),
        "label": "ZONA",
        "parent": None,
    }

    # Pictures: gather all naventcdn URLs that match this listing id, pick largest per photoId
    aviso["pictures"] = _pictures_from_regex(html, listing_id)

    # Lat/lng: try base64 vars
    pv = page_vars(html)
    aviso["mapLat"] = pv.get("mapLatOf")
    aviso["mapLng"] = pv.get("mapLngOf")
    aviso["urlMap"] = pv.get("urlMapOf")

    # Price: try DOM (look for "S/ NNN,NNN" patterns near price markers)
    pen, usd = _price_from_html(html)
    if pen or usd:
        prices = []
        if pen:
            prices.append({"isoCode": "PEN", "amount": pen})
        if usd:
            prices.append({"isoCode": "USD", "amount": usd})
        aviso["pricesData"] = [{"prices": prices, "operationType": {"name": "venta"}}]

    aviso["status"] = "ONLINE"
    aviso["_fallback"] = True
    return aviso


def _pictures_from_regex(html, listing_id):
    """Group naventcdn image URLs by photoId, prefer 1200x1200."""
    # listing_id 148086599 -> path segment 01/48/08/65/99 (split id into pairs from the end with leading prefix '01')
    # Pattern: /avisos/(resize/)?111/01/<6 chars/2-byte segments>/<size>/<photoId>.jpg
    pat = re.compile(
        r'https://img10\.naventcdn\.com/avisos/(?:resize/)?111/[\d/]+/(?P<size>\d+x\d+)/(?P<photo>\d+)\.jpg'
    )
    by_photo = {}
    for m in pat.finditer(html):
        photo = m.group("photo")
        url = m.group(0)
        size = m.group("size")
        rank = {"1200x1200": 5, "720x532": 4, "730x532": 4, "360x266": 3, "215x159": 2, "100x75": 1}.get(size, 0)
        cur = by_photo.get(photo)
        if not cur or rank > cur[0]:
            by_photo[photo] = (rank, url, size)
    pictures = []
    for i, (photo, (_, url, size)) in enumerate(sorted(by_photo.items())):
        pictures.append({"order": i, f"url{size}": url})
    return pictures


def _price_from_html(html):
    """Extract PEN and USD price amounts from raw HTML."""
    pen = usd = None
    m = re.search(r'S/\s*([\d,]+)', html)
    if m:
        try:
            pen = int(m.group(1).replace(",", ""))
        except ValueError:
            pass
    m = re.search(r'USD\s*([\d,]+)', html)
    if m:
        try:
            usd = int(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return pen, usd


def b64decode_safe(s):
    if not s:
        return None
    try:
        return base64.b64decode(s).decode("utf-8")
    except Exception:
        return None


def extract_jsonld_apartment(html):
    soup = BeautifulSoup(html, "lxml")
    for s in soup.find_all("script", type="application/ld+json"):
        if not s.string:
            continue
        try:
            data = json.loads(s.string)
        except json.JSONDecodeError:
            continue
        if data.get("@type") in (
            "Apartment",
            "House",
            "SingleFamilyResidence",
            "Residence",
        ):
            return data
    return None


def main_feat(mf, key):
    v = (mf or {}).get(key, {}).get("value")
    if v is None or v == "":
        return None
    try:
        return float(v) if "." in str(v) else int(v)
    except (ValueError, TypeError):
        return v


def flatten_location(loc):
    """Walk the linked-list location chain and return a dict by depth-label."""
    out = {}
    cur = loc
    while cur:
        label = cur.get("label", "").lower()
        out[label] = cur.get("name")
        cur = cur.get("parent")
    return out


def flatten_features(gf):
    """generalFeatures -> flat list of {category, feature, value}."""
    out = []
    for cat, items in (gf or {}).items():
        if not isinstance(items, dict):
            continue
        for fid, info in items.items():
            out.append(
                {
                    "category": cat,
                    "label": info.get("label"),
                    "value": info.get("value"),
                }
            )
    return out


def best_picture_urls(pictures):
    """Return list of {order, url, all_sizes} for each picture, largest first."""
    out = []
    for p in pictures or []:
        sizes = {
            k.replace("url", "").replace("resize", "").lstrip("Url"): v
            for k, v in p.items()
            if isinstance(v, str) and "naventcdn.com" in v
        }
        # prefer 1200x1200 (largest), then 720x532
        url = (
            p.get("url1200x1200")
            or p.get("resizeUrl1200x1200")
            or p.get("url720x532")
            or p.get("url730x532")
            or p.get("url360x266")
        )
        out.append(
            {
                "order": p.get("order"),
                "url": url,
                "sizes": sizes,
            }
        )
    out.sort(key=lambda x: x["order"] if x["order"] is not None else 9999)
    return out


def parse_property(aviso, jsonld, listing_id, source_url, source_meta):
    """Single PROPERTY listing -> flat record."""
    # Price: prefer pricesData (structured)
    pen_amt = usd_amt = None
    for op in aviso.get("pricesData", []) or []:
        for price in op.get("prices", []):
            if price.get("isoCode") == "PEN":
                pen_amt = price.get("amount")
            elif price.get("isoCode") == "USD":
                usd_amt = price.get("amount")

    mf = aviso.get("mainFeatures") or {}
    geo = (aviso.get("postingGeolocation") or {}).get("geolocation") or {}

    # Lat/lng: try base64 mapLat first, then postingGeolocation
    lat = b64decode_safe(aviso.get("mapLat")) or geo.get("latitude")
    lng = b64decode_safe(aviso.get("mapLng")) or geo.get("longitude")

    addr = aviso.get("address") or {}
    loc_chain = flatten_location(aviso.get("location") or {})

    pubdate = aviso.get("publicationDateFormatted")

    # Pictures
    pics = best_picture_urls(aviso.get("pictures") or [])

    # JSON-LD fallback for some scalars
    jl = jsonld or {}
    jl_addr = jl.get("address") or {}

    publisher = aviso.get("publisher") or {}

    return {
        "id": listing_id,
        "url": source_url,
        "posting_type": aviso.get("postingType"),
        "transaction": source_meta.get("transaction"),
        "property_type_input": source_meta.get("property_type"),
        "real_estate_type": (aviso.get("realEstateType") or {}).get("name"),
        "status": aviso.get("status"),
        "reserved": aviso.get("reserved"),
        "title": aviso.get("postingTitle") or aviso.get("generatedTitle"),
        "posting_code": aviso.get("postingCode"),
        # price
        "price_pen": pen_amt,
        "price_usd": usd_amt,
        "price_display": aviso.get("price"),
        "expenses": aviso.get("expenses"),
        # area / bedrooms / bathrooms / parking / antiquity
        "area_total_m2": main_feat(mf, "CFT100"),
        "area_covered_m2": main_feat(mf, "CFT101"),
        "bedrooms": main_feat(mf, "CFT2"),
        "bathrooms": main_feat(mf, "CFT3"),
        "half_baths": main_feat(mf, "CFT4"),
        "antiquity": main_feat(mf, "CFT5"),
        "parking": main_feat(mf, "CFT7"),
        # location
        "address": addr.get("name"),
        "address_visibility": addr.get("visibility"),
        "subzona": loc_chain.get("subzona"),
        "zona": loc_chain.get("zona"),
        "ciudad": loc_chain.get("ciudad"),
        "provincia": loc_chain.get("provincia"),
        "pais": loc_chain.get("pais"),
        "lat": float(lat) if lat else None,
        "lng": float(lng) if lng else None,
        # description
        "description": aviso.get("description"),
        "description_jsonld": jl.get("description"),
        # publisher / contact
        "publisher_name": publisher.get("name"),
        "publisher_id": publisher.get("publisherId") or publisher.get("id"),
        "publisher_phone": aviso.get("partialPhone") or publisher.get("partialPhone"),
        "publisher_whatsapp": aviso.get("whatsApp"),
        "publisher_url": publisher.get("url"),
        "telephone_jsonld": jl.get("telephone"),
        # amenities / extra features
        "general_features": flatten_features(aviso.get("generalFeatures")),
        # publication / status
        "publication_date": pubdate,
        "publication_area_id": aviso.get("publicationAreaId"),
        # images
        "image_count": len(pics),
        "images": pics,
        "url_map": b64decode_safe(aviso.get("urlMap")),
        # source
        "source_search_pages": source_meta.get("source_pages", []),
    }


def parse_development(aviso, jsonld, dev_id, source_url, source_meta):
    """DEVELOPMENT listing -> one row + per-unit rows."""
    rows = []
    units = aviso.get("units") or []
    base = {
        "development_id": dev_id,
        "development_url": source_url,
        "development_title": aviso.get("postingTitle") or aviso.get("generatedTitle"),
        "transaction": source_meta.get("transaction"),
        "property_type_input": source_meta.get("property_type"),
        "real_estate_type": (aviso.get("realEstateType") or {}).get("name"),
        "publisher_name": (aviso.get("publisher") or {}).get("name"),
        "publisher_id": (aviso.get("publisher") or {}).get("publisherId")
        or (aviso.get("publisher") or {}).get("id"),
        "publisher_url": (aviso.get("publisher") or {}).get("url"),
        "address": (aviso.get("address") or {}).get("name"),
        "publication_date": aviso.get("publicationDateFormatted"),
    }

    # The development "header" itself
    pics = best_picture_urls(aviso.get("pictures") or [])
    rows.append(
        {
            "id": dev_id,
            "url": source_url,
            "posting_type": "DEVELOPMENT",
            "is_unit_of": None,
            "title": aviso.get("postingTitle") or aviso.get("generatedTitle"),
            "image_count": len(pics),
            "images": pics,
            "description": aviso.get("description"),
            "subzona": flatten_location(aviso.get("location") or {}).get("subzona"),
            "zona": flatten_location(aviso.get("location") or {}).get("zona"),
            **base,
        }
    )
    for unit in units:
        upics = best_picture_urls(unit.get("pictures") or [])
        umf = unit.get("mainFeatures") or {}
        pen_amt = usd_amt = None
        for op in unit.get("priceOperationTypes", []) or []:
            for price in op.get("prices", []) or []:
                if price.get("isoCode") == "PEN":
                    pen_amt = price.get("amount")
                elif price.get("isoCode") == "USD":
                    usd_amt = price.get("amount")
        upgeo = (unit.get("postingGeolocation") or {}).get("geolocation") or {}
        uaddr = (unit.get("postingLocation") or {}).get("address") or {}
        uloc = (unit.get("postingLocation") or {}).get("location") or {}
        rows.append(
            {
                "id": unit.get("postingId"),
                "url": f"https://urbania.pe{unit.get('url', '')}" if unit.get("url") else None,
                "posting_type": "DEVELOPMENT_UNIT",
                "is_unit_of": dev_id,
                "title": unit.get("title"),
                "posting_code": unit.get("postingCode"),
                "price_pen": pen_amt,
                "price_usd": usd_amt,
                "expenses": unit.get("expenses"),
                "area_total_m2": main_feat(umf, "CFT100"),
                "area_covered_m2": main_feat(umf, "CFT101"),
                "bedrooms": main_feat(umf, "CFT2"),
                "bathrooms": main_feat(umf, "CFT3"),
                "antiquity": main_feat(umf, "CFT5"),
                "parking": main_feat(umf, "CFT7"),
                "address": uaddr.get("name"),
                "subzona": (uloc or {}).get("name"),
                "lat": upgeo.get("latitude"),
                "lng": upgeo.get("longitude"),
                "description": unit.get("description"),
                "image_count": len(upics),
                "images": upics,
                **base,
            }
        )
    return rows


def main():
    global INDEX_FILE, DETAILS_DIR, OUT_FILE
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    args = ap.parse_args()
    INDEX_FILE = ROOT / f"listings_index_{args.district}.jsonl"
    DETAILS_DIR = ROOT / f"details_{args.district}"
    OUT_FILE = ROOT / f"listings_{args.district}.jsonl"
    index_rows = [
        json.loads(l) for l in INDEX_FILE.read_text().splitlines() if l.strip()
    ]
    index_by_id = {r["id"]: r for r in index_rows}

    detail_files = sorted(DETAILS_DIR.glob("*.html"))
    print(f"Detail HTML files: {len(detail_files)}", file=sys.stderr)

    output_rows = []
    parse_failures = []

    for f in detail_files:
        listing_id = f.stem
        meta = index_by_id.get(listing_id, {})
        source_url = meta.get("url") or f"https://urbania.pe/inmueble/.../{listing_id}"

        html = f.read_text()
        aviso = parse_aviso_info(html)
        used_fallback = False
        if not aviso:
            aviso = fallback_from_jsonld_and_regex(html, listing_id)
            used_fallback = True
            if not aviso.get("postingTitle") and not aviso.get("description"):
                parse_failures.append(listing_id)
                continue

        jsonld = extract_jsonld_apartment(html)

        try:
            if (
                aviso.get("postingType") == "DEVELOPMENT"
                or meta.get("posting_type") == "DEVELOPMENT"
            ):
                rows = parse_development(aviso, jsonld, listing_id, source_url, meta)
                output_rows.extend(rows)
            else:
                row = parse_property(aviso, jsonld, listing_id, source_url, meta)
                output_rows.append(row)
        except Exception as e:
            parse_failures.append((listing_id, str(e)))
            continue

    # write output
    with OUT_FILE.open("w") as out:
        for row in output_rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\n=== Summary ===", file=sys.stderr)
    print(f"Parsed listings: {len(output_rows)}", file=sys.stderr)
    print(f"Parse failures: {len(parse_failures)}", file=sys.stderr)
    if parse_failures:
        for f in parse_failures[:10]:
            print(f"  fail: {f}", file=sys.stderr)
    # quick stats
    types = {}
    for r in output_rows:
        types[r.get("posting_type")] = types.get(r.get("posting_type"), 0) + 1
    print(f"By posting_type: {types}", file=sys.stderr)
    print(f"With price_usd: {sum(1 for r in output_rows if r.get('price_usd'))}/{len(output_rows)}", file=sys.stderr)
    print(f"With lat/lng: {sum(1 for r in output_rows if r.get('lat'))}/{len(output_rows)}", file=sys.stderr)
    print(f"With images: {sum(1 for r in output_rows if r.get('image_count'))}/{len(output_rows)}", file=sys.stderr)
    img_total = sum(r.get('image_count') or 0 for r in output_rows)
    print(f"Total images across all listings: {img_total}", file=sys.stderr)
    print(f"Wrote {OUT_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
