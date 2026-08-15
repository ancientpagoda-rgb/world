import { readFile } from "node:fs/promises";

const index = await readFile("index.html", "utf8");
const runtime = await readFile("word-pair-alignment.js", "utf8");
const failures = [];

for (const token of [
  "./word-pair-alignment.js",
  "waitForLanguageAwareIpa",
  "__worldLanguageAwareIpaDiagnostics",
  "World v1.0.16",
  "Every source word gets its own color",
]) {
  if (!index.includes(token)) failures.push(`index.html is missing ${token}`);
}

for (const token of [
  "WORD_TOKEN_RE",
  "buildWordPairs",
  "alignHeadlineWordPairs",
  "paired-original",
  "paired-ipa",
  "wordColor(index)",
  "englishEl.textContent = englishText || originalText",
  "__worldWordPairDiagnostics",
]) {
  if (!runtime.includes(token)) failures.push(`word-pair-alignment.js is missing ${token}`);
}

if (failures.length) {
  console.error("Word-pair static guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Word-pair static guard passed: source-token pairing, explicit load ordering, unique word colors, and plain English are wired.");