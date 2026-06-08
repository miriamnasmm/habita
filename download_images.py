#!/usr/bin/env python3
"""Walk listings.jsonl and download every image to images/<listing_id>/.
Skip-if-exists. Polite throttle. Errors logged but not fatal.
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

from curl_cffi import requests

ROOT = Path(__file__).parent
LISTINGS = None   # set in main() from --district
IMAGES_DIR = ROOT / "images"

WORKERS = 8  # CDN images, polite parallelism
TIMEOUT = 30


def url_to_filename(url, order):
    base = url.rsplit("/", 1)[-1].split("?")[0]
    return f"{order:03d}-{base}"


_lock = Lock()
_counters = {"fetched": 0, "skipped": 0, "failed": 0}
_failures = []


def download_one(job):
    lid, order, url = job
    ldir = IMAGES_DIR / lid
    ldir.mkdir(parents=True, exist_ok=True)
    out = ldir / url_to_filename(url, order)
    if out.exists() and out.stat().st_size > 0:
        with _lock:
            _counters["skipped"] += 1
        return
    try:
        r = requests.get(url, timeout=TIMEOUT, impersonate="chrome")
        if r.status_code == 200 and r.content:
            out.write_bytes(r.content)
            with _lock:
                _counters["fetched"] += 1
        else:
            with _lock:
                _counters["failed"] += 1
                _failures.append((url, r.status_code))
    except Exception as e:
        with _lock:
            _counters["failed"] += 1
            _failures.append((url, str(e)))


def main():
    global LISTINGS
    ap = argparse.ArgumentParser()
    ap.add_argument("--district", default="pueblo-libre", help="slug en districts.json")
    args = ap.parse_args()
    LISTINGS = ROOT / f"listings_{args.district}.jsonl"
    rows = [json.loads(l) for l in LISTINGS.read_text().splitlines() if l.strip()]
    print(f"Total listings: {len(rows)}", file=sys.stderr)

    jobs = []
    for r in rows:
        lid = r["id"]
        for img in r.get("images") or []:
            url = img.get("url")
            if not url:
                continue
            jobs.append((lid, img.get("order") or 0, url))

    print(f"Total images to download: {len(jobs)}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(download_one, j) for j in jobs]
        for i, _ in enumerate(as_completed(futures), 1):
            if i % 200 == 0:
                with _lock:
                    print(
                        f"[{i}/{len(jobs)}] fetched={_counters['fetched']} "
                        f"skipped={_counters['skipped']} failed={_counters['failed']}",
                        file=sys.stderr,
                    )

    print(
        f"\nDone. fetched={_counters['fetched']} skipped={_counters['skipped']} "
        f"failed={_counters['failed']}",
        file=sys.stderr,
    )
    if _failures:
        print(f"\nFirst 10 failures:", file=sys.stderr)
        for f in _failures[:10]:
            print(f"  {f}", file=sys.stderr)


if __name__ == "__main__":
    main()
