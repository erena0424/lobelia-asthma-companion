# Lobelia-asthma-companion

**A small companion for everyday reflection and easier access to support.**

Lobelia Asthma Companion is a lightweight web app being developed for a **BuildFest demo**. It explores how a friendly, character-guided experience can help adults living with asthma check in with themselves and find their saved support information in fewer steps.

Built on the existing Lobelia application, this demo focuses on one simple journey:

**Save a trusted contact → Complete a guided check-in → Access support information.**

[Project scope](SPEC.md) · [Implementation plan](IMPLEMENTATION_PLAN.md) · [Backend design](backend/SPEC.md)

## The Demo

The planned experience brings together three moments:

- **Keep someone close.** Save a trusted contact’s name and phone number, then retrieve those details when needed.
- **Take a moment to reflect.** Follow a short, voluntary check-in with a companion character, simple prompts, and optional notes.
- **Find support quickly.** Open “I need help” to view saved contacts, personal care goals, and accessibility needs without completing a check-in first.

An optional, explicitly approved check-in summary can carry context into a later session. Users remain in control of viewing, replacing, or deleting that summary.

Contact actions open the device’s phone handler where supported; the number also remains visible for manual use. The app does not automatically send alerts or confirm that a call connected.

## How the AI Companion Works

Meet Your AI Companion

A friendly place to talk about your day, share what is on your mind, and discuss your saved asthma forecast in everyday language.

- **Start with a personal greeting.** When you open the chat, your companion can bring up an upcoming saved plan or a dated forecast and invite you into the conversation. You can start chatting even if you have no saved plans or forecast.
- **Talk about everyday life.** Share a busy class schedule, an upcoming activity, or how you are feeling. The companion is designed to acknowledge what you say and offer brief, relevant encouragement.
- **Ask about your forecast.** Discuss the risk level and contributing factors in your latest saved forecast, with the forecast date kept clear. The companion explains the existing prediction; it does not assess your current symptoms.
- **Get replies that take your background into account.** Saved care goals, accessibility needs, known triggers, environment preferences, and an approved check-in summary can help make the conversation more relevant to you.
- **Continue the conversation naturally.** Ask a follow-up without repeating your previous message. The companion uses recent exchanges from the current chat, while a saved, approved summary can provide background in a later session.
- **Choose how it speaks to you.** Select **Warm** for friendly encouragement, **Calm** for a quieter tone, or **Direct** for concise replies. Use **Clear Chat** to start a fresh conversation, then request a new daily greeting.


## Project Structure

```text
lobelia-asthma-companion/
├── asthma-app/                 # Existing application
│   ├── frontend/               # React + Vite frontend
│   ├── api/                    # FastAPI endpoints
│   ├── services/               # Backend business logic
│   ├── db/                     # Database models and support
│   └── docs/                   # API and setup documentation
├── backend/                    # Backend adaptation specifications
│   └── SPEC.md
├── SPEC.md                     # Active product scope
├── IMPLEMENTATION_PLAN.md      # Implementation and verification status
└── LICENSE
```

The frontend lives in `asthma-app/frontend/`. The demo reuses the existing backend inside `asthma-app/`; `backend/` currently holds the adaptation specification rather than a separate server.
## Tech Stack

- **Frontend:** React, Vite, Bootstrap
- **Backend:** Python, FastAPI
- **Database:** PostgreSQL, with Alembic migrations

The companion’s help flow is designed to retrieve saved information without waiting for AI chat, weather data, or risk forecasts.

## Getting Started

```bash
git clone https://github.com/erena0424/lobelia-asthma-companion.git
cd lobelia-asthma-companion
```

For the LLM companion implementation, switch to its development branch:

```bash
git switch feature/companion-demo-backend
```

### Backend

**macOS / Linux**

```bash
cd asthma-app

# 1. Start PostgreSQL
docker compose up -d postgres

# 2. Python env + dependencies
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit keys as needed

# 3. Apply migrations (creates tables)
alembic upgrade head
# (same as: python scripts/init_db.py)

# 4. Run API
./run_api.sh
```

**Windows (PowerShell)**

```powershell
cd asthma-app

# 1. Start PostgreSQL
docker compose up -d postgres

# 2. Python env + dependencies
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # edit keys as needed

# 3. Apply migrations (creates tables)
alembic upgrade head
# (same as: python scripts/init_db.py)

# 4. Run API
$env:PYTHONPATH = (Get-Location).Path
uvicorn api.main:app --reload --app-dir . --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs for interactive API docs.

### Frontend

In a separate terminal, from the repository root:

```bash
cd asthma-app/frontend
npm install
npm run dev
```

Open the local URL printed in the terminal.


## Product Decisions: Forecast and Advice

Decisions made by Elena (founder) in October 2026, with the evidence behind them. Linear: LOB-50 to LOB-57.

### Decided

- **The Low/Medium/High flare forecast is being retired.** An audit found the XGBoost model (trained on AAMOS-00: 22 UK adults, 1,478 days) mostly repeats "tomorrow = today". For new people it scored about the same as that rule (AUC 0.82 vs 0.83) and labelled 111 of 115 new flares as Low. Adding recent history or weather did not fix this, and neither did the original AAMOS research models. See `asthma-app/scripts/audit_forecast_model.py` and `asthma-app/scripts/forecast_history_experiment.py`.
- **No retraining on check-in data for now.** There is not enough data yet. ML comes back only through the prediction roadmap gates:
  1. Log hidden predictions with consent.
  2. Retrain once there are 300 or more new flares across 100 or more people.
  3. Clinician and regulatory review.
- **Check-ins are a tracker, not model training data.** They feed symptoms and triggers into the AI tips and chat. The core goal is spotting personal patterns across repeated logs.
- **Copy describes patterns, never causes.** It says what the user logged, uses past tense and day counts, and avoids "your trigger" or "caused". There are no inline citations; a Sources page credits the US government sources.
- **Symptom labels** are No symptoms / Slight / Noticeable / Strong.
- **Fixed rules own safety.** The Help flow's zone and any escalation line come from code, never from the LLM. The LLM never picks a zone or a dose.
- **Inputs must be honest.** Missing data stays missing rather than shown as "Low". Dates are shown on any check-in the app refers to. Weather units are correct.

### Approved direction (screen plan pending, LOB-51)

- **Today's Focus uses fixed symptom tiers from code.** They are based on the last 3 calendar days of check-ins. A day counts as heavier when it has 3 or more rescue puffs, or night symptoms plus daytime symptoms plus limited activity together.
  - **Steady:** no fixed line.
  - **Some symptoms:** keep your rescue inhaler with you.
  - **Heavier on 2 of 3 days:** check your action plan.
  - **Heavier on 3 of 3 days, or worsening:** consider contacting your clinician.
  - **No recent check-in:** prompt to check in.
- **The LLM writes the tone, not the facts.** Code passes it the tier and any flagged weather values.
  - It explains a weather value only when code flags it.
  - It writes tips for calendar events when there are events.
  - Without events, the card shows a nudge to add them.
- **Weather flags** (clinical-advisor literature read; heuristic cut-offs need a real clinician's sign-off):
  - **Air quality:** flagged for everyone at US AQI 101 or above.
  - **Pollen, cold and big temperature drops:** flagged only for users who mark them as bothersome. Pollen uses NAB "High". Cold is 32°F or below. A big drop is about 14°F colder than yesterday.
  - **Humidity:** shown as a plain number in Today's Outlook (LOB-56), with no warning attached.
  - **Pressure and wind:** not used.
- **AI advice should teach concrete self-management techniques** from the allowlisted public sources (LOB-57).

Evidence: the forecast audit and prediction roadmap docs (linked from LOB-50), plus the clinical-advisor memos in `artifacts/eng/` (2026-10-17). These are literature reads by an AI agent, not a clinician's sign-off.

## Development Status

This project is an **in-progress BuildFest demo**. The `feature/companion-demo-backend` branch includes LLM-powered chat and opening-message endpoints, contextual reply generation, and configurable conversational tones. The default branch currently documents a narrower contact, reflection, and support flow.

This README describes the companion direction, including that branch's AI functionality. Implementation in source does not establish that the complete demo has been deployed or rehearsed. See the [implementation plan](IMPLEMENTATION_PLAN.md) and [backend setup guide](asthma-app/docs/BUILDFEST_BACKEND_SETUP.md) on the branch you are using for integration and verification details.

## Inspiration & Credits

This project builds on [Lobelia](https://github.com/Lobelia-Mirror-Lake/Lobelia) and its exploration of everyday asthma self-management, narrowing the BuildFest experience to approachable reflection and access to personal support information.

Existing code, asset, and font credits are retained. Companion character attribution should be confirmed when the supplied artwork is integrated.

## Disclaimer

This is a demonstration prototype, not a medical device or a substitute for professional medical advice or an asthma action plan. It does not diagnose or assess asthma attacks, provide treatment instructions, continuously monitor users, or dispatch emergency help.

## License

Released under the [MIT License](LICENSE). Existing copyright notices and separate asset and font licenses continue to apply.



