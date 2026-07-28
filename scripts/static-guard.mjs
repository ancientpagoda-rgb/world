import { readFile } from "node:fs/promises";

const app = await readFile("app.js", "utf8");
const index = await readFile("index.html", "utf8");
const failures = [];

const requireInApp = [
  "function renderCountries",
  "async function loadCountries",
  "const DATA_URL",
  "const WORLD_BANK_POPULATION_URL",
];

for (const token of requireInApp) {
  if (!app.includes(token)) failures.push(`app.js is missing ${token}`);
}

const appLines = app.split(/\r?\n/).length;
if (appLines < 1000) {
  failures.push(`app.js looks truncated: expected at least 1000 lines, found ${appLines}`);
}

const requireInIndex = [
  "country-list",
  "./app.js",
];

for (const token of requireInIndex) {
  if (!index.includes(token)) failures.push(`index.html is missing ${token}`);
}

if (failures.length) {
  console.error("Static guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static guard passed: app.js has ${appLines} lines and required runtime hooks.`);
