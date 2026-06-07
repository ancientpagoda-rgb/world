import { readFile } from "node:fs/promises";

const app = await readFile("app.js", "utf8");
const index = await readFile("index.html", "utf8");
const failures = [];

const requireInApp = [
  "function initializeWeatherOrb",
  "function renderStarfield",
  "async function loadStarCatalog",
  "const STARS_URL",
  "const STAR_CATALOG",
  "function renderCountries",
  "initializeWeatherOrb();",
];

for (const token of requireInApp) {
  if (!app.includes(token)) failures.push(`app.js is missing ${token}`);
}

const appLines = app.split(/\r?\n/).length;
if (appLines < 1000) {
  failures.push(`app.js looks truncated: expected at least 1000 lines, found ${appLines}`);
}

const requireInIndex = [
  "starfield-canvas",
  "weather-orb-canvas",
  "./app.js",
];

for (const token of requireInIndex) {
  if (!index.includes(token)) failures.push(`index.html is missing ${token}`);
}

const starUrlIndex = app.indexOf("const STARS_URL");
const loadStarIndex = app.indexOf("async function loadStarCatalog");
if (starUrlIndex === -1 || loadStarIndex === -1 || starUrlIndex > loadStarIndex) {
  failures.push("STARS_URL should be defined before loadStarCatalog uses it");
}

const catalogIndex = app.indexOf("const STAR_CATALOG");
if (catalogIndex === -1 || loadStarIndex === -1 || catalogIndex > loadStarIndex) {
  failures.push("STAR_CATALOG should be defined before loadStarCatalog uses it");
}

if (failures.length) {
  console.error("Static guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static guard passed: app.js has ${appLines} lines and required runtime hooks.`);
