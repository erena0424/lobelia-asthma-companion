# Lobelia redesign plan

Status: direction approved by Elena (2026-10-14). Scope: a shared design system, a new marketing landing page, the Today page, and smaller text plus clearer sections on every other page. Built on the `prototype-fixes` branch with the existing stack (React, Vite, react-bootstrap, plain CSS). No new dependencies.

Not changing: medical logic, risk thresholds (0.40 / 0.70), the trouble-breathing rules and flow, API contracts, or any backend behaviour.

## 1. What's wrong today (specifics)

| Problem | Where |
|---|---|
| Text is too big everywhere. Page titles go up to 64px, section titles to 48px, card text to 40px, and buttons to 36px in a display serif | `index.css` `--font-*` tokens (`--font-header-size: clamp(40px, 6vw, 64px)`, `--font-section-text-size: clamp(25px, 4vw, 40px)`, `--font-large-button-*: Abril Fatface 22–36px`) |
| Buttons use the decorative Abril Fatface face with up to 144px of side padding, so labels look shouty and rows overflow | `.btn`, `.btn-large-text`, `.btn-medium-text` in `index.css` |
| Heavy 4px borders on every card and input make each section look boxed in, and everything has equal visual weight | `--stroke-width: 4px`, `.green-theme`, `.home-card`, `.profile-*` |
| Today is a stack of full-width sections with repeated information. The "Next" card repeats the schedule, and there's a separate forecast, next step, triggers, preventive measures and inhaler button | `HomePage.jsx`, `TodayPlan.jsx` |
| The risk "34%" implied a calibrated probability (now replaced by Low/Medium/High) | `HomePage.jsx`, `StatisticsPage.jsx` |
| The landing page is a title and an illustration only. It doesn't explain what Lobelia does or why to trust it | `LandingContent.jsx`, `About.jsx` |
| Bootstrap CSS is loaded twice (CDN in `index.html` and an import in `main.jsx`) | |
| Spacing utilities (`vertical-8 … vertical-40`) are used inconsistently, so there's no rhythm | `index.css` |
| The floating chat is 800px wide and covers content | `Chatbot.jsx` |

## 2. Must be preserved

Every route and flow:
- landing/login/signup with code verification and forgot password, setup steps, Today, Check-in (faces, 0–10 scales, context chips, reliever puffs, triggers, note, companion reply), Statistics (ranges, charts, summary download), Calendar (Month/Week/Day/List, click or drag to add, edit, delete, check-in markers), Profile (details, photo, symptoms, triggers, contacts, action plan, support info, About you, feedback), the Help flow (danger signs, questions, Green/Yellow/Red results, emergency screen, Call 911, find ER), the chat (tone, keyword banner, retry), the feedback form, privacy, the error and connection screens, and the "Trouble breathing?" button on every page.

All API calls and data stay the same.

## 3. Design system

### Typography (fonts already bundled; no new downloads)

| Role | Font | Before | After |
|---|---|---|---|
| Brand wordmark ("Lobelia") | Abril Fatface | 80–128px | 32px in the header, 56–72px in the landing hero only |
| Page title (h1) | Libre Bodoni | 40–64px | 28px mobile, 32px desktop |
| Section title (h2) | Afacad 700 | 30–48px | 20px mobile, 22–24px desktop |
| Card title (h3) | Afacad 600 | ~section size | 18px |
| Body | Afacad 400 | 12–20px (varies with screen width) | 16px fixed, line-height 1.5 |
| Small / meta | Afacad 400 | 8–20px | 14px |
| Caption / hint | Afacad 400 | — | 13px |
| Buttons | Abril Fatface 15–36px | | Afacad 600, 16px (15px for small buttons) |

Abril Fatface is kept only for the wordmark, so the brand still shows without making every button shout.

### Spacing, radii, borders, depth
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64. Existing `--space-*` are kept, and `--space-4` and `--space-12` are added.
- **Radii:** 8 (inputs and chips), 12 (small cards), 16 (cards), 24 (hero panels), 999 (pills).
- **Borders:** 1px `--color-line` (#E5E2DA) by default. 2px only for emphasis, such as the outlook card ring and the help row.
- **Shadows:** `--shadow-1: 0 1px 2px rgba(24,64,63,.06)`, `--shadow-2: 0 6px 20px rgba(24,64,63,.08)`. Used sparingly, for raised cards and pop-ups.
- **Surfaces:**
  - page: cream #FFFBF2
  - card: #FFFFFF with a 1px line
  - quiet section: sage tint (mix of #D1DFAD and cream)
  - inverse: teal #18403F for the outlook/next-up highlight

### Colors (from the original palette; ratios vs cream #FFFBF2)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--color-secondary` (brand teal) | #18403F | text, primary buttons | 11.0:1 |
| `--color-tertiary` (sage) | #D1DFAD | fills and tints only | n/a, decorative |
| `--zone-green-text` | #4B573A | small green text | ~7.5:1 |
| info | teal #18403F on a sage tint | observations, tips | 11.0:1 |
| caution (`--color-amber`) | #9A5B00 | Medium outlook, Yellow zone | 5.3:1 |
| urgent (`--color-emergency`) | #AA0041 | Call 911 only | 7.3:1 |
| alert (`--color-alert`, plum) | #5F0024 | trouble-breathing entry points | 13.5:1 |
| pink (`--color-error-light`) | #FF94BD | tints only, never text | 2.0:1 |

Status is never shown by color alone: each one also has a word (Low / Medium / High, Green / Yellow / Red) and an icon or label.

### Components (new, in `src/components/ui/`)
`Card` (variants: plain, quiet, inverse), `SectionHeader`, `Button` (primary teal, secondary outline, quiet/link, alert plum, emergency crimson; sizes md/sm; visible focus ring), `Chip`, `StatusBadge` (Low/Medium/High and zone), `InsightNote` (labels AI suggestions as "Suggestion" and model output as "Estimate"), `EmptyState`, `PageHeader`. Existing pages switch to these progressively; old classes remain until each page is converted.

### Layout
- **Desktop:** content max-width 1120px, centred, on a 12-column grid. Page padding 24px desktop, 16px mobile.
- **Breakpoints:** 576 / 768 / 992 / 1200 (Bootstrap's).
- **Motion:** respects `prefers-reduced-motion`. Only a short fade when new insights arrive.

## 4. Today page

Mobile order, top to bottom:

1. **Page header:** "Good morning, Name", date, and the persistent "Trouble breathing?" button (plum, always visible, also in the header on every page).
2. **Today's outlook** (primary card, teal inverse): a Low/Medium/High badge, "what this means" in one sentence, the 2–3 main factors (pollen, air, cold, recent symptoms) as chips, and the next-step guidance. A footnote reads "Estimate based on today's conditions and your recent check-ins. Not a diagnosis." This replaces the separate risk circle, Next Step, Predicted Triggers and Preventive Measures blocks.
3. **Your day** (schedule card): the morning summary (labelled "Suggestion"), then plans in time order, each with its own one-line tip. The upcoming plan is highlighted. "Add a plan" sits at the bottom of the card. This replaces the separate "Next:" banner.
4. **Check in & inhaler** (compact card with two actions): "Start check-in" (with "Done today ✓" when complete) and "I used my rescue inhaler" (secondary button, with a puff count).
5. **Footer:** feedback and privacy links.

On desktop: a 2-column layout with the outlook and day plan on the left (8 columns) and check-in, inhaler and chat on the right (4 columns).

Chat: the launcher is a small round button at the bottom-right (56px), with 88px of bottom padding reserved on every page so it never covers controls. It opens a right-side panel (max 420px) on desktop and a full-screen sheet on mobile. It never covers the help button.

## 5. Landing page (new, public)

Skeleton modelled on Petirien's landing page. All copy is a draft and needs `regulatory-claims` review.

1. **Header:** the Lobelia wordmark, with Log in and Sign up on the right.
2. **Hero** (with the lung-flower illustration on the right):
   - Headline: **Plan your day around your asthma.**
   - Subhead: "Lobelia brings together today's weather, pollen and air quality, your quick check-ins, and your plans, then gives you a simple daily outlook and practical tips before each part of your day."
   - Buttons: **Sign up** (primary), **Log in** (secondary).
3. **An example** (labelled "Invented example"): a sample Today card showing a Medium outlook with "why" (moderate pollen, cold evening), and two plans with tips ("Chemistry lab 2:30: be mindful of strong scents"; "Skating 5:00: cold air can be a trigger").
4. **How it works** (3 steps):
   1. Check in for a minute: how you feel and how your breathing is.
   2. Lobelia reads your day: weather, pollen, air quality, and the plans you add.
   3. Get guidance through the day: a morning outlook and a tip before each plan.
5. **Features** (short text and a small visual each):
   - Daily outlook: Low/Medium/High, with what it means.
   - Tips for each plan.
   - Calendar with month/week/day views.
   - Trouble-breathing help that follows your own action plan. The steps follow fixed rules, so the AI never picks a zone or a dose, and your plan is never sent to the AI.
6. **Trust:**
   - Not a medical device and not a substitute for your clinician.
   - Your information is private to you.
   - You can delete it anytime.
   - Link to the Privacy Policy.
7. **FAQ** (accordion):
   - *Is this medical advice?* No. Lobelia supports self-management and doesn't diagnose or treat.
   - *How is the outlook made?* A model looks at local weather, pollen and air quality and your recent check-ins. It's an estimate, not a diagnosis.
   - *What data do you use?* Your check-ins, profile, plans and approximate location.
   - *Does it read my calendar?* Only if you connect Google Calendar, and read-only. You can also add plans yourself.
   - *What if I'm having an asthma attack?* Follow your action plan and call 911 in an emergency. Lobelia's help screen shows your plan and call buttons, but it doesn't contact anyone for you.
8. **Final call to action:** "Start with a one-minute check-in", with Sign up and Log in buttons.
9. **Footer:** disclaimer, Privacy, Send feedback.

"Try a preview" (a demo without an account) is feasible: a read-only Today screen built from the invented example data, with no backend calls. Effort: about half a day. Not in this pass unless Elena wants it.

## 6. Other pages (before → after)

| Page | Before | After |
|---|---|---|
| Header and nav (all) | 64px title, 4px-border nav pills | 28–32px page title, slim nav with an underline for the active page, help button kept |
| Check-in | 40px section titles in heavy boxed sections | 20px titles; three groups: *How you feel*, *Breathing*, *Anything else* (context, triggers, note) with light dividers in one card; Afacad save button |
| Calendar | big serif buttons, heavy borders | `PageHeader`, compact toolbar (sm buttons), 1px grid lines, plan chips in 13px |
| Statistics | large risk circle and big headings | outlook badge and explainer, charts in quiet cards, 20px section titles |
| Profile | many green 4px-border cards with big titles | a two-column card grid on desktop with 18px card titles: *About you*, *Asthma action plan*, *Support info*, *Contacts*, *Symptoms & triggers*, *Feedback* |
| Help flow | already clean | new type scale; keep layout and colors; Call 911 crimson, alert plum |
| Chat | squeezed panel | launcher plus side panel or sheet (see Today); 15px message text; suggested questions as chips |
| Setup | 40px question text | 22px questions, a progress bar, Afacad buttons |
| Login, signup, About, Privacy | huge title and slide-panel layout | on the new landing page, Log in and Sign up open a centred card form; Privacy uses body 16px with 22px headings |

## 7. Effort and order
1. Tokens, type scale, base element styles and `ui/` components, plus removing the duplicate Bootstrap: about 2–3h.
2. Landing page: about 3h.
3. Today: about 3h.
4. Check-in, Calendar, Statistics, Profile, Chat, Setup, Help and auth: about 4–5h total.

After each page: tests, lint, visual QA at 5 widths, and a commit.

**Safe before interviews:** steps 1–3. Each page is committed separately, so any page can be held back.

**Risks:** global type changes touch every page at once, so step 1 is followed immediately by a full visual-QA run.
