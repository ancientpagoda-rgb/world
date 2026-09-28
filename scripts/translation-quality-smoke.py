#!/usr/bin/env python3
"""Regression checks for obviously malformed offline translation output."""

from translate_headlines_offline import translation_quality_reason


def expect_rejected(candidate: str, source: str, reason: str) -> None:
    actual = translation_quality_reason(candidate, source)
    if actual != reason:
        raise SystemExit(f"expected {reason!r}, got {actual!r} for {candidate[:80]!r}")


def main() -> None:
    normal = "Mexico's investment week brings new projects - El Financiero"
    if translation_quality_reason(normal, "Mexico Investment Week: proyectos - El Financiero"):
        raise SystemExit("normal translation was rejected")

    expect_rejected(
        "mainstream" * 12,
        "Mexico Investment Week - El Financiero",
        "repeated-fragment",
    )
    expect_rejected(
        " ".join(f"word{index}" for index in range(200)),
        "Mexico Investment Week - El Financiero",
        "extreme-expansion",
    )
    expect_rejected(
        "The Commission has decided to extend the scope of this Regulation - RunningNews.gr",
        "Live Run Greece 2026 - RunningNews.gr",
        "dropped-number",
    )
    print("Translation quality smoke passed.")


if __name__ == "__main__":
    main()
