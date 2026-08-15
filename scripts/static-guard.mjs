import { readFile } from "node:fs/promises";

const app = await readFile("app.js", "utf8");
const globePatch = await readFile("globe-runtime-fix.js", "utf8");
const translationPatch = await readFile("translation-runtime-fix.js", "utf8");
const translationFinalizer = await readFile("translation-runtime-finalize.js", "utf8");
const syllableColorFix = await readFile("syllable-color-fix.js", "utf8");
const ipaPhonetics = await readFile("ipa-phonetics.js", "utf8");
const index = await readFile("index.html", "utf8");
const styles = await readFile("styles.css", "utf8");
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
  "__worldTranslationDiagnostics",
];
for (const token of requireInTranslationPatch) {
  if (!translationPatch.includes(token)) failures.push(`translation-runtime-fix.js is missing ${token}`);
}

const requireInTranslationFinalizer = [
  "finalizeEnglishDa",
  "toDaCore(input)",
  "toDaDisplay = async function finalizedDaDisplay",
  "__worldTranslationFinalizer",
];
for (const token of requireInTranslationFinalizer) {
  if (!translationFinalizer.includes(token)) failures.push(`translation-runtime-finalize.js is missing ${token}`);
}

const requireInSyllableColorFix = [
  "PHONETIC_VOWELS",
  "splitPhoneticSyllables",
  "setColorCodedSegments = function patchedSetColorCodedSegments",
  "dataset.syllableIndex",
  "__worldSyllableDiagnostics",
];
for (const token of requireInSyllableColorFix) {
  if (!syllableColorFix.includes(token)) failures.push(`syllable-color-fix.js is missing ${token}`);
}

const requireInIpaPhonetics = [
  "englishApproxIpa",
  "async function toIpaDisplay",
  "hydrateNewsItem = async function ipaHydrateNewsItem",
  "IPA phonetics",
  "__worldIpaDiagnostics",
];
for (const token of requireInIpaPhonetics) {
  if (!ipaPhonetics.includes(token)) failures.push(`ipa-phonetics.js is missing ${token}`);
}

const requireInIndex = [
  "country-list",
  "starfield-canvas",
  "weather-orb-canvas",
  "ipa-sound-legend",
  "IPA sound legend",
  "Vowels &amp; diphthongs",
  "Consonants",
  "Extra marks",
  ">θ<",
  ">ð<",
  ">aɪ<",
  ">əʊ<",
  "./app.js",
  "./translation-runtime-fix.js",
  "./translation-runtime-finalize.js",
  "./syllable-color-fix.js",
  "./ipa-phonetics.js",
  "./globe-runtime-fix.js",
  "window.initializeWeatherOrb()",
];
for (const token of requireInIndex) {
  if (!index.includes(token)) failures.push(`index.html is missing ${token}`);
}

const requireInStyles = [
  ".da-legend",
  ".da-sound-grid",
  ".da-sound",
  ".da-legend-summary-note",
];
for (const token of requireInStyles) {
  if (!styles.includes(token)) failures.push(`styles.css is missing ${token}`);
}

if (failures.length) {
  console.error("Static guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Static guard passed: app.js has ${appLines} lines and country + translation + IPA legend + syllable-color + interactive globe runtime hooks are wired.`);