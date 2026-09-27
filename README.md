# World

World is a static, browser-based Earth globe and country briefing surface. It combines current Earth imagery and weather data with searchable country cards, native-language headlines, IPA approximations, and English summaries.

## Local development

```sh
npx serve .
```

The application itself has no build step. The reusable globe widget does:

```sh
cd widget
npm ci
npm run build
```

## Checks

```sh
npm ci
npm run check:syntax
npm run check:static
npm run test:smoke
```

Generated country, weather, and Earth-image assets are refreshed by GitHub Actions. Headline English values are generated offline during the refresh: the cached NLLB-200 model is tried first, followed by Argos Translate for languages NLLB cannot cover or failed batches. The browser does not call a translation service. The main application is deployed through GitHub Pages.
