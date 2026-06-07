#!/usr/bin/env python3

import html
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "world-data.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (WorldHeadlineUpdater/1.0)",
    "Accept": "application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
}


def write_rows(rows):
    DATA_PATH.write_text(json.dumps(rows, ensure_ascii=False) + "\n", encoding="utf-8")


def strip_text(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fetch_top_headline(name: str, iso2: str, language: str) -> tuple[str | None, str]:
    query = urllib.parse.quote(name)
    language_hint = f"{language}-{iso2}"
    rss_url = (
        f"https://news.google.com/rss/search?q={query}&hl={language_hint}&gl={iso2}&ceid={iso2}:{language}"
    )
    request = urllib.request.Request(rss_url, headers=HEADERS)

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            root = ET.fromstring(response.read())
        channel = root.find("channel")
        if channel is None:
            return None, language
        items = channel.findall("item")
        if not items:
            return None, language
        title = items[0].findtext("title")
        if not title:
            return None, language
        return strip_text(title), language
    except Exception:
        if language != "en":
            return fetch_top_headline(name, iso2, "en")
        return None, language


def main() -> int:
    rows = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("world-data.json is not a list")

    updated = 0
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        iso2 = row.get("iso2")
        language = row.get("language") or "en"
        if not name or not iso2:
            continue

        headline, headline_language = fetch_top_headline(name, iso2, language)
        if headline:
            row["headline"] = headline
            row["language"] = headline_language
            updated += 1

        write_rows(rows)
        print(f"{index:03d}/{len(rows)} {name} [{row.get('language', 'en')}]", flush=True)
        time.sleep(0.08)

    print(f"Updated headlines for {updated} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
