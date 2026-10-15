// Screenshots of the static Today mockup for both font pairings (desktop + mobile).
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const browser = await chromium.launch();
  const file = "file://" + path.join(__dirname, "today.html");
  for (const pair of ["a", "b"]) {
    for (const [name, width, height, full] of [["desktop", 1280, 1000, true], ["mobile", 390, 844, false], ["mobile-full", 390, 844, true]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
      await page.goto(`${file}?pair=${pair}`);
      await page.evaluate(() => document.fonts.ready);
      const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
      await page.screenshot({ path: path.join(__dirname, `today-${pair}-${name}.png`), fullPage: full });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      console.log(pair, name, "fonts:", [...new Set(fonts)].join(","), "overflow:", overflow);
      await page.close();
    }
  }
  await browser.close();
})();
