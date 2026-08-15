import { readFile } from "node:fs/promises";

const app = await readFile("app.js", "utf8");
const globePatch = await readFile("globe-runtime-fix.js", "utf8");
const translationPatch = await readFile("translation-runtime-fix.js", "utf8");
const index = await readFile("index.html", "utf8");
const failures = [];

const requireInApp = [
  "function renderCountries",
  "async function loadCountries",
  "const DATA_URL",
  "const WORLD_BANK_POPULATION_URL",
  "function initializeWeatherOrb",
  "function drawWeatherOrbFrame",
  "function renderStarfield",
];

for (const token of requireInApp) {
  if (!app.includes(token)) failures.push(`app.js is missing ${token}`);
}

const appLines = app.split(/\r?\n/).length;
if (appLines < 1000) {
  failures.push(`app.js looks truncated: expected at least 1000 lines, found ${appLines}`);
}

const requireInGlobePatch = [
  "setupGlobeInteraction = function",
  "drawWeatherOrbFrame = function",
  "loadNoaaWeatherGrid()",
  "drawWorldGeometry",
  "__worldGlobeDiagnostics",
];

for (const token of requireInGlobePatch) {
  if (!globePatch.includes(token)) failures.push(`globe-runtime-fix.js is missing ${token}`);
}

const requireInTranslationPatch = [
  "toEnglishDisplay = upgradedEnglishDisplay",
  "toDaDisplay = upgradedDaDisplay",
  "effectiveSourceLanguage",
  "MAX_TRANSLATIONS_IN_FLIGHT",
  "DA_FINAL_REPLACEMENTS",
  "__worldTranslationDiagnostics",
];

for (const token of requireInTranslationPatch) {
  if (!translationPatch.includes(token)) failures.push(`translation-runtime-fix.js is missing ${token}`);
}

const requireInIndex = [
  "country-list",
  "starfield-canvas",
  "weather-orb-canvas",
  "./app.js",
  "./translation-runtime-fix.js",
  "./globe-runtime-fix.js",
  "window.initializeWeatherOrb()",
];

for (const token of requireInIndex) {
  if (!index.includes(token)) failures.push(`index.html is missing ${token}`);
}

if (failures.length) {
  console.error("Static guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static guard passed: app.js has ${appLines} lines and country + translation + interactive globe runtime hooks are wired.`);