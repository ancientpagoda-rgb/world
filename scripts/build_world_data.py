#!/usr/bin/env python3

import io
import html
import json
import re
import time
import unicodedata
import tarfile
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
WORLD_COUNTRIES_TARBALL = "https://registry.npmjs.org/world-countries/-/world-countries-5.1.0.tgz"
COUNTRY_CODES_TARBALL = "https://registry.npmjs.org/country-codes-list/-/country-codes-list-3.1.1.tgz"

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
    "kal": "kl",
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
    "pap": "pap",
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
    "zho-hans": "zh",
    "zho-hant": "zh",
    "zho": "zh",
}

LANGUAGE_NAME_ALIASES = {
    "afrikaans": "af",
    "albanian": "sq",
    "amharic": "am",
    "arabic": "ar",
    "armenian": "hy",
    "austro bavarian german": "de",
    "aymara": "ay",
    "berber": "ber",
    "bosnian": "bs",
    "burmese": "my",
    "catalan": "ca",
    "castilian": "es",
    "chinese": "zh",
    "croatian": "hr",
    "czech": "cs",
    "dari": "fa",
    "dhivehi": "dv",
    "divehi": "dv",
    "dutch": "nl",
    "english": "en",
    "estonian": "et",
    "farsi": "fa",
    "fijian": "fj",
    "french": "fr",
    "fulah": "ff",
    "german": "de",
    "greek": "el",
    "greenlandic": "kl",
    "guarani": "gn",
    "guarani": "gn",
    "hassaniya": "ar",
    "hindi": "hi",
    "hungarian": "hu",
    "igbo": "ig",
    "irish": "ga",
    "italian": "it",
    "japanese": "ja",
    "khmer": "km",
    "korean": "ko",
    "kyrgyz": "ky",
    "lao": "lo",
    "latvian": "lv",
    "lithuanian": "lt",
    "maldivian": "dv",
    "macedonian": "mk",
    "moldavian": "ro",
    "montenegrin": "srp",
    "nepali": "ne",
    "pashto": "ps",
    "papiamento": "pap",
    "persian": "fa",
    "persian farsi": "fa",
    "polish": "pl",
    "portuguese": "pt",
    "quechua": "qu",
    "romanian": "ro",
    "russian": "ru",
    "scots gaelic": "gd",
    "serbian": "srp",
    "sinhala": "si",
    "slovak": "sk",
    "slovenian": "sl",
    "somali": "so",
    "spanish": "es",
    "sotho": "st",
    "swahili": "sw",
    "swati": "ss",
    "tamil": "ta",
    "tajik": "tg",
    "thai": "th",
    "tswana": "tn",
    "turkish": "tr",
    "turkmen": "tk",
    "ukrainian": "uk",
    "urdu": "ur",
    "uzbek": "uz",
    "valencian": "ca",
    "vietnamese": "vi",
    "xhosa": "xh",
    "yoruba": "yo",
    "zulu": "zu",
    "zhongwen": "zh",
    "zh-hans": "zh",
    "zh-hant": "zh",
}

COUNTRY_LANGUAGE_OVERRIDE = {
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


def fetch_tarball_json(url: str, member_path: str):
    request = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        member = archive.extractfile(member_path)
        if member is None:
            raise FileNotFoundError(member_path)
        return json.load(member)


def fetch_tarball_text(url: str, member_path: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": HEADERS["User-Agent"]})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        member = archive.extractfile(member_path)
        if member is None:
            raise FileNotFoundError(member_path)
        return member.read().decode("utf-8")


def normalize_language_code(code: str | None) -> str:
    if not code:
        return "en"
    return LANGUAGE_MAP.get(code.lower(), code.lower())


def normalize_language_name(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def load_country_language_sources():
    world_countries = fetch_tarball_json(WORLD_COUNTRIES_TARBALL, "package/countries.json")
    country_codes = fetch_tarball_text(COUNTRY_CODES_TARBALL, "package/dist/countriesData.js")

    country_language_names: dict[str, list[str]] = {}
    country_primary_language: dict[str, str] = {}
    language_name_to_code: dict[str, str] = {}

    pattern = re.compile(
        r'countryNameEn: "([^"]*)".*?countryCode: "([A-Z]{2})".*?countryCodeAlpha3: "([A-Z]{3})".*?officialLanguageCode: "([^"]*)".*?officialLanguageNameEn: "([^"]*)"',
        re.S,
    )
    for match in pattern.finditer(country_codes):
        _, iso2, _, official_language_code, primary_name = match.groups()
        primary_code = normalize_language_code(official_language_code)
        if iso2 and primary_code:
            country_primary_language[iso2] = primary_code
        normalized_name = normalize_language_name(primary_name)
        if normalized_name and normalized_name not in language_name_to_code:
            language_name_to_code[normalized_name] = primary_code

    for row in world_countries:
        if not isinstance(row, dict):
            continue
        iso2 = str(row.get("cca2") or "").strip().upper()
        if not iso2:
            continue
        languages = row.get("languages") or {}
        if isinstance(languages, dict):
            country_language_names[iso2] = [str(value) for value in languages.values() if value]

    return country_language_names, country_primary_language, language_name_to_code


def choose_language(iso2: str, language_names: list[str] | None, fallback_code: str | None, language_name_to_code: dict[str, str]) -> str:
    if iso2 in COUNTRY_LANGUAGE_OVERRIDE:
        return COUNTRY_LANGUAGE_OVERRIDE[iso2]

    for name in language_names or []:
        normalized = normalize_language_name(name)
        code = language_name_to_code.get(normalized) or LANGUAGE_NAME_ALIASES.get(normalized)
        code = normalize_language_code(code)
        if code and code != "en":
            return code

    return normalize_language_code(fallback_code)


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
    country_language_names, country_primary_language, language_name_to_code = load_country_language_sources()

    meta_map = {
        row["iso2Code"]: row
        for row in meta_rows
        if row.get("region", {}).get("value") != "Aggregates"
    }
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
                "languageNames": country_language_names.get(iso2, []),
                "nativeLanguage": country_primary_language.get(iso2, "en"),
            }
        )

    countries.sort(key=lambda item: item["population"], reverse=True)

    output = []
    for index, country in enumerate(countries, start=1):
        native_language = choose_language(
            country["iso2"],
            country["languageNames"],
            country["nativeLanguage"],
            language_name_to_code,
        )
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
