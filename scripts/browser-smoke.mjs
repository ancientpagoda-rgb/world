import { chromium } from "playwright";

const url = process.env.SMOKE_URL || "http://127.0.0.1:4173/";
const debugUrl = new URL(url);
debugUrl.searchParams.set("debug", "1");
async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chromium" });
  } catch (error) {
    const message = error?.message || String(error);
    if (message.includes("Executable doesn't exist")) {
      console.error("Playwright browser is missing. Run `npm run test:setup` before `npm run test:smoke`.");
    }
    throw error;
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

await page.addInitScript(() => {
  window.__starfieldResizeCount = 0;
  for (const prop of ["width", "height"]) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
    if (!descriptor?.set || !descriptor?.get) continue;
    Object.defineProperty(HTMLCanvasElement.prototype, prop, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        if (this.id === "starfield-canvas") window.__starfieldResizeCount += 1;
        return descriptor.set.call(this, value);
      },
    });
  }
});

page.on("pageerror", (error) => {
  errors.push(error.stack || error.message || String(error));
});

page.on("console", (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
  }
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#starfield-canvas", { timeout: 5000 });
  await page.waitForSelector("#weather-orb-canvas", { timeout: 5000 });
  await page.waitForFunction(
    () => document.querySelector("#country-list")?.children.length > 0,
    { timeout: 15000 },
  );
  await page.waitForTimeout(1500);

  const buildTag = await page.locator("#build-tag").innerText().catch(() => "");
  if (/ERROR:/i.test(buildTag)) {
    errors.push(`Build tag contains runtime error text: ${buildTag}`);
  }

  const canvasReady = await page.evaluate(() => {
    const canvas = document.querySelector("#weather-orb-canvas");
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  });
  if (!canvasReady) errors.push("Weather canvas did not initialize with a drawable size.");

  const starfieldResizeCount = await page.evaluate(() => window.__starfieldResizeCount || 0);
  if (starfieldResizeCount > 4) {
    errors.push(`Starfield canvas resized too often: ${starfieldResizeCount} assignments.`);
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
}

if (errors.length) {
  console.error("Browser smoke test failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Browser smoke test passed: page loaded, rendered country rows, and threw no JS errors.");
