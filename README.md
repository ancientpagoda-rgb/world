# World

A browser-based country briefing surface with searchable headlines, translated snippets, and country shortcuts.

## What this is

- Searchable country list with headlines, translated snippets, and country shortcuts
- Country-by-country population data and filtered country-linked headlines when available
- Country thumbnails generated from the geo outlines in `world-data.json`
- Static data and assets refreshed by CI

## Run it

Open `index.html` in a browser.

## Test it

Run the guard checks with:

```sh
npm run check:syntax
npm run check:static
npm run test:setup
npm run test:smoke
```

The smoke test starts its own local static server unless `SMOKE_URL` is set.

## Data

- `world-data.json` — country dataset (name, iso3, population, nativeLanguage, optional filtered headline)
- `stars.json` — preserved static asset bundle for country thumbnail generation and related overlays

## Notes / accuracy

- Population values are refreshed from the latest available World Bank `SP.POP.TOTL` rows on page load and on a repeating timer, with `world-data.json` as fallback.
- Headlines come from Google News RSS searches and are filtered for country-name relevance. The generator keeps a native-language source preference per country and avoids overwriting it with fallback headline languages.
