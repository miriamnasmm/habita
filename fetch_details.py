#!/usr/bin/env python3
"""For each listing in listings_index.jsonl, fetch the detail page and
save it to details/<id>.html. Skip-if-exists. Polite pacing.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from curl_cffi import requests

ROOT = Path(__file__).parent
DISTRICTS = ROOT / "districts.json"
INDEX_FILE = None   # set in main() from --district
DETAILS_DIR = None

DELAY_S = 1.0
TIMEOUT = 30


def main():
    global INDEX_FILE, DETAILS_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    args = ap.parse_args()
    INDEX_FILE = ROOT / f"listings_index_{args.district}.jsonl"
    DETAILS_DIR = ROOT / f"details_{args.district}"
    DETAILS_DIR.mkdir(exist_ok=True)
    rows = [json.loads(l) for l in INDEX_FILE.read_text().splitlines() if l.strip()]
    print(f"Total listings to fetch: {len(rows)}", file=sys.stderr)

    session = requests.Session(impersonate="chrome")

    fetched = 0
    skipped = 0
    failed = []

    for i, row in enumerate(rows, 1):
        out = DETAILS_DIR / f"{row['id']}.html"
        if out.exists():
            skipped += 1
            continue

        try:
            r = session.get(row["url"], timeout=TIMEOUT)
            if r.status_code == 200:
                out.write_text(r.text)
                fetched += 1
            else:
                failed.append((row["id"], r.status_code))
                print(
                    f"[{i}/{len(rows)}] {row['id']}: HTTP {r.status_code}",
                    file=sys.stderr,
                )
        except Exception as e:
            failed.append((row["id"], str(e)))
            print(f"[{i}/{len(rows)}] {row['id']}: {e}", file=sys.stderr)

        if i % 25 == 0:
            print(
                f"[{i}/{len(rows)}] fetched={fetched} skipped={skipped} failed={len(failed)}",
                file=sys.stderr,
            )

        time.sleep(DELAY_S)

    print(
        f"\nDone. fetched={fetched} skipped={skipped} failed={len(failed)}",
        file=sys.stderr,
    )
    if failed:
        for f in failed[:20]:
            print(f"  fail: {f}", file=sys.stderr)


if __name__ == "__main__":
    main()
