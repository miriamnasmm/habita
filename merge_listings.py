#!/usr/bin/env python3
"""Merge Urbania listings + developer-site projects into listings_combined.jsonl.

- Attaches lat/lng to project rows from geocode_cache.jsonl (overrides take
  precedence).
- Adds `source` field ("urbania" or "developer_site") to every row.
- Dedup: a (developer_site, urbania) pair is considered the same building if
  haversine <= 50m OR normalized address matches. The Urbania row is tagged
  with `superseded_by: <developer_id>` (developer sites have first-party data).

Writes listings_combined.jsonl with the full union (no rows dropped).
"""

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
DISTRICTS = ROOT / "districts.json"
LISTINGS = None   # set in main() from --district
PROJECTS = None
OUT = None
CACHE = ROOT / "geocode_cache.jsonl"          # shared (project geocoding)
OVERRIDES = ROOT / "geocode_overrides.json"

PREFIX_RE = re.compile(
    r"\b(calle|jr\.?|jiron|jir[oó]n|av\.?|avenida|ca\.?|c\.|prolongaci[oó]n)\s+",
    re.IGNORECASE,
)
TRAIL_PL_RE = re.compile(r",?\s*(pueblo libre|lima|per[uú])\b", re.IGNORECASE)


def normalize_address(addr):
    if not addr:
        return ""
    s = addr.strip()
    s = re.sub(r"\([^)]*\)", "", s)
    s = TRAIL_PL_RE.sub("", s)
    while True:
        new = PREFIX_RE.sub("", s, count=1)
        if new == s:
            break
        s = new
    s = re.sub(r"[#]", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;-")
    return s.lower()


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def load_geocode():
    """Latest entry per (normalized_address, source_id), keyed by both."""
    by_pair = {}
    by_norm = {}
    if not CACHE.exists():
        return by_pair, by_norm
    for line in CACHE.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        by_pair[(r["normalized_address"], r.get("source_id"))] = r
        # keep first non-failed per norm
        existing = by_norm.get(r["normalized_address"])
        if existing is None or existing.get("confidence") == "failed":
            by_norm[r["normalized_address"]] = r
    return by_pair, by_norm


def main():
    global LISTINGS, PROJECTS, OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    args = ap.parse_args()
    LISTINGS = ROOT / f"listings_{args.district}.jsonl"
    PROJECTS = ROOT / f"projects_{args.district}.jsonl"
    OUT = ROOT / f"listings_combined_{args.district}.jsonl"

    listings = [json.loads(l) for l in LISTINGS.read_text().splitlines() if l.strip()]
    projects = ([json.loads(l) for l in PROJECTS.read_text().splitlines() if l.strip()]
                if PROJECTS.exists() else [])
    geo_pair, geo_norm = load_geocode()

    out_rows = []

    # Tag Urbania rows
    for r in listings:
        r = dict(r)
        r["source"] = r.get("source") or "urbania"
        r["superseded_by"] = None
        out_rows.append(r)

    # Tag project rows + join lat/lng
    for r in projects:
        r = dict(r)
        r["source"] = "developer_site"
        if not r.get("id"):
            continue  # skip rows with no id (extraction failures)
        norm = normalize_address(r.get("address") or "")
        # Try (norm, source_id) first, then fall back to norm-only
        geo = geo_pair.get((norm, r.get("source_id"))) or geo_norm.get(norm)
        if (
            geo
            and r.get("lat") is None
            and geo.get("lat") is not None
        ):
            r["lat"] = geo["lat"]
            r["lng"] = geo["lng"]
            r["geocode_confidence"] = geo.get("confidence")
            r["geocode_display_name"] = geo.get("display_name")
        out_rows.append(r)

    # Dedup pass: each developer row may supersede 0+ urbania rows
    urbania_rows = [r for r in out_rows if r["source"] == "urbania"]
    dev_rows = [r for r in out_rows if r["source"] == "developer_site"]
    superseded = 0

    for u in urbania_rows:
        u_norm = normalize_address(u.get("address") or "")
        for d in dev_rows:
            if u.get("superseded_by"):
                break
            d_norm = normalize_address(d.get("address") or "")
            address_match = bool(u_norm) and bool(d_norm) and u_norm == d_norm
            distance_match = False
            if (
                u.get("lat") is not None
                and d.get("lat") is not None
                and u.get("lng") is not None
                and d.get("lng") is not None
            ):
                dist = haversine_m(u["lat"], u["lng"], d["lat"], d["lng"])
                if dist <= 50:
                    distance_match = True
            if address_match or distance_match:
                u["superseded_by"] = d["id"]
                superseded += 1
                break

    with OUT.open("w") as f:
        for r in out_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    # Summary
    by_source = Counter(r["source"] for r in out_rows)
    by_pt = Counter(r.get("posting_type") for r in out_rows)
    print(f"Wrote {OUT} ({len(out_rows)} rows)", file=sys.stderr)
    print(f"  by source: {dict(by_source)}", file=sys.stderr)
    print(f"  by posting_type: {dict(by_pt)}", file=sys.stderr)
    print(f"  superseded urbania rows: {superseded}", file=sys.stderr)
    geocoded = sum(
        1 for r in out_rows if r["source"] == "developer_site" and r.get("lat") is not None
    )
    print(
        f"  developer rows with coords: {geocoded} of "
        f"{sum(1 for r in out_rows if r['source'] == 'developer_site')}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
