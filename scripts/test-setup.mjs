import { existsSync, readFileSync } from "node:fs";

const browserPaths = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/firefox",
  "/usr/bin/firefox-esr",
].filter(Boolean);

function isSnapWrapper(path, browserName) {
  try {
    const contents = readFileSync(path, "utf8");
    return contents.includes(`requires the ${browserName} snap to be installed`);
  } catch {
    return false;
  }
}

const existingBrowser = browserPaths.find((path) => {
  if (!existsSync(path)) return false;
  return !isSnapWrapper(path, path.includes("firefox") ? "firefox" : "chromium");
});

if (existingBrowser) {
  console.log(`Browser already available at ${existingBrowser}`);
  process.exit(0);
}

console.log("No usable browser executable found; skipping Playwright browser setup on this platform.");
process.exit(0);
