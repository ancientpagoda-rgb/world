#!/usr/bin/env python3
"""Regression checks for general-news headline selection."""

from update_headlines_only import country_aliases, headline_is_usable


def main() -> None:
    aliases = country_aliases("India", "IN")
    rejected = [
        "India vs Afghanistan Highlights: Team India reaches the semifinal - Aaj Tak",
        "India Cricket Team Schedule: 30 matches this year - Aaj Tak",
        "Asian Games 2026 India Medals Tally: India wins seven medals - Hindustan",
        "India 360: AI threats and government portals - facebook.com",
    ]
    for title in rejected:
        if headline_is_usable(title, aliases):
            raise SystemExit(f"sports or low-value headline was accepted: {title}")

    accepted = "India bloc leaders to meet in Delhi on September 30 - India TV Hindi"
    if not headline_is_usable(accepted, aliases):
        raise SystemExit("general-news headline was rejected")

    print("Headline selection smoke passed.")


if __name__ == "__main__":
    main()
