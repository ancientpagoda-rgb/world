import { readFile } from "node:fs/promises";

const app = await readFile("app.js", "utf8");
const globePatch = await readFile("globe-runtime-fix.js", "utf8");
const translationPatch = await readFile("translation-runtime-fix.js", "utf8");
const translationFinalizer = await readFile("translation-runtime-finalize.js", "utf8");
const syllableColorFix = await readFile("syllable-color-fix.js", "utf8");
const ipaPhonetics = await readFile("ipa-phonetics.js", "utf8");
const languageAwareIpa = await readFile("language-aware-ipa.js", "utf8");
const index = await readFile("index.html", "utf8");
const styles = await readFile("styles.css", "utf8");
const failures = [];

const requireInApp = ["function renderCountries", "async function loadCountries", "const DATA_URL", "const WORLD_BANK_POPULATION_URL", "function initializeWeatherOrb", "function drawWeatherOrbFrame", "function renderStarfield"];
for (const token of requireInApp) if (!app.includes(token)) failures.push(`app.js is missing ${token}`);
const appLines = app.split(/\r?\n/).length;
if (appLines < 1000) failures.push(`app.js looks truncated: expected at least 1000 lines, found ${appLines}`);

for (const token of ["setupGlobeInteraction = function", "drawWeatherOrbFrame = function", "loadNoaaWeatherGrid()", "drawWorldGeometry", "__worldGlobeDiagnostics"]) if (!globePatch.includes(token)) failures.push(`globe-runtime-fix.js is missing ${token}`);
for (const token of ["toEnglishDisplay = upgradedEnglishDisplay", "toDaDisplay = upgradedDaDisplay", "effectiveSourceLanguage", "MAX_TRANSLATIONS_IN_FLIGHT", "__worldTranslationDiagnostics"]) if (!translationPatch.includes(token)) failures.push(`translation-runtime-fix.js is missing ${token}`);
for (const token of ["finalizeEnglishDa", "toDaCore(input)", "toDaDisplay = async function finalizedDaDisplay", "__worldTranslationFinalizer"]) if (!translationFinalizer.includes(token)) failures.push(`translation-runtime-finalize.js is missing ${token}`);
for (const token of ["PHONETIC_VOWELS", "splitPhoneticSyllables", "setColorCodedSegments = function patchedSetColorCodedSegments", "dataset.syllableIndex", "__worldSyllableDiagnostics"]) if (!syllableColorFix.includes(token)) failures.push(`syllable-color-fix.js is missing ${token}`);
for (const token of ["englishApproxIpa", "async function toIpaDisplay", "hydrateNewsItem = async function ipaHydrateNewsItem", "IPA phonetics", "__worldIpaDiagnostics", "language-aware-ipa.js"]) if (!ipaPhonetics.includes(token)) failures.push(`ipa-phonetics.js is missing ${token}`);
for (const token of ["languageAwareIpaDisplay", "cyrillicIpa", "greekIpa", "devanagariIpa", "arabicIpa", "hangulIpa", "chineseIpa", "setCoordinatedWordColors", "coordinated-word", "englishEl.textContent", "__worldLanguageAwareIpaDiagnostics"]) if (!languageAwareIpa.includes(token)) failures.push(`language-aware-ipa.js is missing ${token}`);

for (const token of [
  "country-list", "starfield-canvas", "weather-orb-canvas", "ipa-sound-legend", "IPA sound legend",
  "Vowels &amp; diphthongs", "Consonants", "Extra marks", ">θ<", ">ð<", ">aɪ<", ">əʊ<",
  "matching colors identify corresponding words", "English translation stays plain and uncolored", "World v1.0.15",
  "./app.js", "./translation-runtime-fix.js", "./translation-runtime-finalize.js", "./syllable-color-fix.js", "./ipa-phonetics.js", "./globe-runtime-fix.js", "window.initializeWeatherOrb()",
]) if (!index.includes(token)) failures.push(`index.html is missing ${token}`);
for (const token of [".da-legend", ".da-sound-grid", ".da-sound", ".da-legend-summary-note"]) if (!styles.includes(token)) failures.push(`styles.css is missing ${token}`);

if (failures.length) {
  console.error("Static guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Static guard passed: app.js has ${appLines} lines and language-aware IPA + coordinated Original/IPA word colors + plain English + globe runtime hooks are wired.`);