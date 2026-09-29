#!/usr/bin/env python3

import html
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime
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
    "facebook.com",
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

SPORTS_TITLE_PATTERNS = [
    r"\bcricket\b",
    r"\bfootball\b",
    r"\bsoccer\b",
    r"\bbaseball\b",
    r"\bbasketball\b",
    r"\bhockey\b",
    r"\btennis\b",
    r"\brugby\b",
    r"\bgolf\b",
    r"\bboxing\b",
    r"\b(?:t20|odi)\b",
    r"\bmatch(?:es)?\b",
    r"\bscore\b",
    r"\b(?:semifinal|final|highlights?|medals?\s+tally)\b",
    r"\b(?:asian|olympic|commonwealth) games\b",
    r"\b(?:league|tournament|championship)\b",
    r"\b(?:goal|goals|wicket|wickets|innings|runs?)\b",
    r"\b(?:playing 11|starting xi|line[- ]?up)\b",
    r"क्रिकेट|फुटबॉल|मैच|टीम|सेमीफाइनल|फाइनल|गोल|विकेट|मेडल|पदक|एशियन गेम्स|खेल",
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
    if any(re.search(pattern, title, re.IGNORECASE) for pattern in SPORTS_TITLE_PATTERNS):
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


def normalize_pub_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OverflowError):
        return None


def fetch_top_headline(name: str, iso2: str, language: str) -> tuple[str | None, str | None, str | None, str]:
    aliases = country_aliases(name, iso2)
    language_hint = f"{language}-{iso2}"
    candidates = []

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
            for item_index, item in enumerate(channel.findall("item")):
                title = item.findtext("title")
                if not title:
                    continue
                title = strip_text(title)
                if headline_matches_place(title, iso2, aliases):
                    link = (item.findtext("link") or "").strip()
                    if not link.startswith("https://"):
                        link = None
                    published_at = normalize_pub_date(
                        item.findtext("pubDate")
                        or item.findtext("{http://purl.org/dc/elements/1.1/}date")
                    )
                    candidates.append((published_at or "", -item_index, title, link))
        except Exception:
            continue

    if candidates:
        published_at, _, title, link = max(candidates, key=lambda candidate: (candidate[0], candidate[1]))
        return title, link, published_at or None, language
    return None, None, None, language


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
        native_language = row.get("nativeLanguage") or row.get("language") or "en"
        if not name or not iso2:
            continue

        previous_headline = row.get("headline")
        previous_english = row.get("englishHeadline")
        previous_published_at = row.get("headlinePublishedAt")
        headline, headline_url, headline_published_at, headline_language = fetch_top_headline(name, iso2, native_language)
        # English headlines are filled by the offline Argos/NLLB stage after
        # this feed refresh. Never call an undocumented hosted translator here.
        english_headline = None
        if not english_headline and headline == previous_headline and previous_english:
            english_headline = previous_english
        row["headline"] = headline
        row["headlineUrl"] = headline_url
        row["headlinePublishedAt"] = headline_published_at or (
            previous_published_at if headline and headline == previous_headline else None
        )
        row["englishHeadline"] = english_headline or ("English translation unavailable" if headline else None)
        row["language"] = headline_language
        row["nativeLanguage"] = native_language
        if headline:
            updated += 1

        write_rows(rows)
        print(f"{index:03d}/{len(rows)} {name} [{row.get('language', 'en')}]", flush=True)
        time.sleep(0.08)

    print(f"Updated headlines for {updated} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
