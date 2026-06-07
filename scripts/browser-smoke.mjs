import { chromium } from "playwright";

const url = process.env.SMOKE_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];

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
} finally {
  await browser.close();
}

if (errors.length) {
  console.error("Browser smoke test failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Browser smoke test passed: page loaded, rendered country rows, and threw no JS errors.");
