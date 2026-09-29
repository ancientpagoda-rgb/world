#!/usr/bin/env python3
"""Fill English headline fields without a paid translation API.

The refresh pipeline is deliberately two-stage:

1. NLLB-200 handles supported languages in batches for consistent quality.
2. Argos Translate handles languages NLLB cannot cover or failed batches.

Both model families are downloaded and cached by the caller.  No translation
request is made from the browser or to an undocumented hosted endpoint.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "world-data.json"
UNAVAILABLE = "English translation unavailable"
NLLB_MODEL = os.environ.get("NLLB_MODEL", "facebook/nllb-200-distilled-600M")

# NLLB uses FLORES-200 language/script identifiers rather than ISO-639-1.
# Languages not present here are intentionally left unavailable instead of
# sending their text to a public translation endpoint.
NLLB_LANGUAGE_CODES = {
    "af": "afr_Latn",
    "am": "amh_Ethi",
    "ar": "arb_Arab",
    "ay": "ayr_Latn",
    "az": "azj_Latn",
    "be": "bel_Cyrl",
    "bg": "bul_Cyrl",
    "bn": "ben_Beng",
    "bs": "bos_Latn",
    "ca": "cat_Latn",
    "cs": "ces_Latn",
    "cy": "cym_Latn",
    "da": "dan_Latn",
    "de": "deu_Latn",
    "dz": "dzo_Tibt",
    "el": "ell_Grek",
    "en": "eng_Latn",
    "es": "spa_Latn",
    "et": "est_Latn",
    "eu": "eus_Latn",
    "fa": "pes_Arab",
    "fi": "fin_Latn",
    "fj": "fij_Latn",
    "fr": "fra_Latn",
    "ga": "gle_Latn",
    "gl": "glg_Latn",
    "gn": "grn_Latn",
    "he": "heb_Hebr",
    "hi": "hin_Deva",
    "hr": "hrv_Latn",
    "hu": "hun_Latn",
    "hy": "hye_Armn",
    "id": "ind_Latn",
    "is": "isl_Latn",
    "it": "ita_Latn",
    "ja": "jpn_Jpan",
    "ka": "kat_Geor",
    "kk": "kaz_Cyrl",
    "km": "khm_Khmr",
    "ko": "kor_Hang",
    "ky": "kir_Cyrl",
    "lo": "lao_Laoo",
    "lt": "lit_Latn",
    "lv": "lvs_Latn",
    "mi": "mri_Latn",
    "mk": "mkd_Cyrl",
    "mn": "khk_Cyrl",
    "ms": "zsm_Latn",
    "mt": "mlt_Latn",
    "my": "mya_Mymr",
    "nb": "nob_Latn",
    "ne": "npi_Deva",
    "nl": "nld_Latn",
    "no": "nob_Latn",
    "pl": "pol_Latn",
    "pt": "por_Latn",
    "ro": "ron_Latn",
    "ru": "rus_Cyrl",
    "si": "sin_Sinh",
    "sk": "slk_Latn",
    "sl": "slv_Latn",
    "sm": "smo_Latn",
    "sq": "als_Latn",
    "sr": "srp_Cyrl",
    "st": "sot_Latn",
    "sv": "swe_Latn",
    "sw": "swh_Latn",
    "th": "tha_Thai",
    "tn": "tsn_Latn",
    "tr": "tur_Latn",
    "uk": "ukr_Cyrl",
    "ur": "urd_Arab",
    "vi": "vie_Latn",
    "zh": "zho_Hans",
}

ENGLISH_HINTS = {
    "a", "after", "against", "and", "are", "as", "asks", "at", "between", "by", "can",
    "final", "for", "from", "has", "have", "in", "is", "islands", "its", "more", "new",
    "of", "on", "over", "reopen", "said", "says", "score", "sovereignty", "that", "the",
    "their", "this", "to", "under", "was", "were", "why", "with",
}


def primary_language(value: Any) -> str:
    return str(value or "en").strip().lower().replace("_", "-").split("-", 1)[0]


def split_source_suffix(text: str) -> tuple[str, str]:
    input_text = str(text or "").strip()
    if not input_text:
        return "", ""
    for separator in (" - ", " — ", " | "):
        index = input_text.rfind(separator)
        if index <= 20:
            continue
        body = input_text[:index].strip()
        suffix = input_text[index + len(separator):].strip()
        if body and suffix and len(suffix) <= 80:
            return body, f"{separator}{suffix}"
    return input_text, ""


def looks_english(text: str, language: str) -> bool:
    if primary_language(language) == "en":
        return True
    body, _ = split_source_suffix(text)
    words = re.findall(r"[a-z]+", body.lower())
    if len(words) < 2:
        return False
    latin_letters = len(re.findall(r"[a-z]", body.lower()))
    letters = len(re.findall(r"[a-z\u00c0-\u024f]", body.lower()))
    if letters and latin_letters / letters < 0.8:
        return False
    return sum(1 for word in words if word in ENGLISH_HINTS or f" {word}" in ENGLISH_HINTS) >= 2


def merge_translation(translated: str, source: str) -> str:
    _, suffix = split_source_suffix(source)
    return f"{str(translated or '').strip()}{suffix}".strip()


def translation_quality_reason(translated: str, source: str) -> str | None:
    """Return a reason to reject obviously malformed model output.

    These checks are intentionally conservative: they catch runaway
    repetition, extreme expansion, and dropped numbers without pretending to
    assess semantic correctness.
    """
    candidate = str(translated or "").strip()
    if not candidate or candidate == UNAVAILABLE:
        return "empty"
    if candidate == str(source or "").strip():
        return None

    source_body, _ = split_source_suffix(source)
    candidate_body, _ = split_source_suffix(candidate)
    if len(candidate_body) > max(320, len(source_body) * 6):
        return "extreme-expansion"

    compact = re.sub(r"[^\w]+", "", candidate_body.casefold(), flags=re.UNICODE)
    if re.search(r"(.{4,80}?)(?:\1){2,}", compact):
        return "repeated-fragment"

    words = re.findall(r"[^\W\d_]+", candidate_body.casefold(), flags=re.UNICODE)
    if len(words) >= 8 and max(Counter(words).values()) >= max(4, len(words) // 2):
        return "repeated-word"

    source_numbers = re.findall(r"\d+(?:[.,]\d+)?", source_body)
    candidate_numbers = re.findall(r"\d+(?:[.,]\d+)?", candidate_body)
    if any(number not in candidate_numbers for number in source_numbers):
        return "dropped-number"
    return None


def load_rows() -> list[dict[str, Any]]:
    rows = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise SystemExit("world-data.json must contain a list of objects")
    return rows


def write_rows(rows: list[dict[str, Any]]) -> None:
    DATA_PATH.write_text(json.dumps(rows, ensure_ascii=False) + "\n", encoding="utf-8")


def install_argos_translators(languages: set[str]) -> dict[str, Any]:
    """Install and return direct Argos translators for requested languages."""
    try:
        from argostranslate import package, translate
    except ImportError:
        print("Argos Translate is not installed; skipping Argos stage", file=sys.stderr)
        return {}

    try:
        package.update_package_index()
        available = {pkg.from_code: pkg for pkg in package.get_available_packages() if pkg.to_code == "en"}
    except Exception as error:
        print(f"Argos package index unavailable: {error}", file=sys.stderr)
        return {}

    translators: dict[str, Any] = {}
    for language in sorted(languages):
        if language == "en" or language not in available:
            continue
        try:
            translate.get_translation_from_codes(language, "en")
        except Exception:
            print(f"Installing Argos {language}->en model", flush=True)
            try:
                if not package.install_package_for_language_pair(language, "en"):
                    continue
            except Exception as error:
                print(f"Argos install failed for {language}: {error}", file=sys.stderr)
                continue
        try:
            translators[language] = translate.get_translation_from_codes(language, "en")
        except Exception as error:
            print(f"Argos translator unavailable for {language}: {error}", file=sys.stderr)
    return translators


class NllbTranslator:
    def __init__(self) -> None:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        self.torch = torch
        thread_count = int(os.environ.get("NLLB_THREADS", "4"))
        torch.set_num_threads(max(1, thread_count))
        print(f"Loading NLLB model {NLLB_MODEL}", flush=True)
        self.tokenizer = AutoTokenizer.from_pretrained(NLLB_MODEL)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(NLLB_MODEL)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        self.model.eval()
        self.target_id = self.tokenizer.convert_tokens_to_ids("eng_Latn")

    def supports(self, language: str) -> bool:
        code = NLLB_LANGUAGE_CODES.get(language)
        if not code:
            return False
        vocabulary = self.tokenizer.get_vocab()
        return code in self.tokenizer.added_tokens_encoder or code in vocabulary

    def translate_batch(self, language: str, texts: list[str]) -> list[str]:
        source_code = NLLB_LANGUAGE_CODES[language]
        self.tokenizer.src_lang = source_code
        encoded = self.tokenizer(
            texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=256,
        )
        encoded = {key: value.to(self.device) for key, value in encoded.items()}
        with self.torch.inference_mode():
            generated = self.model.generate(
                **encoded,
                forced_bos_token_id=self.target_id,
                max_new_tokens=128,
                num_beams=2,
            )
        return [text.strip() for text in self.tokenizer.batch_decode(generated, skip_special_tokens=True)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="retranslate every non-English headline")
    parser.add_argument("--dry-run", action="store_true", help="report translations without writing world-data.json")
    parser.add_argument("--require-complete", action="store_true", help="exit nonzero if any headline remains unavailable")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = load_rows()
    pending: list[tuple[dict[str, Any], str, str]] = []
    changed = 0

    for row in rows:
        headline = str(row.get("headline") or "").strip()
        if not headline:
            continue
        current = str(row.get("englishHeadline") or "").strip()
        if current and current != UNAVAILABLE:
            quality_reason = translation_quality_reason(current, headline)
            if quality_reason is None and not args.force:
                continue
            if quality_reason:
                print(
                    f"Re-translating {row.get('iso2', '?')}: existing English output "
                    f"rejected ({quality_reason})",
                    flush=True,
                )
        row["englishHeadline"] = UNAVAILABLE
        language = primary_language(row.get("language") or row.get("nativeLanguage"))
        if looks_english(headline, language):
            row["englishHeadline"] = headline
            changed += 1
            continue
        pending.append((row, headline, language))

    by_language: dict[str, list[tuple[dict[str, Any], str]]] = defaultdict(list)
    for row, headline, language in pending:
        by_language[language].append((row, headline))

    # NLLB is primary when it supports the language: its multilingual model
    # produces more consistent quality than mixing dozens of small Argos
    # packages. Argos remains the lightweight fallback for languages NLLB does
    # not cover or when a batch fails.
    unresolved: dict[str, list[tuple[dict[str, Any], str]]] = defaultdict(list)
    nllb = None
    if by_language:
        try:
            nllb = NllbTranslator()
        except Exception as error:
            print(f"NLLB unavailable: {error}", file=sys.stderr)

    if nllb is not None:
        for language, items in sorted(by_language.items()):
            if not nllb.supports(language):
                unresolved[language].extend(items)
                continue
            headlines = [split_source_suffix(headline)[0] for _, headline in items]
            try:
                translations = nllb.translate_batch(language, headlines)
            except Exception as error:
                print(f"NLLB translation failed for {language}: {error}", file=sys.stderr)
                unresolved[language].extend(items)
                continue
            for (row, headline), translated in zip(items, translations):
                if translated:
                    candidate = merge_translation(translated, headline)
                    quality_reason = translation_quality_reason(candidate, headline)
                    if quality_reason is None:
                        row["englishHeadline"] = candidate
                        changed += 1
                    else:
                        print(
                            f"NLLB output rejected for {row.get('iso2', '?')}: "
                            f"{quality_reason}",
                            file=sys.stderr,
                        )
                        unresolved[language].append((row, headline))
                else:
                    unresolved[language].append((row, headline))
    else:
        unresolved.update(by_language)

    if unresolved:
        argos = install_argos_translators(set(unresolved))
        for language, items in sorted(unresolved.items()):
            translator = argos.get(language)
            if translator is None:
                print(f"No offline translator for {language}; leaving {len(items)} unavailable", file=sys.stderr)
                continue
            for row, headline in items:
                body, _ = split_source_suffix(headline)
                try:
                    translated = translator.translate(body).strip()
                except Exception as error:
                    print(f"Argos translation failed for {row.get('iso2', '?')}: {error}", file=sys.stderr)
                    translated = ""
                if translated:
                    candidate = merge_translation(translated, headline)
                    quality_reason = translation_quality_reason(candidate, headline)
                    if quality_reason is None:
                        row["englishHeadline"] = candidate
                        changed += 1
                    else:
                        print(
                            f"Argos output rejected for {row.get('iso2', '?')}: "
                            f"{quality_reason}",
                            file=sys.stderr,
                        )

    remaining = sum(
        bool(row.get("headline")) and str(row.get("englishHeadline") or "").strip() in ("", UNAVAILABLE)
        for row in rows
    )
    print(f"Offline translation updated {changed} rows; {remaining} headlines remain unavailable", flush=True)

    if not args.dry_run:
        write_rows(rows)
    if args.require_complete and remaining:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
