import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const filePath = normalize(join(root, pathname));
    if (filePath !== root && !filePath.startsWith(root + sep)) throw new Error("forbidden");
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not file");
    res.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start word-pair smoke server");
const url = `http://127.0.0.1:${address.port}/`;

let browser;
try {
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => typeof window.__worldWordPairDiagnostics === "function"
      && typeof window.__worldIpaQualityDiagnostics === "function"
      && document.querySelector("#country-list .country-row .news-original")
      && document.querySelector(".news-original")?.dataset.wordPairAligned === "true"
      && document.querySelector(".news-da")?.dataset.wordPairAligned === "true",
    { timeout: 20000 },
  );

  const result = await page.evaluate(async () => {
    const row = document.querySelector("#country-list .country-row");
    const original = row?.querySelector(".news-original");
    const ipa = row?.querySelector(".news-da");
    const english = row?.querySelector(".news-en");
    const sourceText = original?.textContent || "";
    const sourceTokens = window.tokenizeHeadlineWords(sourceText).filter((part) => part.wordLike);
    const originalWords = Array.from(original?.querySelectorAll(".paired-original") || []);
    const ipaWords = Array.from(ipa?.querySelectorAll(".paired-ipa") || []);
    const chineseProbe = window.tokenizeHeadlineWords("我很中国！中国成为潮流", "zh").filter((part) => part.wordLike).map((part) => part.text);
    const mixedProbeText = "क्या रेड होगा टीम india tour of bangladesh 3 T20 मैच";
    const chineseProbeText = "我很中国！中国China成为潮流";
    const [mixedProbeIpa, chineseProbeIpa] = await Promise.all([
      window.toIpaDisplay(mixedProbeText, "hi"),
      window.toIpaDisplay(chineseProbeText, "zh"),
    ]);
    const headers = Array.from(document.querySelector(".news-list-header")?.children || []).map((el) => el.textContent?.trim());
    return {
      diagnostics: window.__worldWordPairDiagnostics(),
      qualityDiagnostics: window.__worldIpaQualityDiagnostics(),
      sourceText,
      sourceTokenCount: sourceTokens.length,
      originalCount: originalWords.length,
      ipaCount: ipaWords.length,
      originalIndexes: originalWords.map((el) => el.dataset.wordIndex),
      ipaIndexes: ipaWords.map((el) => el.dataset.wordIndex),
      originalColors: originalWords.map((el) => el.style.getPropertyValue("--seg-color")),
      ipaColors: ipaWords.map((el) => el.style.getPropertyValue("--seg-color")),
      originalTexts: originalWords.map((el) => el.textContent),
      ipaTexts: ipaWords.map((el) => el.textContent),
      englishChildCount: english?.children.length ?? -1,
      mixedProbeTokens: window.tokenizeHeadlineWords(mixedProbeText).filter((part) => part.wordLike).map((part) => part.text),
      mixedProbeIpa,
      chineseProbe,
      chineseProbeIpa,
      headers,
    };
  });

  const failures = [];
  if (!result.diagnostics?.patched || !result.diagnostics.firstPairMatches) failures.push(`diagnostics wrong: ${JSON.stringify(result.diagnostics)}`);
  if (!result.qualityDiagnostics?.patched) failures.push(`IPA quality layer missing: ${JSON.stringify(result.qualityDiagnostics)}`);
  if (result.diagnostics?.ipaScriptLeaks !== 0) failures.push(`IPA contains non-IPA script leakage: ${result.diagnostics?.ipaScriptLeaks}`);
  if (!result.sourceTokenCount || result.originalCount !== result.sourceTokenCount) failures.push(`Original spans ${result.originalCount} != source tokens ${result.sourceTokenCount}`);
  if (result.ipaCount !== result.originalCount) failures.push(`IPA spans ${result.ipaCount} != Original spans ${result.originalCount}`);
  if (result.originalIndexes.join("|") !== result.ipaIndexes.join("|")) failures.push("Original and IPA word indexes drifted");
  if (result.originalColors.join("|") !== result.ipaColors.join("|")) failures.push("Original and IPA word colors drifted");
  if (new Set(result.originalColors).size !== result.originalColors.length) failures.push("A headline word reused an earlier color");
  if (result.originalColors.some((color) => !color.trim())) failures.push("At least one Native-language word was left uncolored");
  if (result.ipaColors.some((color) => !color.trim())) failures.push("At least one IPA word was left uncolored");
  if (result.englishChildCount !== 0) failures.push(`English translation contains colored/wrapped children: ${result.englishChildCount}`);
  if (result.mixedProbeTokens.join("|") !== "क्या|रेड|होगा|टीम|india|tour|of|bangladesh|3|T20|मैच") failures.push(`Mixed Hindi/Latin tokenization failed: ${result.mixedProbeTokens.join("|")}`);
  if (/\p{Script=Devanagari}/u.test(result.mixedProbeIpa || "")) failures.push(`Hindi source script leaked into mixed IPA: ${result.mixedProbeIpa}`);
  if (/[¹²³⁴]/u.test(result.mixedProbeIpa || "")) failures.push(`Ordinary mixed-headline digits became tone superscripts: ${result.mixedProbeIpa}`);
  if (!String(result.mixedProbeIpa || "").includes("3") || !String(result.mixedProbeIpa || "").includes("20")) failures.push(`Mixed-headline numbers were not preserved: ${result.mixedProbeIpa}`);
  if (result.chineseProbe.length < 4 || !result.chineseProbe.includes("中国") || !result.chineseProbe.includes("成为") || !result.chineseProbe.includes("潮流")) failures.push(`Chinese word segmentation failed: ${result.chineseProbe.join("|")}`);
  if (/\p{Script=Han}/u.test(result.chineseProbeIpa || "")) failures.push(`Han source script leaked into Chinese IPA: ${result.chineseProbeIpa}`);
  if (!/[˥˧˩]/u.test(result.chineseProbeIpa || "")) failures.push(`Chinese IPA lost tone contours: ${result.chineseProbeIpa}`);
  if (result.headers.join("|") !== "Native language|IPA phonetics|English translation") failures.push(`Column headers wrong: ${result.headers.join("|")}`);

  if (failures.length) {
    console.error("Word-pair browser smoke failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Word-pair browser smoke passed: ${result.originalCount} exact Native ↔ IPA word pairs; mixed-script IPA clean; CJK segmented; English plain; no source-script IPA leaks.`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
