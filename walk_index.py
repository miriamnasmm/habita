#!/usr/bin/env python3
"""Walk Urbania search-result pages for Pueblo Libre across all
(transaction, property-type) combinations, save raw HTML, and emit
listings_index.jsonl with one row per unique listing.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

from curl_cffi import requests

ROOT = Path(__file__).parent
DISTRICTS = ROOT / "districts.json"
# Set in main() from --district / districts.json:
INDEX_DIR = None
INDEX_FILE = None
DISTRICT = None

COMBOS = [
    ("venta", "departamentos"),
    ("venta", "casas"),
    ("venta", "terrenos"),
    ("alquiler", "departamentos"),
    ("alquiler", "casas"),
]

PAGE_DELAY_S = 1.5
MAX_PAGES = 40


def fetch_page(session, transaction, prop_type, page):
    slug = f"{transaction}-de-{prop_type}-en-{DISTRICT}"
    base = f"https://urbania.pe/buscar/{slug}"
    url = base if page == 1 else f"{base}?page={page}"
    r = session.get(url, timeout=30)
    return url, r


def parse_card_data(html):
    """Yield (id, url, posting_type) for each card on the page.

    Attribute order on the opening tag is not stable, so we scan the tag and
    pull each attribute independently.
    """
    tag_re = re.compile(r'<div[^>]*data-qa="posting [^"]*"[^>]*>', re.S)
    attr_id = re.compile(r'data-id="(\d+)"')
    attr_url = re.compile(r'data-to-posting="([^"]+)"')
    attr_type = re.compile(r'data-posting-type="([^"]+)"')
    for tag_m in tag_re.finditer(html):
        tag = tag_m.group(0)
        m_id = attr_id.search(tag)
        m_url = attr_url.search(tag)
        m_type = attr_type.search(tag)
        if not (m_id and m_url and m_type):
            continue
        yield m_id.group(1), m_url.group(1), m_type.group(1)


def total_posting(html):
    m = re.search(r'totalPosting"\s*:\s*"?(\d+)"?', html)
    return int(m.group(1)) if m else None


def walk_combo(session, transaction, prop_type, seen_ids):
    out_dir = INDEX_DIR / f"{transaction}-{prop_type}"
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    expected_total = None
    prev_ids = set()
    page = 1

    while page <= MAX_PAGES:
        url, r = fetch_page(session, transaction, prop_type, page)
        if r.status_code != 200:
            print(f"  page {page}: HTTP {r.status_code}, stopping", file=sys.stderr)
            break

        html = r.text
        if expected_total is None:
            expected_total = total_posting(html)
            print(
                f"  totalPosting={expected_total}",
                file=sys.stderr,
            )
            if expected_total == 0:
                print(f"  no listings for {transaction}/{prop_type}", file=sys.stderr)
                return rows

        page_file = out_dir / f"page-{page:02d}.html"
        page_file.write_text(html)

        cards = list(parse_card_data(html))
        ids_on_page = {c[0] for c in cards}
        new_vs_prev = ids_on_page - prev_ids
        new_global = ids_on_page - seen_ids

        for cid, curl, ptype in cards:
            if cid in seen_ids:
                continue
            seen_ids.add(cid)
            full_url = (
                curl if curl.startswith("http") else f"https://urbania.pe{curl.split('?')[0]}"
            )
            rows.append(
                {
                    "id": cid,
                    "url": full_url,
                    "posting_type": ptype,
                    "transaction": transaction,
                    "property_type": prop_type,
                    "source_page": page,
                }
            )

        print(
            f"  page {page}: {len(cards)} cards, {len(new_global)} new globally, "
            f"{len(new_vs_prev)} new vs prev",
            file=sys.stderr,
        )

        if page > 1 and not new_vs_prev:
            print(f"  no new IDs vs page {page - 1}; stopping", file=sys.stderr)
            break

        prev_ids = ids_on_page
        page += 1
        time.sleep(PAGE_DELAY_S)

    if expected_total is not None:
        unique_for_combo = sum(
            1 for r in rows if r["transaction"] == transaction and r["property_type"] == prop_type
        )
        print(
            f"  collected {unique_for_combo} unique IDs (expected {expected_total})",
            file=sys.stderr,
        )

    return rows


def main():
    global DISTRICT, INDEX_DIR, INDEX_FILE
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    args = ap.parse_args()
    cfg = json.loads(DISTRICTS.read_text())
    if args.district not in cfg:
        sys.exit(f"distrito '{args.district}' no está en districts.json ({list(cfg)})")
    DISTRICT = cfg[args.district]["urbania_slug"]
    INDEX_DIR = ROOT / f"index_{args.district}"
    INDEX_FILE = ROOT / f"listings_index_{args.district}.jsonl"
    print(f"Distrito: {cfg[args.district]['name']} -> {DISTRICT}", file=sys.stderr)

    INDEX_DIR.mkdir(exist_ok=True)
    session = requests.Session(impersonate="chrome")

    seen_ids = set()
    all_rows = []

    for transaction, prop_type in COMBOS:
        print(f"\n=== {transaction} / {prop_type} ===", file=sys.stderr)
        rows = walk_combo(session, transaction, prop_type, seen_ids)
        all_rows.extend(rows)

    with INDEX_FILE.open("w") as f:
        for row in all_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\n=== Summary ===", file=sys.stderr)
    print(f"Total unique listings: {len(all_rows)}", file=sys.stderr)
    by_combo = {}
    for r in all_rows:
        key = (r["transaction"], r["property_type"])
        by_combo[key] = by_combo.get(key, 0) + 1
    for (t, p), c in sorted(by_combo.items()):
        print(f"  {t}/{p}: {c}", file=sys.stderr)
    print(f"\nWrote {INDEX_FILE}", file=sys.stderr)


if __name__ == "__main__":
    main()
