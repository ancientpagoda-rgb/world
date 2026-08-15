import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { chromium, firefox } from "playwright";

const root = resolve(".");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const providedUrl = process.env.SMOKE_URL;
const { server, url } = providedUrl ? { server: null, url: providedUrl } : await startStaticServer();
const debugUrl = new URL(url);
debugUrl.searchParams.set("debug", "1");

function resolveChromiumExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    ...discoverCachedChromiumExecutables(),
    "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate) && !isSnapWrapper(candidate, "chromium"));
}

function discoverCachedChromiumExecutables() {
  const cacheRoot = join(process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.HOME || "", ".cache", "ms-playwright"));
  if (!cacheRoot || !existsSync(cacheRoot)) return [];
  const candidates = [];
  for (const dir of readdirSync(cacheRoot)) {
    if (!dir.startsWith("chromium-") && !dir.startsWith("chromium_headless_shell-")) continue;
    candidates.push(
      join(cacheRoot, dir, "chrome-linux64", "chrome"),
      join(cacheRoot, dir, "chrome-linux", "chrome"),
      join(cacheRoot, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
      join(cacheRoot, dir, "chrome-linux", "headless_shell"),
    );
  }
  return candidates;
}

function resolveFirefoxExecutablePath() {
  const candidates = [process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH, "/usr/bin/firefox", "/usr/bin/firefox-esr"].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate) && !isSnapWrapper(candidate, "firefox"));
}

function isSnapWrapper(path, browserName) {
  try { return readFileSync(path, "utf8").includes(`requires the ${browserName} snap to be installed`); }
  catch { return false; }
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const requestedUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = requestedUrl.pathname === "/" ? "/index.html" : requestedUrl.pathname;
      const filePath = normalize(join(root, decodeURIComponent(pathname)));
      if (filePath !== root && !filePath.startsWith(root + sep)) { res.writeHead(403); res.end("Forbidden"); return; }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Length": fileStat.size, "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
      createReadStream(filePath).pipe(res);
    } catch { res.writeHead(404); res.end("Not found"); }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => { server.off("error", rejectListen); resolveListen(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start local smoke-test server");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function launchBrowser() {
  const executablePath = resolveChromiumExecutablePath();
  if (executablePath) {
    try { return await chromium.launch({ executablePath, args: ["--no-sandbox"] }); }
    catch (error) { console.warn(`Chromium at ${executablePath} could not launch: ${error.message}`); }
  }
  try { return await chromium.launch({ args: ["--no-sandbox"] }); }
  catch (error) { console.warn(`Bundled Chromium could not launch: ${error.message}`); }
  const firefoxExecutablePath = resolveFirefoxExecutablePath();
  if (firefoxExecutablePath) {
    try { return await firefox.launch({ executablePath: firefoxExecutablePath }); }
    catch (error) { console.warn(`Firefox at ${firefoxExecutablePath} could not launch: ${error.message}`); }
  }
  return null;
}

let browser;
const errors = [];
try {
  browser = await launchBrowser();
  if (!browser) { console.log("Browser smoke test skipped: no usable browser executable found on this platform."); process.exit(0); }
} catch (error) {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  throw error;
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (error) => errors.push(error.stack || error.message || String(error)));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const sourceUrl = message.location().url || "";
  if (sourceUrl.endsWith("/favicon.ico")) return;
  if (/^https:\/\/fonts\.(?:gstatic|googleapis)\.com\//.test(sourceUrl)) return;
  errors.push(`${message.text()}${sourceUrl ? ` (${sourceUrl})` : ""}`);
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#country-list")?.children.length > 0, { timeout: 15000 });
  await page.waitForFunction(
    () => typeof window.__worldTranslationDiagnostics === "function"
      && window.__worldTranslationFinalizer === "1.0.0"
      && typeof window.__worldSyllableDiagnostics === "function"
      && typeof window.__worldIpaDiagnostics === "function"
      && typeof window.__worldLanguageAwareIpaDiagnostics === "function"
      && typeof window.toIpaDisplay === "function"
      && typeof window.setCoordinatedWordColors === "function",
    { timeout: 10000 },
  );
  await page.waitForTimeout(1500);

  const buildTag = await page.locator("#build-tag").innerText().catch(() => "");
  if (/ERROR:/i.test(buildTag)) errors.push(`Build tag contains runtime error text: ${buildTag}`);

  const firstRowText = await page.evaluate(() => document.querySelector("#country-list .country-row")?.textContent || "");
  if (!/India/i.test(firstRowText)) errors.push(`First country row should begin with India, got: ${firstRowText.slice(0, 120)}`);

  const translationProbe = await page.evaluate(async () => ({
    english: await window.toEnglishDisplay("Hello world", "en"),
    ipa: await window.toIpaDisplay("the quick brown fox", "en"),
    spanish: await window.toIpaDisplay("Hola mundo", "es"),
    russian: await window.toIpaDisplay("Привет мир", "ru"),
    greek: await window.toIpaDisplay("κόσμος", "el"),
    hindi: await window.toIpaDisplay("भारत", "hi"),
    korean: await window.toIpaDisplay("한국", "ko"),
    arabic: await window.toIpaDisplay("العربية", "ar"),
    diagnostics: window.__worldTranslationDiagnostics(),
    ipaDiagnostics: window.__worldIpaDiagnostics(),
    languageDiagnostics: window.__worldLanguageAwareIpaDiagnostics(),
    header: document.querySelector(".news-list-header")?.children?.[1]?.textContent || "",
    legend: document.querySelector("#ipa-sound-legend summary")?.textContent || "",
  }));
  if (translationProbe.english !== "Hello world") errors.push(`English passthrough translation changed unexpectedly: ${translationProbe.english}`);
  if (!translationProbe.ipa.includes("ðə") || !translationProbe.ipa.includes("kwɪk") || !translationProbe.ipa.includes("aʊ")) errors.push(`English IPA probe was wrong: ${translationProbe.ipa}`);
  if (!/^ola mundo$/i.test(translationProbe.spanish)) errors.push(`Spanish IPA path was not language-aware: ${translationProbe.spanish}`);
  if (/\p{Script=Cyrillic}/u.test(translationProbe.russian) || !/privet/i.test(translationProbe.russian)) errors.push(`Russian IPA path failed: ${translationProbe.russian}`);
  if (/\p{Script=Greek}/u.test(translationProbe.greek) || !/kosmos/i.test(translationProbe.greek)) errors.push(`Greek IPA path failed: ${translationProbe.greek}`);
  if (/\p{Script=Devanagari}/u.test(translationProbe.hindi) || !/bʰaː/i.test(translationProbe.hindi)) errors.push(`Hindi IPA path failed: ${translationProbe.hindi}`);
  if (/\p{Script=Hangul}/u.test(translationProbe.korean) || !/han/i.test(translationProbe.korean)) errors.push(`Korean IPA path failed: ${translationProbe.korean}`);
  if (/\p{Script=Arabic}/u.test(translationProbe.arabic) || !/ʕ/.test(translationProbe.arabic)) errors.push(`Arabic IPA path failed: ${translationProbe.arabic}`);
  if (/[ΛƛΞΦȮΩŌꝎҸƷÞÐ]/.test(translationProbe.ipa)) errors.push(`IPA phonetic probe leaked DA glyphs: ${translationProbe.ipa}`);
  if (!translationProbe.diagnostics || translationProbe.diagnostics.version !== "2.0.0") errors.push("Translation diagnostics were unavailable or had the wrong version.");
  if (!translationProbe.ipaDiagnostics?.patched) errors.push(`IPA diagnostics unavailable: ${JSON.stringify(translationProbe.ipaDiagnostics)}`);
  if (!translationProbe.languageDiagnostics?.patched || translationProbe.languageDiagnostics.direct < 5) errors.push(`Language-aware IPA diagnostics were incomplete: ${JSON.stringify(translationProbe.languageDiagnostics)}`);
  if (!/IPA phonetics/i.test(translationProbe.header)) errors.push(`Phonetics header was not switched to IPA: ${translationProbe.header}`);
  if (!/IPA sound legend/i.test(translationProbe.legend)) errors.push(`IPA sound legend was not present: ${translationProbe.legend}`);

  const coordinationProbe = await page.evaluate(async () => {
    const row = document.createElement("li");
    row.innerHTML = '<div class="news-original"></div><div class="news-da"></div><div class="news-en"></div>';
    await window.hydrateNewsItem(row, "the quick brown fox", "en");
    const original = Array.from(row.querySelectorAll(".news-original .coordinated-word"));
    const ipa = Array.from(row.querySelectorAll(".news-da .coordinated-word"));
    const english = row.querySelector(".news-en");
    return {
      originalTexts: original.map((span) => span.textContent),
      ipaTexts: ipa.map((span) => span.textContent),
      originalColors: original.map((span) => span.style.getPropertyValue("--seg-color")),
      ipaColors: ipa.map((span) => span.style.getPropertyValue("--seg-color")),
      englishText: english?.textContent || "",
      englishElements: english?.childElementCount ?? -1,
    };
  });
  if (coordinationProbe.originalTexts.length !== 4 || coordinationProbe.ipaTexts.length !== 4) errors.push(`Word coordination did not preserve four word groups: ${JSON.stringify(coordinationProbe)}`);
  if (coordinationProbe.originalColors.join("|") !== coordinationProbe.ipaColors.join("|")) errors.push(`Original and IPA word colors do not match by index: ${JSON.stringify(coordinationProbe)}`);
  if (coordinationProbe.originalColors[0] === coordinationProbe.originalColors[1]) errors.push("Adjacent Original/IPA words received the same color.");
  if (coordinationProbe.englishText !== "the quick brown fox" || coordinationProbe.englishElements !== 0) errors.push(`English translation should be plain uncolored text: ${JSON.stringify(coordinationProbe)}`);

  const syllableProbe = await page.evaluate(() => {
    const target = document.createElement("div");
    window.setColorCodedSegments(target, "kəlɚ koʊdɪd sɪləbəl", "translation", "syllable");
    const spans = Array.from(target.querySelectorAll(".syllable"));
    return { diagnostics: window.__worldSyllableDiagnostics(), texts: spans.map((s) => s.textContent), colors: spans.map((s) => s.style.getPropertyValue("--seg-color")), indexes: spans.map((s) => s.dataset.syllableIndex) };
  });
  if (!syllableProbe.diagnostics?.patched || syllableProbe.diagnostics.paletteSize < 4) errors.push("IPA syllable color diagnostics were unavailable or incomplete.");

  const buildTagHidden = await page.evaluate(() => { const tag = document.querySelector("#build-tag"); return Boolean(tag && getComputedStyle(tag).display === "none"); });
  if (!buildTagHidden) errors.push("Build tag should be hidden unless debug mode is enabled.");

  await page.goto(debugUrl.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(() => document.body.classList.contains("debug-mode"), { timeout: 5000 });
  const buildTagVisible = await page.evaluate(() => { const tag = document.querySelector("#build-tag"); return Boolean(tag && getComputedStyle(tag).display !== "none"); });
  if (!buildTagVisible) errors.push("Build tag should be visible when ?debug=1 is present.");
} finally {
  await browser.close();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}

if (errors.length) {
  console.error("Browser smoke test failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Browser smoke test passed: language-aware IPA, coordinated Original/IPA word colors, plain English, legend, and globe loaded without JS errors.");