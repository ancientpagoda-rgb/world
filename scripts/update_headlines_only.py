#!/usr/bin/env python3

import html
import json
import re
import time
import unicodedata
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

SPECIAL_ALIASES = {
    "CD": ["Democratic Republic of Congo", "DR Congo", "DRC", "Congo-Kinshasa"],
    "CG": ["Republic of Congo", "Congo-Brazzaville"],
    "EG": ["Egypt"],
    "FM": ["Federated States of Micronesia", "Micronesia"],
    "HK": ["Hong Kong"],
    "IR": ["Iran"],
    "KR": ["South Korea"],
    "KP": ["North Korea"],
    "LA": ["Laos", "Lao PDR"],
    "MO": ["Macao", "Macau"],
    "PS": ["West Bank and Gaza", "Palestine", "Palestinian territories"],
    "RU": ["Russia", "Russian Federation"],
    "SK": ["Slovak Republic", "Slovakia"],
    "TR": ["Turkiye", "Türkiye", "Turkey"],
    "US": ["United States", "U.S.", "USA"],
    "VE": ["Venezuela"],
    "VI": ["U.S. Virgin Islands", "Virgin Islands"],
    "VG": ["British Virgin Islands"],
    "MF": ["Saint Martin", "St. Martin French part"],
    "SX": ["Sint Maarten"],
    "LC": ["Saint Lucia", "St. Lucia"],
    "VC": ["Saint Vincent and the Grenadines", "St. Vincent and the Grenadines"],
    "KN": ["Saint Kitts and Nevis", "St. Kitts and Nevis"],
}

BLOCKED_SOURCES = {
    "instagram.com",
    "statista",
    "city.fukuoka.lg.jp",
    "futbol24",
    "dazn",
}

BAD_TITLE_PATTERNS = [
    r"\bvs\.?\b",
    r"\blive score\b",
    r"\bh2h\b",
    r"\bhead-to-head\b",
    r"\bfriendly|friendlies\b",
    r"\blive stream\b",
    r"\btravel guide\b",
    r"\bbest hotels\b",
    r"\bcanal saint martin\b",
    r"\bsaint martin lars\b",
]


def write_rows(rows):
    DATA_PATH.write_text(json.dumps(rows, ensure_ascii=False) + "\n", encoding="utf-8")


def strip_text(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def country_aliases(name: str, iso2: str) -> list[str]:
    aliases = [name]
    aliases.extend(SPECIAL_ALIASES.get(iso2, []))

    if "," in name:
        aliases.append(name.split(",", 1)[0])
    if "(" in name:
        aliases.append(re.sub(r"\s*\([^)]*\)", "", name).strip())
    if "St." in name:
        aliases.append(name.replace("St.", "Saint"))

    clean = []
    seen = set()
    for alias in aliases:
        alias = re.sub(r"\s+", " ", alias).strip()
        key = normalize_text(alias)
        if key and key not in seen:
            clean.append(alias)
            seen.add(key)
    return clean


def headline_is_usable(title: str, aliases: list[str]) -> bool:
    if re.match(r"^[a-z]+(?:-[a-z]+){2,}\s+-\s+", title.lower()):
        return False

    title_norm = normalize_text(title)
    source_norm = normalize_text(title.rsplit(" - ", 1)[-1] if " - " in title else "")

    if any(blocked in title.lower() or blocked in source_norm for blocked in BLOCKED_SOURCES):
        return False
    if any(re.search(pattern, title_norm, re.IGNORECASE) for pattern in BAD_TITLE_PATTERNS):
        return False

    return any(normalize_text(alias) in title_norm for alias in aliases)


def headline_matches_place(title: str, iso2: str, aliases: list[str]) -> bool:
    if not headline_is_usable(title, aliases):
        return False

    title_norm = normalize_text(title)
    if iso2 == "MF":
        return any(
            token in title_norm
            for token in [
                "saint martin french",
                "saint martin island",
                "sint maarten",
                "caribbean",
                "collectivite",
                "guadeloupe",
            ]
        )
    return True


def fetch_top_headline(name: str, iso2: str, language: str) -> tuple[str | None, str]:
    aliases = country_aliases(name, iso2)
    language_hint = f"{language}-{iso2}"

    for alias in aliases[:4]:
        query = urllib.parse.quote(f'"{alias}" when:30d')
        rss_url = (
            f"https://news.google.com/rss/search?q={query}&hl={language_hint}&gl={iso2}&ceid={iso2}:{language}"
        )
        request = urllib.request.Request(rss_url, headers=HEADERS)

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                root = ET.fromstring(response.read())
            channel = root.find("channel")
            if channel is None:
                continue
            for item in channel.findall("item"):
                title = item.findtext("title")
                if not title:
                    continue
                title = strip_text(title)
                if headline_matches_place(title, iso2, aliases):
                    return title, language
        except Exception:
            continue

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
        row["headline"] = headline
        row["language"] = headline_language
        if headline:
            updated += 1

        write_rows(rows)
        print(f"{index:03d}/{len(rows)} {name} [{row.get('language', 'en')}]", flush=True)
        time.sleep(0.08)

    print(f"Updated headlines for {updated} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
