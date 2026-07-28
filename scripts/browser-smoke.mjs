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
const { server, url } = providedUrl
  ? { server: null, url: providedUrl }
  : await startStaticServer();
const debugUrl = new URL(url);
debugUrl.searchParams.set("debug", "1");

function resolveChromiumExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    ...discoverCachedChromiumExecutables(),
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
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
  const candidates = [
    process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH,
    "/usr/bin/firefox",
    "/usr/bin/firefox-esr",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate) && !isSnapWrapper(candidate, "firefox"));
}

function isSnapWrapper(path, browserName) {
  try {
    const contents = readFileSync(path, "utf8");
    return contents.includes(`requires the ${browserName} snap to be installed`);
  } catch {
    return false;
  }
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const requestedUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = requestedUrl.pathname === "/" ? "/index.html" : requestedUrl.pathname;
      const decodedPath = decodeURIComponent(pathname);
      const filePath = normalize(join(root, decodedPath));

      if (filePath !== root && !filePath.startsWith(root + sep)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Length": fileStat.size,
        "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not start local smoke-test server");
  }

  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function launchBrowser() {
  const executablePath = resolveChromiumExecutablePath();
  if (executablePath) {
    try {
      return await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    } catch (error) {
      console.warn(`Chromium at ${executablePath} could not launch: ${error.message}`);
    }
  }

  try {
    return await chromium.launch({ args: ["--no-sandbox"] });
  } catch (error) {
    console.warn(`Bundled Chromium could not launch: ${error.message}`);
  }

  const firefoxExecutablePath = resolveFirefoxExecutablePath();
  if (firefoxExecutablePath) {
    try {
      return await firefox.launch({ executablePath: firefoxExecutablePath });
    } catch (error) {
      console.warn(`Firefox at ${firefoxExecutablePath} could not launch: ${error.message}`);
    }
  }

  return null;

}

let browser;
const errors = [];

try {
  browser = await launchBrowser();
  if (!browser) {
    console.log("Browser smoke test skipped: no usable browser executable found on this platform.");
    process.exit(0);
  }
} catch (error) {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  throw error;
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on("pageerror", (error) => {
  errors.push(error.stack || error.message || String(error));
});

page.on("console", (message) => {
  if (message.type() === "error") {
    const location = message.location();
    if (location.url.endsWith("/favicon.ico")) return;
    const suffix = location.url ? ` (${location.url})` : "";
    errors.push(`${message.text()}${suffix}`);
  }
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.querySelector("#country-list")?.children.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(1500);

  const buildTag = await page.locator("#build-tag").innerText().catch(() => "");
  if (/ERROR:/i.test(buildTag)) {
    errors.push(`Build tag contains runtime error text: ${buildTag}`);
  }

  const firstRowText = await page.evaluate(() => {
    const row = document.querySelector("#country-list .country-row");
    return row ? row.textContent || "" : "";
  });
  if (!/India/i.test(firstRowText)) {
    errors.push(`First country row should begin with India, got: ${firstRowText.slice(0, 120)}`);
  }

  const buildTagHidden = await page.evaluate(() => {
    const tag = document.querySelector("#build-tag");
    return Boolean(tag && getComputedStyle(tag).display === "none");
  });
  if (!buildTagHidden) errors.push("Build tag should be hidden unless debug mode is enabled.");

  await page.goto(debugUrl.toString(), { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(
    () => document.body.classList.contains("debug-mode"),
    { timeout: 5000 },
  );
  const buildTagVisible = await page.evaluate(() => {
    const tag = document.querySelector("#build-tag");
    return Boolean(tag && getComputedStyle(tag).display !== "none");
  });
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

console.log("Browser smoke test passed: page loaded, rendered country rows, and threw no JS errors.");
