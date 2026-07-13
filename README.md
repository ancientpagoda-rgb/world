# World

A browser-based celestial globe with refreshed weather, near-real-time satellite imagery, HYG star catalog, and country-linked headlines.

## What this is

- Celestial visualization with HYG star catalog and Keplerian planetary orbits
- NASA Worldview near-real-time satellite texture on the globe, fetched in the browser with a generated fallback
- NOAA GFS weather overlay from static grid + raster assets refreshed by CI
- Country-by-country population data and filtered country-linked headlines when available

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

- `world-data.json` — country dataset (name, iso3, population, optional filtered headline)
- `stars.json` — HYG v3.8 star catalog (8921 stars with RA/Dec/magnitude/B-V color)

## Notes / accuracy

- Population values come from the latest available World Bank `SP.POP.TOTL` rows.
- Weather is model output from NOAA GFS. It is useful as a global briefing layer, not a station-level observation feed.
- Headlines come from Google News RSS searches and are filtered for country-name relevance. If no clean country-specific match is found, the row should show no headline rather than a misleading one.
