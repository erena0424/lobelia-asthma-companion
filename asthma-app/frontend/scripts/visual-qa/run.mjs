// Visual QA: visits every screen and pop-up at several widths, saves a screenshot
// of each state, and flags layout problems automatically:
//   - horizontal page scroll
//   - visible elements that stick out of their modal / clipping container / viewport
//   - buttons, labels and headings whose text is cut off (scrollWidth > clientWidth)
//
// Needs: the Vite dev server (npm run dev) pointed at a FAKE API on 127.0.0.1:8000
// (any login accepted), and the `playwright` package (npm i -D playwright, or set
// NODE_PATH to a node_modules that has it). Never run it against real user data.
//
//   BASE_URL=http://localhost:5199/Mirror-Lake/ OUT_DIR=./qa-shots node scripts/visual-qa/run.mjs
//   WIDTHS=375,1440 ONLY=calendar,help node scripts/visual-qa/run.mjs   # subset
//
// Exit code 1 when any problem is found. Results: OUT_DIR/report.json + screenshots.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// require() honours NODE_PATH, so a Playwright install elsewhere can be reused
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:5199/Mirror-Lake/";
const API = process.env.API_URL || "http://127.0.0.1:8000";
const OUT = path.resolve(process.env.OUT_DIR || "qa-shots");
const WIDTHS = (process.env.WIDTHS || "375,768,1280,1440,2000").split(",").map(Number);
const ONLY = process.env.ONLY || "";
const HEIGHT = 900;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- layout checks (run inside the page) ----------
function findProblems() {
  const problems = [];
  const vw = document.documentElement.clientWidth;

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    problems.push(`page scrolls horizontally (${document.documentElement.scrollWidth}px > ${window.innerWidth}px)`);
  }

  const describe = (el) => {
    const text = (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const cls = typeof el.className === "string" ? el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };

  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // intentional: sliding landing panel, collapsed navbar, ellipsized calendar chips,
  // the calendar's own scroll area, and anything inside an aria-hidden subtree
  const ignored = (el) =>
    el.closest(".navbar-collapse:not(.show)") ||
    el.closest("[aria-hidden='true']") ||
    el.matches(".cal-chip, .cal-chip *, .cal-block, .cal-block *") ||
    el.closest(".visually-hidden") ||
    // landing page: a 2-panel track slides sideways; only its on-screen panel matters
    el.matches("[data-qa-slider-track]") ||
    // icon paths are clipped by their own svg box on purpose
    (el.closest("svg") && el.tagName.toLowerCase() !== "svg") ||
    (el.closest("[data-qa-slider-track]") &&
      (el.getBoundingClientRect().left >= vw - 2 || el.getBoundingClientRect().right <= 2)) ||
    // Bootstrap rows use negative side margins by design; their children are still checked
    el.matches(".row");

  const clipper = (el) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.matches(".form-modal, .profile-modal, .spinner-box")) return node;
      const style = getComputedStyle(node);
      if (["hidden", "clip", "auto", "scroll"].includes(style.overflowX)) return node;
    }
    return null;
  };

  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || ignored(el)) continue;
    const rect = el.getBoundingClientRect();
    const parentClip = clipper(el);
    const box = parentClip ? parentClip.getBoundingClientRect() : { left: 0, right: vw };
    const scrollsX = parentClip && ["auto", "scroll"].includes(getComputedStyle(parentClip).overflowX) && parentClip.scrollWidth > parentClip.clientWidth;

    // only report the outermost offender of a subtree
    if (!scrollsX && (rect.right > box.right + 2 || rect.left < box.left - 2)) {
      const parentReported = [...seen].some((other) => other.contains(el));
      if (!parentReported) {
        seen.add(el);
        problems.push(`sticks out of ${parentClip ? describe(parentClip) : "viewport"} by ${Math.round(Math.max(rect.right - box.right, box.left - rect.left))}px: ${describe(el)}`);
      }
    }

    if (el.matches("button, .btn, a.help-call-button, label, h1, h2, h3, legend, .check-in-chip")) {
      const style = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && style.overflowX !== "visible" && style.textOverflow !== "ellipsis") {
        problems.push(`text clipped: ${describe(el)}`);
      }
    }
  }

  return problems;
}

// ---------- helpers ----------
async function login(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (api) => {
    const res = await fetch(`${api}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "qa@example.com", password: "Demo123!" }),
    });
    const { access_token: token } = await res.json();
    localStorage.clear();
    localStorage.setItem("token", token);
    localStorage.setItem("setupComplete", "true");
  }, API);
}

async function go(page, hash) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await wait(900);
}

async function clickText(page, text, scope = "body") {
  await page.locator(`${scope} button, ${scope} a`).filter({ hasText: text }).first().click();
  await wait(500);
}

async function closeModal(page) {
  const close = page.locator(".form-modal .absolute-top-right, .profile-modal-close").first();
  if (await close.count()) {
    await close.click();
    await wait(300);
  }
}

// ---------- states ----------
// each: [name, async (page) => {...}]  — page is already logged in unless named "public-*"
const STATES = [
  ["public-landing", async (page) => { await go(page, "#/"); }],
  ["public-landing-faq", async (page) => {
    await go(page, "#/");
    for (const summary of await page.locator(".lp-faq summary").all()) await summary.click();
  }],
  ["public-login", async (page) => { await go(page, "#/login"); }],
  ["public-signup", async (page) => { await go(page, "#/signup"); }],
  ["public-privacy", async (page) => { await go(page, "#/privacy"); }],

  ["setup-welcome", async (page) => {
    await page.evaluate(() => localStorage.setItem("setupComplete", "false"));
    await page.reload(); await wait(800); await go(page, "#/setup");
  }],
  ["setup-profile", async (page) => {
    await page.evaluate(() => localStorage.setItem("setupComplete", "false"));
    await page.reload(); await wait(800); await go(page, "#/setup");
    await page.locator('button[aria-label="next"]').click(); await wait(400);
  }],

  ["today", async (page) => { await go(page, "#/home"); await wait(600); }],
  ["today-add-plan", async (page) => { await go(page, "#/home"); await wait(600); await clickText(page, "Add a plan"); }],
  ["check-in", async (page) => { await go(page, "#/check-in"); }],
  ["check-in-filled", async (page) => {
    await go(page, "#/check-in");
    await page.locator('[aria-label="Okay"]').click();
    await clickText(page, "Reliever use");
  }],
  ["check-in-saved", async (page) => {
    await go(page, "#/check-in");
    await page.locator('[aria-label="Good"]').click();
    await clickText(page, "Save check-in"); await wait(3500);
  }],
  ["statistics", async (page) => { await go(page, "#/statistics"); await wait(800); }],

  ["calendar-week", async (page) => { await go(page, "#/calendar"); await clickText(page, "Week", ".cal-views"); }],
  ["calendar-day", async (page) => { await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views"); }],
  ["calendar-month", async (page) => { await go(page, "#/calendar"); await clickText(page, "Month", ".cal-views"); }],
  ["calendar-list", async (page) => { await go(page, "#/calendar"); await clickText(page, "List", ".cal-views"); }],
  ["calendar-plan-details", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    await page.locator(".cal-block").first().click(); await wait(800);
  }],
  ["calendar-edit-plan", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    await page.locator(".cal-block").first().click(); await wait(600);
    await clickText(page, "Edit", ".form-modal");
  }],
  ["calendar-add-plan-slot", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    const col = page.locator(".cal-day-col").first();
    const box = await col.boundingBox();
    await page.mouse.click(box.x + 20, box.y + 48 * 13 + 5); await wait(600);
  }],

  ["profile", async (page) => { await go(page, "#/profile"); }],
  ["profile-edit-details", async (page) => { await go(page, "#/profile"); await page.locator('[aria-label="Edit profile details"]').click(); await wait(400); }],
  ["profile-edit-symptoms", async (page) => { await go(page, "#/profile"); await page.locator('[aria-label="Edit Known Symptoms"]').click(); await wait(400); }],
  ["profile-edit-contacts", async (page) => { await go(page, "#/profile"); await page.locator('[aria-label="Edit Emergency Contacts"]').click(); await wait(400); }],
  ["profile-edit-action-plan", async (page) => { await go(page, "#/profile"); await page.locator('[aria-label="Edit My asthma action plan"]').click(); await wait(400); }],
  ["profile-edit-support", async (page) => { await go(page, "#/profile"); await page.locator('[aria-label="Edit Asthma support information"]').click(); await wait(400); }],
  ["profile-edit-about-you", async (page) => { await go(page, "#/profile"); await page.locator('[aria-label="Edit About you"]').click(); await wait(400); }],

  ["help-danger-1", async (page) => { await go(page, "#/help"); }],
  ["help-emergency", async (page) => { await go(page, "#/help"); await clickText(page, "Yes", ".help-card"); }],
  ["help-questions", async (page) => {
    await go(page, "#/help");
    for (let i = 0; i < 3; i += 1) await clickText(page, "No", ".help-card");
  }],
  ...[
    ["green", ["None", "No", "No", "No", "Yes", "No", "No"]],
    ["yellow", ["Mild", "Yes", "Yes", "No", "Some", "No", "Yes, it helped"]],
    ["red", ["Severe", "Yes", "Yes", "Yes", "No", "Yes", "Yes, but not enough"]],
  ].map(([zone, picks]) => [`help-result-${zone}`, async (page) => {
    await go(page, "#/help");
    for (let i = 0; i < 3; i += 1) await clickText(page, "No", ".help-card");
    const groups = page.locator("fieldset.help-question");
    for (let i = 0; i < picks.length; i += 1) {
      await groups.nth(i).locator("button").filter({ hasText: new RegExp(`^${picks[i].replace(/[.,]/g, "\\$&")}$`) }).first().click();
    }
    await clickText(page, "See what to do"); await wait(500);
  }]),

  ...[
    ["chat-empty", 0],
    ["chat-one-reply", 2500],
  ].map(([name, settle]) => [name, async (page, width) => {
    if (width < 768) await go(page, "#/chat");
    else {
      await go(page, "#/home");
      await page.locator('.chatbot-floating button[aria-label="Expand chat"]').click();
    }
    await wait(settle);
  }]),
  ["chat-retry", async (page, width) => {
    // the fake API fails the companion while this file exists
    fs.writeFileSync(path.join(process.env.MOCK_DIR || ".", "fail_companion"), "");
    try {
      if (width < 768) await go(page, "#/chat");
      else {
        await go(page, "#/home");
        await page.locator('.chatbot-floating button[aria-label="Expand chat"]').click();
      }
      await wait(1500);
    } finally {
      fs.rmSync(path.join(process.env.MOCK_DIR || ".", "fail_companion"), { force: true });
    }
  }],
  ["feedback-form", async (page) => {
    await go(page, "#/profile");
    await clickText(page, "Send feedback to the Lobelia team");
    await page.locator(".form-modal textarea").fill("The check-in faces are great!");
    await page.locator(".feedback-check input").check();
  }],
  ["feedback-sent", async (page) => {
    await go(page, "#/profile");
    await clickText(page, "Send feedback to the Lobelia team");
    await page.locator(".form-modal textarea").fill("Looks good");
    await clickText(page, "Send", ".form-modal"); await wait(800);
  }],
  ["feedback-error", async (page) => {
    // the fake API fails /feedback while this file exists
    fs.writeFileSync(path.join(process.env.MOCK_DIR || ".", "fail_feedback"), "");
    try {
      await go(page, "#/home");
      await clickText(page, "Send feedback", "footer");
      await page.locator(".form-modal textarea").fill("Testing the error state");
      await clickText(page, "Send", ".form-modal"); await wait(800);
    } finally {
      fs.rmSync(path.join(process.env.MOCK_DIR || ".", "fail_feedback"), { force: true });
    }
  }],
  ["public-feedback", async (page) => {
    await go(page, "#/");
    await clickText(page, "Send feedback", ".lp-footer");
    await page.locator(".feedback-check input").check();
  }],
  ["connection-problem", async (page) => {
    // the fake API fails /users/me while this file exists
    fs.writeFileSync(path.join(process.env.MOCK_DIR || ".", "fail_profile"), "");
    try {
      await go(page, "#/home"); await page.reload(); await wait(16000);
    } finally {
      fs.rmSync(path.join(process.env.MOCK_DIR || ".", "fail_profile"), { force: true });
    }
  }],
  ["crash-screen", async (page) => {
    await page.evaluate(() => localStorage.setItem("lobelia-qa-crash", "1"));
    await page.reload(); await wait(1200);
  }],
];

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const width of WIDTHS) {
  fs.mkdirSync(path.join(OUT, String(width)), { recursive: true });

  for (const [name, setup] of STATES) {
    if (ONLY && !ONLY.split(",").some((part) => name.includes(part))) continue;
    if (["connection-problem", "chat-retry", "feedback-error"].includes(name) && !process.env.MOCK_DIR) continue;

    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, hasTouch: width < 768, isMobile: false });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    let problems = [];
    try {
      if (name.startsWith("public-")) {
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => localStorage.clear());
        await page.reload(); await wait(800);
      } else {
        await login(page); await page.reload(); await wait(1200);
      }
      await setup(page, width);
      await wait(300);
      problems = await page.evaluate(findProblems);
      // with a pop-up open, a stitched full-page capture repeats the sticky menu mid-page
      const modalOpen = (await page.locator(".form-modal, .profile-modal").count()) > 0;
      await page.screenshot({ path: path.join(OUT, String(width), `${name}.png`), fullPage: !modalOpen });
    } catch (error) {
      problems.push(`STATE FAILED: ${error.message.split("\n")[0]}`);
    }
    if (errors.length && name !== "crash-screen") problems.push(...errors.map((message) => `page error: ${message}`));

    report.push({ width, state: name, problems });
    console.log(`${problems.length ? "✗" : "✓"} ${width}px ${name}${problems.length ? `\n    - ${problems.join("\n    - ")}` : ""}`);
    await context.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const failing = report.filter((item) => item.problems.length);
console.log(`\n${report.length - failing.length}/${report.length} states clean. Screenshots: ${OUT}`);
process.exit(failing.length ? 1 : 0);
