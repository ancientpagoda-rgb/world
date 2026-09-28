# World

World is a static, browser-based Earth globe and country briefing surface. It combines current Earth imagery and weather data with searchable country cards, native-language headlines, IPA approximations, and English summaries.

## Local development

```sh
npx serve .
```

The application itself has no build step. Country geometry is self-hosted in
`world-geometry.json`; regenerate it with `npm run build:geometry` when the
upstream atlas is refreshed. The main globe is borderless by default; append
`?borders=1` to opt into local country borders.

The geometry is derived from `visionscarto-world-atlas` (BSD-3-Clause),
stored locally as a simplified FeatureCollection.

The standalone embeddable widget and demo have been removed; `/countries/` is
the lightweight list-only companion page.

## Checks

```sh
npm ci
npm run check:syntax
npm run check:static
npm run test:smoke
```

Generated country, weather, and Earth-image assets are refreshed by GitHub Actions. Headline English values are generated offline during the refresh: the cached NLLB-200 model is tried first, followed by Argos Translate for languages NLLB cannot cover or failed batches. The browser does not call a translation service. The main application is deployed through GitHub Pages.
