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
OUTPUT_PATH = ROOT / "world-data.json"

WORLD_BANK_COUNTRIES = "https://api.worldbank.org/v2/country/all?format=json&per_page=400"
WORLD_BANK_POPULATION = (
    "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1"
)
REST_COUNTRIES = "https://restcountries.com/v3.1/all?fields=cca2,languages"

LANGUAGE_MAP = {
    "afr": "af",
    "amh": "am",
    "ara": "ar",
    "aze": "az",
    "bel": "be",
    "ben": "bn",
    "bos": "bs",
    "bul": "bg",
    "cat": "ca",
    "ces": "cs",
    "cym": "cy",
    "dan": "da",
    "deu": "de",
    "ell": "el",
    "eng": "en",
    "est": "et",
    "fas": "fa",
    "fin": "fi",
    "fra": "fr",
    "gle": "ga",
    "guj": "gu",
    "heb": "he",
    "hin": "hi",
    "hrv": "hr",
    "hun": "hu",
    "hye": "hy",
    "ind": "id",
    "isl": "is",
    "ita": "it",
    "jpn": "ja",
    "kat": "ka",
    "kaz": "kk",
    "khm": "km",
    "kin": "rw",
    "kir": "ky",
    "kor": "ko",
    "lao": "lo",
    "lav": "lv",
    "lit": "lt",
    "mkd": "mk",
    "mlg": "mg",
    "mon": "mn",
    "msa": "ms",
    "mya": "my",
    "nep": "ne",
    "nld": "nl",
    "nor": "no",
    "pan": "pa",
    "pol": "pl",
    "por": "pt",
    "ron": "ro",
    "rus": "ru",
    "slk": "sk",
    "slv": "sl",
    "som": "so",
    "spa": "es",
    "sqi": "sq",
    "srp": "sr",
    "swa": "sw",
    "swe": "sv",
    "tam": "ta",
    "tgk": "tg",
    "tha": "th",
    "tir": "ti",
    "tuk": "tk",
    "tur": "tr",
    "ukr": "uk",
    "urd": "ur",
    "uzb": "uz",
    "vie": "vi",
    "zho": "zh",
}

LANGUAGE_OVERRIDE = {
    "IN": "hi",
    "PK": "ur",
    "BD": "bn",
    "ET": "am",
    "KE": "sw",
    "TZ": "sw",
    "NP": "ne",
    "LK": "si",
    "MM": "my",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (WorldBuilder/1.0)",
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


def fetch_json(url: str):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def choose_language(iso2: str, languages: dict | None) -> str:
    if iso2 in LANGUAGE_OVERRIDE:
        return LANGUAGE_OVERRIDE[iso2]

    if not languages:
        return "en"

    keys = list(languages.keys())
    non_english = [key for key in keys if key != "eng" and key in LANGUAGE_MAP]
    if non_english:
        return LANGUAGE_MAP[non_english[0]]

    for key in keys:
        if key in LANGUAGE_MAP:
            return LANGUAGE_MAP[key]

    return "en"


def strip_html(text: str) -> str:
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


def fetch_top_headline(name: str, iso2: str, language: str) -> tuple[str | None, str | None, str]:
    aliases = country_aliases(name, iso2)
    language_hint = f"{language}-{iso2}"

    for alias in aliases[:4]:
        query = urllib.parse.quote(f'"{alias}" when:30d')
        rss_url = (
            f"https://news.google.com/rss/search?q={query}&hl={language_hint}&gl={iso2}&ceid={iso2}:{language}"
        )
        request = urllib.request.Request(rss_url, headers=HEADERS)

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                xml_bytes = response.read()
            root = ET.fromstring(xml_bytes)
            channel = root.find("channel")
            if channel is None:
                continue
            for item in channel.findall("item"):
                title = item.findtext("title")
                if not title:
                    continue
                title = strip_html(title)
                if headline_matches_place(title, iso2, aliases):
                    return title, language
        except Exception:
            continue

    return None, language


def fetch_wikipedia_summary(name: str) -> str | None:
    """Fetch Wikipedia summary in English."""
    query = urllib.parse.quote(name.replace(" ", "_"))
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{query}"
    request = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
        extract = data.get("extract", "")
        return extract.strip() if extract else None
    except Exception:
        return None


def fetch_wikipedia_summary_in_lang(name: str, lang: str) -> str | None:
    """Fetch Wikipedia summary for a country in the specified language.
    Falls back to English if the target language is unavailable."""
    if not lang or lang == "en":
        return fetch_wikipedia_summary(name)

    # Step 1: get the page title in the target language via interlanguage links
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": name,
        "prop": "langlinks",
        "lllang": lang,
        "format": "json",
        "redirects": "1",
    })
    url = f"https://en.wikipedia.org/w/api.php?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
    except Exception:
        return fetch_wikipedia_summary(name)

    local_title = None
    pages = data.get("query", {}).get("pages", {})
    for page_id, page in pages.items():
        if page_id == "-1":
            continue
        langlinks = page.get("langlinks", [])
        if langlinks:
            local_title = langlinks[0]["*"]
        break

    if not local_title:
        return fetch_wikipedia_summary(name)

    # Step 2: fetch the summary from the local-language Wikipedia
    try:
        encoded = urllib.parse.quote(local_title.replace(" ", "_"))
        url2 = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded}"
        req2 = urllib.request.Request(url2, headers=HEADERS)
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            data2 = json.load(resp2)
        extract = data2.get("extract", "")
        if extract:
            return extract.strip()
    except Exception:
        pass

    return fetch_wikipedia_summary(name)


def main():
    meta_rows = fetch_json(WORLD_BANK_COUNTRIES)[1]
    population_rows = fetch_json(WORLD_BANK_POPULATION)[1]
    rest_countries = fetch_json(REST_COUNTRIES)

    meta_map = {
        row["iso2Code"]: row
        for row in meta_rows
        if row.get("region", {}).get("value") != "Aggregates"
    }
    rest_map = {row["cca2"]: row for row in rest_countries if "cca2" in row}

    countries = []
    for row in population_rows:
        iso2 = row["country"]["id"]
        if iso2 not in meta_map or row["value"] is None:
            continue

        countries.append(
            {
                "iso2": iso2,
                "iso3": row["countryiso3code"],
                "name": meta_map[iso2]["name"],
                "population": int(row["value"]),
                "year": row["date"],
                "languages": rest_map.get(iso2, {}).get("languages", {}),
            }
        )

    countries.sort(key=lambda item: item["population"], reverse=True)

    output = []
    for index, country in enumerate(countries, start=1):
        native_language = choose_language(country["iso2"], country["languages"])
        headline, headline_language = fetch_top_headline(country["name"], country["iso2"], native_language)
        description = fetch_wikipedia_summary_in_lang(country["name"], native_language)

        output.append(
            {
                "rank": index,
                "iso2": country["iso2"],
                "iso3": country["iso3"],
                "name": country["name"],
                "population": country["population"],
                "year": country["year"],
                "nativeLanguage": native_language,
                "language": headline_language,
                "headline": headline,
                "description": description,
            }
        )

        print(f"{index:03d}/{len(countries)} {country['name']} [{headline_language}]", flush=True)
        time.sleep(0.12)

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(output)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
