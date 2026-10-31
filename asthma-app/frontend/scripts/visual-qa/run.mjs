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

// the calendar-synced-* states add a "Synced walk" plan; take it out again so other states look the same
async function removeSyncedWalks(page) {
  await page.evaluate(async (api) => {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` };
    const today = new Date().toLocaleDateString("en-CA");
    const res = await fetch(`${api}/v1/check-ins?from=${today}&to=${today}`, { headers });
    const row = ((await res.json()).items || []).find((item) => item.date === today);
    const events = row?.calendar_events || [];
    const walks = events.filter((event) => event.title === "Synced walk");
    if (!walks.length) return;
    for (const walk of walks) {
      if (walk.google_event_id) await fetch(`${api}/v1/calendar/events/${walk.google_event_id}`, { method: "DELETE", headers });
    }
    const kept = events.filter((event) => event.title !== "Synced walk");
    await fetch(`${api}/v1/calendar/manual-events`, { method: "POST", headers, body: JSON.stringify({ date: today, events: kept }) });
  }, API);
}

async function go(page, hash) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await wait(900);
}

async function clickText(page, text, scope = "body") {
  const target = page.locator(`${scope} button, ${scope} a`).filter({ hasText: text }).first();
  // centre it first so the phone tab bar (fixed at the bottom) never covers it
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await target.click();
  await wait(500);
}

// taps the empty bottom corner of a Month cell (not its day number, dot or plan chips)
async function clickCellSpace(page, selector, which = "first") {
  const cell = page.locator(selector)[which]();
  await cell.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await cell.boundingBox();
  await cell.click({ position: { x: box.width - 4, y: box.height - 4 } });
}

// answers the three required yes/no questions on the Day check-in page, in order
async function answerBasics(page, answers) {
  const questions = page.locator(".check-in-question");
  for (let index = 0; index < answers.length; index += 1) {
    await questions.nth(index).locator("button", { hasText: answers[index] }).click();
  }
  await wait(200);
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
  // Today card states: the fake API reads MOCK_DIR/today_state
  ...["none", "green", "strong", "escalate", "escalate_quiet", "no_plan", "flagged", "quick_log", "quiet"].map((state) => [`today-${state.replace("_", "-")}`, async (page) => {
    fs.writeFileSync(path.join(process.env.MOCK_DIR || ".", "today_state"), state);
    try {
      await page.reload(); await wait(1200); await go(page, "#/home"); await wait(800);
    } finally {
      fs.rmSync(path.join(process.env.MOCK_DIR || ".", "today_state"), { force: true });
    }
  }]),
  ["today-add-plan", async (page) => { await go(page, "#/home"); await wait(600); await clickText(page, "Add a plan"); }],
  ["quick-log-sheet", async (page) => { await go(page, "#/home"); await wait(600); await clickText(page, "Log right now"); }],
  ["quick-log-strong", async (page) => {
    await go(page, "#/home"); await wait(600); await clickText(page, "Log right now");
    await page.locator("#quick-wheezing").fill("8");
    await clickText(page, "It's limiting what I'm doing", ".form-modal");
  }],
  // the Day check-in pre-filled from the fake API's two quick logs
  ["check-in", async (page) => { await go(page, "#/check-in"); await wait(600); }],
  // the fake API shows no quick logs while MOCK_DIR/no_quick_logs exists
  ...["check-in-no-logs", "check-in-missing", "check-in-filled", "check-in-saved"].map((name) => [name, async (page) => {
    fs.writeFileSync(path.join(process.env.MOCK_DIR || ".", "no_quick_logs"), "");
    try {
      await go(page, "#/check-in"); await wait(600);
      if (name === "check-in-missing") await clickText(page, "Save day check-in");
      if (name === "check-in-filled") {
        await page.locator("#breathing-wheezing").fill("4");
        await answerBasics(page, ["No", "No", "Yes"]);
        await page.locator('[aria-label="Okay"]').click();
        await clickText(page, "Pollen");
      }
      if (name === "check-in-saved") {
        await clickText(page, "No symptoms today");
        await answerBasics(page, ["No", "No", "No"]);
        await clickText(page, "Save day check-in"); await wait(3500);
      }
    } finally {
      fs.rmSync(path.join(process.env.MOCK_DIR || ".", "no_quick_logs"), { force: true });
    }
  }]),
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
  // Google Calendar states need the mock's google_connected flag (see mock_api.py)
  ["calendar-google-details", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    await page.locator(".cal-block", { hasText: "Outdoor run" }).first().click(); await wait(800);
  }],
  ["calendar-google-edit", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    await page.locator(".cal-block", { hasText: "Outdoor run" }).first().click(); await wait(600);
    await clickText(page, "Edit", ".form-modal");
  }],
  ["calendar-google-delete-confirm", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    await page.locator(".cal-block", { hasText: "Outdoor run" }).first().click(); await wait(600);
    await clickText(page, "Delete", ".form-modal");
  }],
  // a new plan added to Google too (needs google_connected; adds a plan to the fake API)
  ...["calendar-synced-details", "calendar-synced-delete-confirm"].map((name) => [name, async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    const col = page.locator(".cal-day-col").first();
    const box = await col.boundingBox();
    await page.mouse.click(box.x + 20, box.y + 48 * 7 + 5); await wait(600);
    await page.locator('.form-modal input[name="title"]').fill("Synced walk");
    await clickText(page, "Save plan", ".form-modal"); await wait(1200);
    await page.locator(".cal-block", { hasText: "Synced walk" }).first().click(); await wait(600);
    if (name === "calendar-synced-delete-confirm") await clickText(page, "Delete", ".form-modal");
  }]),
  ["calendar-sheet-today", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Month", ".cal-views");
    await clickCellSpace(page, ".cal-month-cell.cal-today"); await wait(600);
  }],
  ["calendar-sheet-timed", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Month", ".cal-views");
    await clickCellSpace(page, ".cal-month-cell.cal-today"); await wait(600);
    await page.locator(".plan-switch").click(); await wait(300);
  }],
  ["calendar-sheet-today-check-in", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Month", ".cal-views");
    await clickCellSpace(page, ".cal-month-cell.cal-today"); await wait(600);
    await clickText(page, "Day check-in", ".day-sheet-tabs"); await wait(600);
  }],
  ["calendar-sheet-past", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Month", ".cal-views");
    await clickCellSpace(page, ".cal-month-cell:not(.cal-outside)", "first"); await wait(900);
  }],
  ["calendar-sheet-future", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Month", ".cal-views");
    await clickCellSpace(page, ".cal-month-cell:not(.cal-outside)", "last"); await wait(600);
  }],
  ["calendar-quick-log", async (page) => {
    await go(page, "#/calendar"); await clickText(page, "Day", ".cal-views");
    const marks = page.locator(".cal-qlog");
    await marks.last().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await marks.last().click(); await wait(600);
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
      await page.locator(".shell-chat").click();
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
        await page.locator(".shell-chat").click();
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
    if ((["connection-problem", "chat-retry", "feedback-error"].includes(name) || /^today-(none|green|strong|escalate|escalate-quiet|no-plan|flagged)$/.test(name)) && !process.env.MOCK_DIR) continue;

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
        await login(page);
        if (name.startsWith("calendar-")) await removeSyncedWalks(page);
        await page.reload(); await wait(1200);
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
