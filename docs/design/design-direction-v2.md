# Lobelia design direction v2 (proposal, not implemented)

Goal: a calm, refined consumer wellness app. Not a dashboard, not a clinical portal, not an "AI app". Hierarchy comes from type, spacing and alignment, not from boxes.

Unchanged: every feature, the Help flow and its rules, API calls, the risk thresholds, and the palette (cream, teal, sage, restrained pink/plum).

## What's wrong now (v1)
- **The outlook dominates.** A solid dark-teal card (`.today-outlook`) is the heaviest thing on screen.
- **The font feels childish.** Afacad has round shapes at 600–700 weight, and Abril Fatface still appears in places.
- **Too many shapes.** Cards inside cards (`.today-card`, `.today-guidance`, `.today-summary`), pill badges, factor chips, a bordered help row, and green cards on Profile.
- **The navigation looks like a prototype.** A full-width segmented bar (`.dashboard-navbar`) with 4px-border pills.
- **Advice repeats.** The outlook "Suggestion" (forecast `advice.summary`) and the day plan's `summary` say similar things, and both overlap the event tips.
- **The 2:1 grid looks unbalanced.** The right column holds one small card, leaving a tall empty strip.

## 1. Typography
Two candidate pairings. Both are open-source (OFL) and would be self-hosted as woff2 files, about 150–250 KB. Downloading them needs your OK. The fallback is the system font stack.

| | A: recommended | B |
|---|---|---|
| Sans (all UI) | **Instrument Sans**: warm grotesque, slightly narrow, calm, clearly not "techy" | **Hanken Grotesk**: neutral and friendly, very readable at small sizes |
| Serif (accent) | **Instrument Serif**: elegant and low-contrast, made to pair with Instrument Sans | **Newsreader**: editorial, optical sizes, soft |
| Why | One family voice, distinctive without being cute, light at 400/500 | A bit more "wellness journal"; safer for long text |

Rules:
- **Weights:** 400 (body) and 500 (titles, buttons). 600 only for 12–13px labels. Nothing bolder.
- **Abril Fatface:** the "Lobelia" wordmark only.
- **Libre Bodoni:** retired. Afacad: removed.
- **Serif is used for:** page titles, the greeting, the outlook sentence, and the landing headline. Never for buttons or labels.

Scale (px / line-height / letter-spacing):

| Role | Font | Desktop | Mobile |
|---|---|---|---|
| Landing headline | serif 400 | 56/1.05/-0.01em | 40 |
| Page title / greeting | serif 400 | 34/1.15 | 28 |
| Outlook sentence | serif 400 | 24/1.35 | 21 |
| Section label | sans 500, uppercase | 12/1.4/+0.08em | same |
| Item title | sans 500 | 16/1.4 | same |
| Body | sans 400 | 16/1.6 | same |
| Secondary / meta | sans 400, muted | 14/1.5 | same |
| Times / numbers | sans 400, tabular-nums | 14 | same |

## 2. Color usage
- **Base:** cream #FFFBF2, about 85% of every screen. White is used only for the inside of form inputs and pop-ups.
- **Teal #18403F:** text, primary buttons, links, and the active-nav underline. No large teal surfaces, except possibly the landing footer.
- **Muted text:** teal mixed toward cream, about #4F6B68, aiming for ≥5:1 (checked when implemented).
- **Sage #D1DFAD / #A3B478:** hairline dividers (sage-tinted #E3E5D6), the "next" marker, selected inputs, and the Low dot.
- **Pink/plum:** one accent only:
  - the "Trouble breathing?" entry (plum text #5F0024 on a faint pink tint)
  - the flower artwork
- **Crimson #AA0041:** Call 911 only.
- **Status:** shown as a small dot plus a word ("● Medium"). No filled pills.
  - Low: sage dot
  - Medium: amber #9A5B00 dot
  - High: crimson dot
- **Rough proportions:** cream 85%, teal ink and accents 10%, sage 4%, pink ≤1%.

## 3. Containers on Today: removed or kept
| Element now | v2 |
|---|---|
| Dark outlook card | **Removed.** Plain text block on cream |
| Level pill badge | dot plus word |
| Factor chips | one quiet text row: "Pollen moderate · Air good · 68°F" |
| "Suggestion" box (`.today-guidance`) | removed; general guidance goes behind a "Ways to prepare today" disclosure link |
| "Your day" card border and shadow | removed; a section label plus a timeline |
| Morning summary box (`.today-summary`) | **removed** (repeats the outlook) |
| "Next" pill tag | small sage dot and the word "Next" in muted text |
| Check-in and inhaler side card | an inline actions row under the outlook |
| Event row borders | hairline dividers only between items |
| Buttons | 40px tall, radius 10, sans 500. Primary is filled teal; secondary is a text button with an underline on hover |

Cards stay only where they group form inputs: pop-ups, the check-in form, and the Help steps.

## 4. Navigation
**Desktop (≥768px):** a 56px cream bar with a hairline bottom border.
```
Lobelia      Today  Check in  Calendar  Insights  Profile        Trouble breathing?   (●)
             ─────
```
- The wordmark is Abril at 22px.
- Links are sans 500 at 15px, with a 2px teal underline on the active page.
- "Trouble breathing?" is a small plum text button on a faint pink tint, and is always present.
- (●) is the avatar, with a menu containing Profile, Send feedback, Privacy and Log out.
- "Statistics" is renamed "Insights" (label only).

**Mobile:**
- Top bar: wordmark, "Trouble breathing?" (compact), avatar.
- Bottom tab bar: 5 items, each with an icon and a label (Today, Check in, Calendar, Insights, Profile). It's 64px tall, with icons from the existing `react-bootstrap-icons` package.
- The chat launcher sits above the tab bar, on the right, and never covers a control.

## 5. Today content model
- **Outlook = general conditions only:**
  - level: `forecast.risk_level` → dot + word
  - one serif sentence written from `contributing_factors` + `day-plan.environment` ("Moderate pollen and a cool evening; the air is clean.")
  - a readout row: pollen, AQI band, temperature
  - the estimate footnote
- **General guidance** (`forecast.advice.summary` / `sections`) moves behind "Ways to prepare today ↓". It's kept but not repeated.
- **Day plan `summary`:** no longer displayed. It duplicated the outlook.
- **Specific advice** appears only on the schedule items (`day-plan.events[].tip`).
- **Actions row:** "Check in" (primary) · "Log rescue inhaler" (text button, "0 today") · "Add a plan" (text button).

## 6. Composition
A single editorial column, max 680px, centred. Reasons: Today is a short daily briefing read top to bottom, a column is calm and journal-like, and it removes the unbalanced 2:1 grid. Very wide screens just get more cream margin.

Desktop:
```
                 Wednesday, October 14
                 Good afternoon, Sam                       (serif 34)

                 TODAY'S OUTLOOK
                 ● Medium
                 Moderate pollen and a cool evening;
                 the air is clean.                         (serif 24)
                 Pollen moderate · Air good · 68°F
                 Estimate, not a diagnosis · Ways to prepare today ↓

                 [ Check in ]   Log rescue inhaler (0 today)   + Add a plan

                 YOUR DAY ─────────────────────────────────────
                 10:00   Lecture
                         A calm start; keep your inhaler in your bag.
                 2:30  ● Chemistry lab                     Next
                         Strong scents and fumes can bother breathing.
                 5:00    Skating
                         Cold air can be a trigger; a scarf may help.
```
Mobile: the same order, with 16px side margins and the bottom tab bar.

## 7. Other pages (same rules)
- **Check-in:** one column with section labels and hairline dividers instead of 5 boxed cards. Faces and sliders stay.
- **Calendar:** remove the outer green card; hairline grid lines; plan chips become plain text blocks with a teal left rule.
- **Insights (Statistics):** a title, the outlook in text form, and charts on cream with hairline axes.
- **Profile:** settings-style rows (label on the left, value on the right) grouped under section labels; the action plan's zones get a coloured left rule, not filled boxes.
- **Help flow:** the structure is unchanged; it adopts the new type and buttons; Call 911 stays crimson.
- **Landing and auth:** new fonts; fewer bordered feature boxes, replaced by columns separated by whitespace.
- **Chat:** a small launcher; the panel is cream with hairline separators; messages in plain text blocks rather than bubbles; still no "AI" styling.

## 8. Avoid (anti-cliché list)
Gradients, glows, sparkles or "✨" icons, purple or neon, robot or brain imagery, typing-dots theatre, glassmorphism, big drop shadows, pill overload, emoji as UI, and "AI-powered" labels on screens. Intelligence shows up as useful, specific tips.

## 9. Effort and order (after approval)
1. Fonts and tokens: ~1h, plus your OK to self-host the font files.
2. Navigation: ~2h.
3. Today: ~3h.
4. Other pages: ~4–6h.

Each step gets tests, lint, visual QA at 5 widths, a commit, and screenshots sent to you. A static HTML mockup of Today (both pairings) can be made first if you'd like to compare before committing (~1h).
